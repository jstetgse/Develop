import type {
  PostureAreaStats,
  PostureRecommendationArea,
  PostureResult,
  SessionSummary,
} from "@/lib/types";

export type StretchPriorityLabel = "높음" | "보통" | "낮음";
export type StretchRecommendationSource = "history" | "current" | "maintenance" | "none";

export interface StretchRecommendation {
  stretchId: string;
  priorityScore: number;
  priorityLabel: StretchPriorityLabel;
  reasons: string[];
  source: StretchRecommendationSource;
}

export interface StretchRecommendationResult {
  recommendations: StretchRecommendation[];
  message: string | null;
  source: StretchRecommendationSource;
}

type AreaConfig = {
  threshold: number;
  currentIssueMessage: string;
  frequentLowMessage: string;
  lowAverageMessage: string;
  stretchIds: string[];
};

const AREA_CONFIG: Record<PostureRecommendationArea, AreaConfig> = {
  neck: {
    threshold: 85,
    currentIssueMessage: "오늘 목 자세 문제가 감지되었습니다.",
    frequentLowMessage: "최근 목 점수가 자주 낮았습니다.",
    lowAverageMessage: "최근 목 평균 점수가 낮았습니다.",
    stretchIds: ["neck-stretch"],
  },
  torso: {
    threshold: 80,
    currentIssueMessage: "오늘 상체 기울기 문제가 감지되었습니다.",
    frequentLowMessage: "최근 상체 점수가 자주 낮았습니다.",
    lowAverageMessage: "최근 상체 평균 점수가 낮았습니다.",
    stretchIds: ["shoulder-stretch", "back-stretch"],
  },
  stability: {
    threshold: 75,
    currentIssueMessage: "오늘 자세 안정성 문제가 감지되었습니다.",
    frequentLowMessage: "최근 자세 안정성 점수가 자주 낮았습니다.",
    lowAverageMessage: "최근 자세 안정성 평균 점수가 낮았습니다.",
    stretchIds: ["back-stretch", "shoulder-stretch"],
  },
};

const MAINTENANCE_RECOMMENDATIONS = [
  "neck-stretch",
  "back-stretch",
  "shoulder-stretch",
  "wrist-stretch",
  "leg-stretch",
];

function getAreaScore(posture: PostureResult, area: PostureRecommendationArea) {
  if (!posture.isTracking || !posture.metrics) {
    return null;
  }
  if (area === "neck") {
    return posture.metrics.neckScore;
  }
  if (area === "torso") {
    return posture.metrics.trunkScore;
  }
  return posture.metrics.stabilityScore;
}

function getPriorityLabel(score: number): StretchPriorityLabel {
  if (score >= 5) {
    return "높음";
  }
  if (score >= 3) {
    return "보통";
  }
  return "낮음";
}

function addReason(reasons: string[], reason: string) {
  if (reasons.length < 2 && !reasons.includes(reason)) {
    reasons.push(reason);
  }
}

function mergeAreaStats(sessions: SessionSummary[]): Partial<PostureAreaStats> {
  const totals: Record<PostureRecommendationArea, { lowCount: number; totalCount: number; scoreTotal: number }> = {
    neck: { lowCount: 0, totalCount: 0, scoreTotal: 0 },
    torso: { lowCount: 0, totalCount: 0, scoreTotal: 0 },
    stability: { lowCount: 0, totalCount: 0, scoreTotal: 0 },
  };

  for (const session of sessions) {
    for (const area of Object.keys(AREA_CONFIG) as PostureRecommendationArea[]) {
      const stat = session.postureAreaStats?.[area];
      if (!stat || stat.totalCount <= 0 || typeof stat.averageScore !== "number") {
        continue;
      }
      totals[area].lowCount += Math.max(0, stat.lowCount);
      totals[area].totalCount += stat.totalCount;
      totals[area].scoreTotal += stat.averageScore * stat.totalCount;
    }
  }

  return Object.fromEntries(
    (Object.keys(totals) as PostureRecommendationArea[])
      .filter((area) => totals[area].totalCount > 0)
      .map((area) => [
        area,
        {
          lowCount: totals[area].lowCount,
          totalCount: totals[area].totalCount,
          averageScore: Math.round(totals[area].scoreTotal / totals[area].totalCount),
        },
      ])
  ) as Partial<PostureAreaStats>;
}

