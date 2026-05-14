import type { PostureMetrics, PostureResult, SelectedSide, SideMode } from "@/lib/types";

type Landmark = {
  x: number;
  y: number;
  visibility?: number;
};

const LANDMARKS = {
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

const SMOOTHING_WINDOW = 12;
const STABILITY_WINDOW = 30;
const SIDE_UNAVAILABLE_MESSAGE = "옆모습이 잘 보이지 않습니다. 카메라 위치를 조정해주세요.";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function isVisible(landmark: Landmark | undefined) {
  return Boolean(landmark && (landmark.visibility ?? 1) > 0.42);
}

function visibilityScore(points: Array<Landmark | undefined>) {
  if (points.some((point) => !isVisible(point))) {
    return 0;
  }

  return points.reduce((sum, point) => sum + (point?.visibility ?? 1), 0) / points.length;
}

function angleFromVertical(topPoint: Landmark, bottomPoint: Landmark) {
  return Math.abs(toDegrees(Math.atan2(topPoint.x - bottomPoint.x, bottomPoint.y - topPoint.y)));
}

function estimateNeckLoadKg(angle: number) {
  const points = [
    { angle: 0, load: 5 },
    { angle: 15, load: 12.2 },
    { angle: 30, load: 18.1 },
    { angle: 45, load: 22.2 },
    { angle: 60, load: 27.2 },
  ];

  if (angle <= 0) {
    return points[0].load;
  }
  if (angle >= 60) {
    return 27.2 + (angle - 60) * 0.12;
  }

  const upperIndex = points.findIndex((point) => angle <= point.angle);
  const upper = points[upperIndex];
  const lower = points[upperIndex - 1];
  const ratio = (angle - lower.angle) / (upper.angle - lower.angle);
  return lower.load + (upper.load - lower.load) * ratio;
}

function scoreNeck(angle: number) {
  if (angle <= 10) {
    return 100;
  }
  if (angle <= 20) {
    return 85;
  }
  if (angle <= 35) {
    return 70;
  }
  if (angle <= 50) {
    return 50;
  }
  return 30;
}

function scoreTrunk(angle: number) {
  if (angle <= 5) {
    return 100;
  }
  if (angle <= 12) {
    return 80;
  }
  if (angle <= 20) {
    return 60;
  }
  return 35;
}

function scoreStability(movement: number) {
  if (movement < 0.012) {
    return 100;
  }
  if (movement < 0.025) {
    return 80;
  }
  return 60;
}

function describeNeck(angle: number) {
  if (angle <= 10) {
    return "정상";
  }
  if (angle <= 20) {
    return "주의";
  }
  if (angle <= 35) {
    return "경고";
  }
  if (angle <= 50) {
    return "위험";
  }
  return "매우 위험";
}

function describeTrunk(angle: number) {
  if (angle <= 5) {
    return "정상";
  }
  if (angle <= 12) {
    return "주의";
  }
  if (angle <= 20) {
    return "경고";
  }
  return "위험";
}

function describeStability(score: number) {
  if (score >= 100) {
    return "안정";
  }
  if (score >= 80) {
    return "보통";
  }
  return "불안정";
}

function neckFeedback(angle: number) {
  if (angle <= 10) {
    return "목 자세가 안정적입니다.";
  }
  if (angle <= 20) {
    return "목이 약간 앞으로 나와 있습니다.";
  }
  if (angle <= 35) {
    return "목이 앞으로 많이 나와 있습니다.";
  }
  return "목에 가해지는 하중이 큰 상태입니다.";
}

function trunkFeedback(angle: number) {
  if (angle <= 5) {
    return "허리와 상체가 안정적으로 세워져 있습니다.";
  }
  if (angle <= 12) {
    return "상체가 조금 앞으로 기울어져 있습니다.";
  }
  if (angle <= 20) {
    return "상체가 앞으로 기울어져 있습니다.";
  }
  return "허리 부담이 큰 자세입니다.";
}

export class PostureAnalyzer {
  private metricHistory: PostureMetrics[] = [];
  private motionHistory: number[] = [];
  private previousCenter: { x: number; y: number } | null = null;
  private preferredSideMode: SideMode = "auto";

  setPreferredSideMode(mode: SideMode) {
    this.preferredSideMode = mode;
  }

  reset() {
    this.metricHistory = [];
    this.motionHistory = [];
    this.previousCenter = null;
  }

  analyze(landmarks?: Landmark[] | null, preferredSideMode = this.preferredSideMode): PostureResult {
    this.preferredSideMode = preferredSideMode;

    if (!landmarks?.length) {
      return this.createUnavailableResult("카메라가 사용자의 옆모습을 볼 수 있도록 앉아주세요.");
    }

    const side = this.selectSide(landmarks, preferredSideMode);
    if (!side) {
      return this.createUnavailableResult(SIDE_UNAVAILABLE_MESSAGE);
    }

    const ear = landmarks[side === "left" ? LANDMARKS.LEFT_EAR : LANDMARKS.RIGHT_EAR];
    const shoulder = landmarks[side === "left" ? LANDMARKS.LEFT_SHOULDER : LANDMARKS.RIGHT_SHOULDER];
    const hip = landmarks[side === "left" ? LANDMARKS.LEFT_HIP : LANDMARKS.RIGHT_HIP];

    if (!isVisible(ear) || !isVisible(shoulder) || !isVisible(hip)) {
      return this.createUnavailableResult(SIDE_UNAVAILABLE_MESSAGE);
    }

    const neckAngleDegrees = angleFromVertical(ear as Landmark, shoulder as Landmark);
    const trunkLeanDegrees = angleFromVertical(shoulder as Landmark, hip as Landmark);
    const center = {
      x: ((ear as Landmark).x + (shoulder as Landmark).x + (hip as Landmark).x) / 3,
      y: ((ear as Landmark).y + (shoulder as Landmark).y + (hip as Landmark).y) / 3,
    };
    const movement = this.previousCenter
      ? Math.hypot(center.x - this.previousCenter.x, center.y - this.previousCenter.y)
      : 0;
    this.previousCenter = center;
    this.pushMotion(movement);

    const stabilityAverage =
      this.motionHistory.reduce((sum, value) => sum + value, 0) / (this.motionHistory.length || 1);
    const neckScore = scoreNeck(neckAngleDegrees);
    const trunkScore = scoreTrunk(trunkLeanDegrees);
    const stabilityScore = scoreStability(stabilityAverage);

    const rawMetrics: PostureMetrics = {
      neckForwardOffset: Math.abs((ear as Landmark).x - (shoulder as Landmark).x),
      torsoTiltDegrees: trunkLeanDegrees,
      stabilityAverage,
      neckAngleDegrees,
      estimatedNeckLoadKg: estimateNeckLoadKg(neckAngleDegrees),
      trunkLeanDegrees,
      neckScore,
      trunkScore,
      stabilityScore,
      selectedSide: side,
    };

    this.pushMetrics(rawMetrics);
    const metrics = this.averageMetrics();
    const score = Math.round(
      metrics.neckScore * 0.55 + metrics.trunkScore * 0.3 + metrics.stabilityScore * 0.15
    );
    const mainIssue = this.pickMainIssue(metrics);

    return {
      score,
      neckStatus: describeNeck(metrics.neckAngleDegrees),
      torsoStatus: describeTrunk(metrics.trunkLeanDegrees),
      stabilityStatus: describeStability(metrics.stabilityScore),
      feedbackMessage: this.composeFeedback(metrics, mainIssue),
      isBadPosture: score <= 60,
      isTracking: true,
      mainIssue,
      metrics,
    };
  }

  private selectSide(landmarks: Landmark[], preferredSideMode: SideMode): SelectedSide | null {
    const leftScore = visibilityScore([
      landmarks[LANDMARKS.LEFT_EAR],
      landmarks[LANDMARKS.LEFT_SHOULDER],
      landmarks[LANDMARKS.LEFT_HIP],
    ]);
    const rightScore = visibilityScore([
      landmarks[LANDMARKS.RIGHT_EAR],
      landmarks[LANDMARKS.RIGHT_SHOULDER],
      landmarks[LANDMARKS.RIGHT_HIP],
    ]);

    if (preferredSideMode === "left") {
      return leftScore > 0 ? "left" : null;
    }
    if (preferredSideMode === "right") {
      return rightScore > 0 ? "right" : null;
    }
    if (leftScore === 0 && rightScore === 0) {
      return null;
    }
    return leftScore >= rightScore ? "left" : "right";
  }

  private createUnavailableResult(message: string): PostureResult {
    return {
      score: null,
      neckStatus: "미측정",
      torsoStatus: "미측정",
      stabilityStatus: "미측정",
      feedbackMessage: message,
      isBadPosture: false,
      isTracking: false,
      mainIssue: "tracking",
      metrics: null,
    };
  }

  private pushMetrics(metrics: PostureMetrics) {
    this.metricHistory.push(metrics);
    if (this.metricHistory.length > SMOOTHING_WINDOW) {
      this.metricHistory.shift();
    }
  }

  private pushMotion(movement: number) {
    this.motionHistory.push(movement);
    if (this.motionHistory.length > STABILITY_WINDOW) {
      this.motionHistory.shift();
    }
  }

  private averageMetrics(): PostureMetrics {
    const totals = this.metricHistory.reduce(
      (acc, current) => {
        acc.neckForwardOffset += current.neckForwardOffset;
        acc.torsoTiltDegrees += current.torsoTiltDegrees;
        acc.stabilityAverage += current.stabilityAverage;
        acc.neckAngleDegrees += current.neckAngleDegrees;
        acc.estimatedNeckLoadKg += current.estimatedNeckLoadKg;
        acc.trunkLeanDegrees += current.trunkLeanDegrees;
        acc.neckScore += current.neckScore;
        acc.trunkScore += current.trunkScore;
        acc.stabilityScore += current.stabilityScore;
        return acc;
      },
      {
        neckForwardOffset: 0,
        torsoTiltDegrees: 0,
        stabilityAverage: 0,
        neckAngleDegrees: 0,
        estimatedNeckLoadKg: 0,
        trunkLeanDegrees: 0,
        neckScore: 0,
        trunkScore: 0,
        stabilityScore: 0,
      }
    );

    const count = this.metricHistory.length || 1;
    const latestSide = this.metricHistory[this.metricHistory.length - 1]?.selectedSide ?? "left";
    return {
      neckForwardOffset: totals.neckForwardOffset / count,
      torsoTiltDegrees: totals.torsoTiltDegrees / count,
      stabilityAverage: totals.stabilityAverage / count,
      neckAngleDegrees: totals.neckAngleDegrees / count,
      estimatedNeckLoadKg: totals.estimatedNeckLoadKg / count,
      trunkLeanDegrees: totals.trunkLeanDegrees / count,
      neckScore: totals.neckScore / count,
      trunkScore: totals.trunkScore / count,
      stabilityScore: totals.stabilityScore / count,
      selectedSide: latestSide,
    };
  }

  private pickMainIssue(metrics: PostureMetrics): PostureResult["mainIssue"] {
    if (metrics.neckScore >= 85 && metrics.trunkScore >= 80) {
      return "balanced";
    }
    if (metrics.neckScore <= metrics.trunkScore) {
      return "neck";
    }
    return "torso";
  }

  private composeFeedback(metrics: PostureMetrics, mainIssue: PostureResult["mainIssue"]) {
    if (mainIssue === "neck") {
      return neckFeedback(metrics.neckAngleDegrees);
    }
    if (mainIssue === "torso") {
      return trunkFeedback(metrics.trunkLeanDegrees);
    }
    return "자세가 안정적으로 유지되고 있습니다.";
  }
}