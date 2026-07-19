import type { StretchStep } from "@/lib/types";
import type { Landmark } from "@/components/posture-coach/mediapipe/mediapipe-types";

type GuideJoint =
  | "head"
  | "neck"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle";

type GuidePose = Partial<Record<GuideJoint, { x: number; y: number }>>;

const GUIDE_CONNECTIONS: Array<[GuideJoint, GuideJoint]> = [
  ["head", "neck"],
  ["neck", "leftShoulder"],
  ["neck", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"],
];


function visibleLandmark(landmark: Landmark | undefined, minVisibility = 0.35) {
  return Boolean(landmark && (landmark.visibility ?? 1) >= minVisibility);
}

function midpoint(a: Landmark, b: Landmark) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function getGuideBodyFrame(landmarks?: Landmark[] | null) {
  const leftShoulder = landmarks?.[11];
  const rightShoulder = landmarks?.[12];
  const leftHip = landmarks?.[23];
  const rightHip = landmarks?.[24];

  if (
    visibleLandmark(leftShoulder) &&
    visibleLandmark(rightShoulder) &&
    visibleLandmark(leftHip) &&
    visibleLandmark(rightHip) &&
    leftShoulder &&
    rightShoulder &&
    leftHip &&
    rightHip
  ) {
    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    const hipCenter = midpoint(leftHip, rightHip);
    const shoulderWidth = Math.max(Math.abs(leftShoulder.x - rightShoulder.x), 0.12);
    const torsoLength = Math.max(Math.hypot(shoulderCenter.x - hipCenter.x, shoulderCenter.y - hipCenter.y), 0.18);
    return {
      isDetected: true,
      shoulderCenter,
      shoulderWidth,
      torsoLength,
    };
  }

  return {
    isDetected: false,
    shoulderCenter: { x: 0.5, y: 0.36 },
    shoulderWidth: 0.22,
    torsoLength: 0.28,
  };
}

function createBaseGuidePose(): GuidePose {
  return {
    head: { x: 0, y: -0.48 },
    neck: { x: 0, y: -0.1 },
    leftShoulder: { x: -0.5, y: 0 },
    rightShoulder: { x: 0.5, y: 0 },
    leftElbow: { x: -0.72, y: 0.55 },
    rightElbow: { x: 0.72, y: 0.55 },
    leftWrist: { x: -0.76, y: 1.12 },
    rightWrist: { x: 0.76, y: 1.12 },
    leftHip: { x: -0.36, y: 1 },
    rightHip: { x: 0.36, y: 1 },
    leftKnee: { x: -0.34, y: 1.92 },
    rightKnee: { x: 0.34, y: 1.92 },
    leftAnkle: { x: -0.34, y: 2.72 },
    rightAnkle: { x: 0.34, y: 2.72 },
  };
}

function getGuidePoseTemplate(checkType: StretchStep["checkType"]): GuidePose {
  const pose = createBaseGuidePose();
  switch (checkType) {
    case "neck-side-pull":
      pose.head = { x: -0.28, y: -0.42 };
      pose.leftElbow = { x: -0.48, y: -0.48 };
      pose.leftWrist = { x: -0.18, y: -0.66 };
      break;
    case "neck-forward-pull":
      pose.head = { x: 0, y: -0.26 };
      pose.leftElbow = { x: -0.52, y: -0.34 };
      pose.rightElbow = { x: 0.52, y: -0.34 };
      pose.leftWrist = { x: -0.14, y: -0.46 };
      pose.rightWrist = { x: 0.14, y: -0.46 };
      break;
    case "neck-back-tilt":
      pose.head = { x: 0, y: -0.68 };
      pose.leftWrist = { x: -0.08, y: -0.34 };
      pose.rightWrist = { x: 0.08, y: -0.34 };
      break;
    case "neck-circle":
      pose.head = { x: 0.2, y: -0.54 };
      break;
    case "shoulder-roll":
      pose.leftElbow = { x: -0.72, y: -0.06 };
      pose.rightElbow = { x: 0.72, y: -0.06 };
      pose.leftWrist = { x: -0.5, y: 0.02 };
      pose.rightWrist = { x: 0.5, y: 0.02 };
      break;
    case "shoulder-cross":
      pose.leftElbow = { x: 0.05, y: 0.12 };
      pose.leftWrist = { x: 0.62, y: 0.08 };
      break;
    case "shoulder-overhead":
      pose.leftElbow = { x: -0.18, y: -0.58 };
      pose.leftWrist = { x: 0.12, y: -0.88 };
      break;
    case "shoulder-chest-open":
      pose.head = { x: 0, y: -0.78 };
      pose.leftElbow = { x: -0.74, y: 0.72 };
      pose.rightElbow = { x: 0.74, y: 0.72 };
      pose.leftWrist = { x: -0.16, y: 0.98 };
      pose.rightWrist = { x: 0.16, y: 0.98 };
      break;
    case "wrist-roll":
    case "wrist-back-press":
    case "wrist-open-close":
      pose.leftElbow = { x: -0.36, y: 0.34 };
      pose.rightElbow = { x: 0.36, y: 0.34 };
      pose.leftWrist = { x: -0.1, y: 0.46 };
      pose.rightWrist = { x: 0.1, y: 0.46 };
      break;
    case "wrist-pull":
      pose.leftElbow = { x: -0.12, y: 0.36 };
      pose.leftWrist = { x: 0.52, y: 0.36 };
      pose.rightElbow = { x: 0.52, y: 0.34 };
      pose.rightWrist = { x: 0.2, y: 0.34 };
      break;
    case "back-side":
      pose.leftShoulder = { x: -0.68, y: 0.06 };
      pose.rightShoulder = { x: 0.32, y: -0.06 };
      pose.leftHip = { x: -0.34, y: 1 };
      pose.rightHip = { x: 0.42, y: 1 };
      pose.leftElbow = { x: -0.58, y: -0.72 };
      pose.rightElbow = { x: -0.1, y: -0.9 };
      pose.leftWrist = { x: -0.3, y: -1.05 };
      pose.rightWrist = { x: -0.18, y: -1.08 };
      break;
    case "back-forward-reach":
      pose.head = { x: 0, y: 0.02 };
      pose.leftShoulder = { x: -0.42, y: 0.2 };
      pose.rightShoulder = { x: 0.42, y: 0.2 };
      pose.leftElbow = { x: -0.3, y: 0.7 };
      pose.rightElbow = { x: 0.3, y: 0.7 };
      pose.leftWrist = { x: -0.24, y: 1.14 };
      pose.rightWrist = { x: 0.24, y: 1.14 };
      break;
    case "back-twist":
      pose.leftShoulder = { x: -0.64, y: 0.02 };
      pose.rightShoulder = { x: 0.28, y: -0.02 };
      pose.leftWrist = { x: -0.64, y: 0.74 };
      pose.rightWrist = { x: 0.24, y: 1 };
      break;
    case "back-hip-circle":
      pose.leftKnee = { x: -0.48, y: 1.72 };
      pose.rightKnee = { x: 0.48, y: 1.72 };
      pose.leftAnkle = { x: -0.62, y: 2.48 };
      pose.rightAnkle = { x: 0.62, y: 2.48 };
      pose.leftShoulder = { x: -0.56, y: 0.08 };
      pose.rightShoulder = { x: 0.42, y: -0.02 };
      break;
    case "leg-forward-fold":
      pose.head = { x: 0, y: 0.52 };
      pose.leftShoulder = { x: -0.42, y: 0.72 };
      pose.rightShoulder = { x: 0.42, y: 0.72 };
      pose.leftWrist = { x: -0.4, y: 1.7 };
      pose.rightWrist = { x: 0.18, y: 1.7 };
      pose.leftAnkle = { x: -0.55, y: 2.72 };
      pose.rightAnkle = { x: 0.42, y: 2.72 };
      break;
    case "leg-knee-pull":
      pose.leftKnee = { x: -0.08, y: 1.04 };
      pose.leftAnkle = { x: -0.1, y: 1.72 };
      pose.leftWrist = { x: -0.14, y: 1.1 };
      pose.rightWrist = { x: 0.08, y: 1.1 };
      break;
    case "leg-quad-pull":
      pose.leftKnee = { x: -0.42, y: 1.82 };
      pose.leftAnkle = { x: -0.72, y: 1.18 };
      pose.leftWrist = { x: -0.7, y: 1.18 };
      pose.rightWrist = { x: 0.72, y: 0.86 };
      break;
    case "leg-calf-stretch":
      pose.leftWrist = { x: -0.82, y: 0.3 };
      pose.rightWrist = { x: -0.62, y: 0.3 };
      pose.leftAnkle = { x: -0.52, y: 2.6 };
      pose.rightAnkle = { x: 0.82, y: 2.72 };
      pose.leftKnee = { x: -0.42, y: 1.82 };
      pose.rightKnee = { x: 0.52, y: 1.92 };
      break;
  }
  return pose;
}

export function drawAdaptiveGuidePose(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  checkType: StretchStep["checkType"],
  landmarks?: Landmark[] | null
) {
  const frame = getGuideBodyFrame(landmarks);
  const template = getGuidePoseTemplate(checkType);
  const toCanvasPoint = (point: { x: number; y: number }) => ({
    x: (frame.shoulderCenter.x + point.x * frame.shoulderWidth) * canvas.width,
    y: (frame.shoulderCenter.y + point.y * frame.torsoLength) * canvas.height,
  });

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = frame.isDetected ? 0.72 : 0.36;

  for (const [from, to] of GUIDE_CONNECTIONS) {
    const fromPoint = template[from];
    const toPoint = template[to];
    if (!fromPoint || !toPoint) {
      continue;
    }
    const start = toCanvasPoint(fromPoint);
    const end = toCanvasPoint(toPoint);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.strokeStyle = "rgba(250, 204, 21, 0.92)";
    context.lineWidth = 7;
    context.stroke();
    context.strokeStyle = "rgba(30, 64, 175, 0.74)";
    context.lineWidth = 3;
    context.stroke();
  }

  for (const point of Object.values(template)) {
    if (!point) {
      continue;
    }
    const center = toCanvasPoint(point);
    context.beginPath();
    context.arc(center.x, center.y, 7, 0, Math.PI * 2);
    context.fillStyle = "rgba(250, 204, 21, 0.9)";
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = "rgba(30, 64, 175, 0.82)";
    context.stroke();
  }

  context.restore();
}