export function calculateStretchRecommendations({
  currentPosture,
  recentSessions,
}: {
  currentPosture: PostureResult;
  recentSessions: SessionSummary[];
}): StretchRecommendationResult {
  const mergedStats = mergeAreaStats(recentSessions);
  const hasHistoryStats = Object.keys(mergedStats).length > 0;
  const hasCurrentPosture = Boolean(currentPosture.isTracking && currentPosture.metrics);
  const recommendationMap = new Map<string, StretchRecommendation>();

  const addRecommendationScore = (stretchId: string, score: number, reasons: string[], source: StretchRecommendationSource) => {
    const current = recommendationMap.get(stretchId);
    if (!current) {
      recommendationMap.set(stretchId, {
        stretchId,
        priorityScore: score,
        priorityLabel: getPriorityLabel(score),
        reasons: reasons.slice(0, 2),
        source,
      });
      return;
    }

    current.priorityScore += score;
    current.priorityLabel = getPriorityLabel(current.priorityScore);
    current.source = current.source === "history" || source === "history" ? "history" : source;
    for (const reason of reasons) {
      addReason(current.reasons, reason);
    }
  };

  for (const area of Object.keys(AREA_CONFIG) as PostureRecommendationArea[]) {
    const config = AREA_CONFIG[area];
    const reasons: string[] = [];
    let score = 0;
    const currentScore = getAreaScore(currentPosture, area);
    const isCurrentIssue = currentPosture.mainIssue === area || (typeof currentScore === "number" && currentScore < config.threshold);
    const historyStat = mergedStats[area];
    const lowFrequency =
      historyStat && historyStat.totalCount > 0 ? historyStat.lowCount / historyStat.totalCount : 0;

    if (isCurrentIssue) {
      score += 3;
      addReason(reasons, config.currentIssueMessage);
    }
    if (lowFrequency >= 0.35) {
      score += 2;
      addReason(reasons, config.frequentLowMessage);
    }
    if (historyStat?.averageScore !== null && typeof historyStat?.averageScore === "number" && historyStat.averageScore < config.threshold) {
      score += 1;
      addReason(reasons, config.lowAverageMessage);
    }

    if (score > 0) {
      const source: StretchRecommendationSource = hasHistoryStats ? "history" : "current";
      for (const stretchId of config.stretchIds) {
        addRecommendationScore(stretchId, score, reasons, source);
      }
    }
  }

  const recommendations = [...recommendationMap.values()]
    .map((recommendation) => ({
      ...recommendation,
      priorityLabel: getPriorityLabel(recommendation.priorityScore),
      reasons: recommendation.reasons.slice(0, 2),
    }))
    .sort((left, right) => {
      if (right.priorityScore !== left.priorityScore) {
        return right.priorityScore - left.priorityScore;
      }
      return MAINTENANCE_RECOMMENDATIONS.indexOf(left.stretchId) - MAINTENANCE_RECOMMENDATIONS.indexOf(right.stretchId);
    });

  if (recommendations.length > 0) {
    return {
      recommendations,
      message: hasHistoryStats ? null : "최근 분석 결과를 기준으로 추천합니다.",
      source: hasHistoryStats ? "history" : "current",
    };
  }

  if (hasCurrentPosture || hasHistoryStats) {
    return {
      recommendations: MAINTENANCE_RECOMMENDATIONS.slice(0, 3).map((stretchId) => ({
        stretchId,
        priorityScore: 1,
        priorityLabel: "낮음",
        reasons: ["현재 자세 점수가 안정적입니다.", "가벼운 유지 스트레칭을 추천합니다."],
        source: "maintenance",
      })),
      message: hasHistoryStats ? null : "최근 분석 결과를 기준으로 추천합니다.",
      source: "maintenance",
    };
  }

  return {
    recommendations: [],
    message: "자세 분석을 먼저 진행하면 맞춤 스트레칭을 추천받을 수 있습니다.",
    source: "none",
  };
}
