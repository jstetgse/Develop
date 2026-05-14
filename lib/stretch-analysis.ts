import {
  getGuidePoseVariants,
  getPersonalizedGuidePoseVariants,
  normalizeLandmarksToGuideSpace,
  type GuideJoint,
  type GuidePoint,
  type GuidePose,
  type Landmark,
  type StretchCalibration,
} from "@/lib/stretch-guide";
import type { PostureResult, StretchBodyPart, StretchCoachingResult, StretchDefinition, StretchStep } from "@/lib/types";

const STRETCHES: StretchDefinition[] = [
  {
    id: "neck-stretch",
    name: "목 스트레칭",
    targetIssue: "neck",
    targetBodyPart: "목",
    description: "목 옆선과 앞뒤 근육을 부드럽게 늘려 긴장을 낮춥니다.",
    shortDescription: "목 긴장 완화",
    durationSec: 20,
    recommendedFor: ["forward-head", "neck"],
    steps: [
      {
        id: "neck-side-pull",
        title: "1단계: 옆으로 당기기",
        instruction: "머리에 손을 얹은 후 옆으로 지그시 당겨주세요.",
        checkType: "neck-side-pull",
      },
      {
        id: "neck-forward-pull",
        title: "2단계: 아래로 당기기",
        instruction: "양쪽 손을 머리 뒤로 깍지 낀 후 아래로 당겨주세요.",
        checkType: "neck-forward-pull",
      },
      {
        id: "neck-back-tilt",
        title: "3단계: 위로 당기기",
        instruction: "엄지손가락을 턱에 대고 위를 향하여 당겨주세요.",
        checkType: "neck-back-tilt",
      },
      {
        id: "neck-circle",
        title: "4단계: 목 돌리기",
        instruction: "원을 천천히 그리면서 목을 지그시 돌려주세요.",
        checkType: "neck-circle",
      },
    ],
  },
  {
    id: "shoulder-stretch",
    name: "어깨 스트레칭",
    targetIssue: "torso",
    targetBodyPart: "어깨",
    description: "어깨와 팔 주변 근육을 풀어 굽은 자세를 완화합니다.",
    shortDescription: "어깨 긴장 완화",
    durationSec: 20,
    recommendedFor: ["upper-body-forward", "torso"],
    steps: [
      {
        id: "shoulder-roll",
        title: "1단계: 어깨 돌리기",
        instruction: "어깨에 손을 올리고 원을 그리며 돌려주세요.",
        checkType: "shoulder-roll",
      },
      {
        id: "shoulder-cross",
        title: "2단계: 팔 몸쪽으로 당기기",
        instruction: "팔을 최대한 몸쪽으로 붙여 천천히 당겨주세요.",
        checkType: "shoulder-cross",
      },
      {
        id: "shoulder-overhead",
        title: "3단계: 팔꿈치 아래로 늘리기",
        instruction: "팔을 머리 뒤로 하여 팔꿈치를 잡고 아래로 늘려주세요.",
        checkType: "shoulder-overhead",
      },
      {
        id: "shoulder-chest-open",
        title: "4단계: 가슴 열기",
        instruction: "등 뒤로 두 손을 맞잡아 가슴을 내민 후 고개를 젖혀주세요.",
        checkType: "shoulder-chest-open",
      },
    ],
  },
  {
    id: "wrist-stretch",
    name: "손목 스트레칭",
    targetIssue: "long-sitting",
    targetBodyPart: "손목",
    description: "손목과 팔 앞쪽 긴장을 부드럽게 풀어줍니다.",
    shortDescription: "손목 피로 완화",
    durationSec: 20,
    recommendedFor: ["long-sitting", "wrist"],
    steps: [
      {
        id: "wrist-roll",
        title: "1단계: 손목 돌리기",
        instruction: "양쪽 손을 깍지 낀 후 손과 손목을 돌려주세요.",
        checkType: "wrist-roll",
      },
      {
        id: "wrist-back-press",
        title: "2단계: 손등 맞대기",
        instruction: "손등을 맞붙여 팔꿈치를 같은 높이로 놓고 눌러주세요.",
        checkType: "wrist-back-press",
      },
      {
        id: "wrist-open-close",
        title: "3단계: 손 펴고 구부리기",
        instruction: "다섯 손가락을 쫙 폈다 구부리기를 반복해주세요.",
        checkType: "wrist-open-close",
      },
      {
        id: "wrist-pull",
        title: "4단계: 손목 몸쪽으로 당기기",
        instruction: "한쪽 손을 편 뒤 반대편 손목을 몸쪽으로 젖혀 당겨주세요.",
        checkType: "wrist-pull",
      },
    ],
  },
  {
    id: "back-stretch",
    name: "허리 스트레칭",
    targetIssue: "stability",
    targetBodyPart: "허리",
    description: "옆구리와 허리 주변 근육을 천천히 늘려줍니다.",
    shortDescription: "허리 긴장 완화",
    durationSec: 20,
    recommendedFor: ["slouched", "torso", "stability"],
    steps: [
      {
        id: "back-side",
        title: "1단계: 좌우로 당기기",
        instruction: "양쪽 손을 깍지 낀 후 머리 위로 올려 좌우로 당겨주세요.",
        checkType: "back-side",
      },
      {
        id: "back-forward-reach",
        title: "2단계: 앞으로 뻗기",
        instruction: "양쪽 손을 깍지 낀 후 앞으로 팔을 쭉 뻗어주세요.",
        checkType: "back-forward-reach",
      },
      {
        id: "back-twist",
        title: "3단계: 허리 비틀기",
        instruction: "양쪽 손을 앞뒤로 두고 허리를 좌우로 비틀어주세요.",
        checkType: "back-twist",
      },
      {
        id: "back-hip-circle",
        title: "4단계: 허리 돌리기",
        instruction: "양쪽 다리를 살짝 굽힌 채 좌우로 허리를 돌려주세요.",
        checkType: "back-hip-circle",
      },
    ],
  },
  {
    id: "leg-stretch",
    name: "다리 스트레칭",
    targetIssue: "long-sitting",
    targetBodyPart: "다리",
    description: "허벅지, 고관절, 종아리 근육을 차례로 풀어줍니다.",
    shortDescription: "다리 근육 완화",
    durationSec: 20,
    recommendedFor: ["long-sitting", "leg"],
    steps: [
      {
        id: "leg-forward-fold",
        title: "1단계: 앞으로 숙이기",
        instruction: "한쪽 발을 앞으로 두고 무릎을 잡고 허리를 숙여주세요.",
        checkType: "leg-forward-fold",
      },
      {
        id: "leg-knee-pull",
        title: "2단계: 무릎 당기기",
        instruction: "무릎을 두 손으로 잡고 올려 몸 쪽으로 최대한 당겨주세요.",
        checkType: "leg-knee-pull",
      },
      {
        id: "leg-quad-pull",
        title: "3단계: 발등 당기기",
        instruction: "팔을 뒤로 뻗어 발등을 잡고 몸쪽으로 당겨주세요.",
        checkType: "leg-quad-pull",
      },
      {
        id: "leg-calf-stretch",
        title: "4단계: 종아리 늘리기",
        instruction: "두 손을 벽에 대고 한쪽 다리를 뒤로 보낸 후 종아리 근육을 늘려주세요.",
        checkType: "leg-calf-stretch",
      },
    ],
  },
];

type PartScore = {
  part: StretchBodyPart;
  score: number;
  message: string;
};

type PoseMatchEvaluation = {
  matchPercentage: number | null;
  incorrectParts: StretchBodyPart[];
  correctionMessages: string[];
};

const REQUIRED_PARTS_BY_CHECK: Record<StretchStep["checkType"], StretchBodyPart[]> = {
  "neck-side-pull": ["neck", "leftArm"],
  "neck-forward-pull": ["neck", "leftArm", "rightArm"],
  "neck-back-tilt": ["neck", "leftArm", "rightArm"],
  "neck-circle": ["neck"],
  "shoulder-roll": ["leftArm", "rightArm"],
  "shoulder-cross": ["leftArm"],
  "shoulder-overhead": ["leftArm"],
  "shoulder-chest-open": ["neck", "leftArm", "rightArm", "torso"],
  "wrist-roll": ["leftArm", "rightArm"],
  "wrist-back-press": ["leftArm", "rightArm"],
  "wrist-open-close": ["leftArm", "rightArm"],
  "wrist-pull": ["leftArm", "rightArm"],
  "back-side": ["leftArm", "rightArm", "torso"],
  "back-forward-reach": ["leftArm", "rightArm", "torso"],
  "back-twist": ["torso", "leftArm", "rightArm"],
  "back-hip-circle": ["torso", "leftLeg", "rightLeg"],
  "leg-forward-fold": ["torso", "leftLeg", "rightLeg"],
  "leg-knee-pull": ["leftLeg", "leftArm", "rightArm"],
  "leg-quad-pull": ["leftLeg", "leftArm"],
  "leg-calf-stretch": ["leftLeg", "rightLeg", "leftArm", "rightArm"],
};

const JOINTS_BY_PART: Record<StretchBodyPart, GuideJoint[]> = {
  neck: ["head", "neck", "leftShoulder", "rightShoulder"],
  leftArm: ["leftShoulder", "leftElbow", "leftWrist"],
  rightArm: ["rightShoulder", "rightElbow", "rightWrist"],
  torso: ["leftShoulder", "rightShoulder", "leftHip", "rightHip"],
  leftLeg: ["leftHip", "leftKnee", "leftAnkle"],
  rightLeg: ["rightHip", "rightKnee", "rightAnkle"],
};

const MESSAGE_BY_PART: Record<StretchBodyPart, string> = {
  neck: "고개를 가이드 방향에 맞춰주세요.",
  leftArm: "팔을 조금 더 가이드에 맞춰주세요.",
  rightArm: "팔을 조금 더 가이드에 맞춰주세요.",
  torso: "허리와 상체 방향을 가이드에 맞춰주세요.",
  leftLeg: "다리 위치를 가이드에 맞춰주세요.",
  rightLeg: "다리 위치를 가이드에 맞춰주세요.",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundScore(value: number) {
  return Math.round(clamp(value, 0, 100));
}

function angleDegrees(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const cross = ab.x * cb.y - ab.y * cb.x;
  return Math.abs((Math.atan2(cross, dot) * 180) / Math.PI);
}

function lineAngleDegrees(a: { x: number; y: number }, b: { x: number; y: number }) {
  return (Math.atan2(a.x - b.x, b.y - a.y) * 180) / Math.PI;
}

function coordinateScore(userPoint: { x: number; y: number }, guidePoint: { x: number; y: number }, tolerance = 0.82) {
  const distance = Math.hypot(userPoint.x - guidePoint.x, userPoint.y - guidePoint.y);
  return clamp(100 - (distance / tolerance) * 100, 0, 100);
}

function angleScore(userAngle: number, guideAngle: number, tolerance = 42) {
  const diff = Math.abs(userAngle - guideAngle);
  return clamp(100 - (diff / tolerance) * 100, 0, 100);
}

function relationScore(value: number, target: number, tolerance: number) {
  return clamp(100 - (Math.abs(value - target) / tolerance) * 100, 0, 100);
}

function closeScore(value: number, maxGood: number, maxBad: number) {
  if (value <= maxGood) {
    return 100;
  }
  return clamp(100 - ((value - maxGood) / Math.max(maxBad - maxGood, 0.001)) * 100, 0, 100);
}

function distance(a: GuidePoint | undefined, b: GuidePoint | undefined) {
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Number.POSITIVE_INFINITY;
}

function averageScores(scores: number[]) {
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
}

function capGoodScore(score: number) {
  return Math.round(clamp(score, 0, 95));
}

function isPersonalizedStretch(stretchId: string) {
  return stretchId === "neck-stretch" || stretchId === "shoulder-stretch" || stretchId === "back-stretch";
}

function evaluatePersonalizedMovement(
  checkType: StretchStep["checkType"],
  userPose: GuidePose,
  guidePose: GuidePose
): PoseMatchEvaluation {
  const partScores: PartScore[] = [];
  const pushPart = (part: StretchBodyPart, score: number) => {
    partScores.push({ part, score, message: MESSAGE_BY_PART[part] });
  };

  const shoulderLevel =
    userPose.leftShoulder && userPose.rightShoulder
      ? closeScore(Math.abs(userPose.leftShoulder.y - userPose.rightShoulder.y), 0.08, 0.34)
      : 55;
  const torsoAngle =
    userPose.leftShoulder && userPose.rightShoulder && userPose.leftHip && userPose.rightHip
      ? lineAngleDegrees(
          { x: (userPose.leftShoulder.x + userPose.rightShoulder.x) / 2, y: (userPose.leftShoulder.y + userPose.rightShoulder.y) / 2 },
          { x: (userPose.leftHip.x + userPose.rightHip.x) / 2, y: (userPose.leftHip.y + userPose.rightHip.y) / 2 }
        )
      : 0;
  const guideTorsoAngle =
    guidePose.leftShoulder && guidePose.rightShoulder && guidePose.leftHip && guidePose.rightHip
      ? lineAngleDegrees(
          { x: (guidePose.leftShoulder.x + guidePose.rightShoulder.x) / 2, y: (guidePose.leftShoulder.y + guidePose.rightShoulder.y) / 2 },
          { x: (guidePose.leftHip.x + guidePose.rightHip.x) / 2, y: (guidePose.leftHip.y + guidePose.rightHip.y) / 2 }
        )
      : 0;
  const torsoDirection = angleScore(torsoAngle, guideTorsoAngle, 42);
  const hipStability =
    userPose.leftHip && userPose.rightHip ? closeScore(Math.abs(userPose.leftHip.y - userPose.rightHip.y), 0.08, 0.32) : 60;

  if (checkType.startsWith("neck")) {
    const neckDirection =
      userPose.head && userPose.neck && guidePose.head && guidePose.neck
        ? angleScore(lineAngleDegrees(userPose.head, userPose.neck), lineAngleDegrees(guidePose.head, guidePose.neck), 34)
        : 45;
    const handTargets =
      checkType === "neck-side-pull"
        ? [distance(userPose.leftWrist, userPose.head), distance(userPose.rightWrist, userPose.head)]
        : checkType === "neck-forward-pull"
          ? [distance(userPose.leftWrist, userPose.head), distance(userPose.rightWrist, userPose.head)]
          : checkType === "neck-back-tilt"
            ? [distance(userPose.leftWrist, userPose.leftShoulder), distance(userPose.rightWrist, userPose.rightShoulder)]
            : [];
    const handScore = handTargets.length ? closeScore(Math.min(...handTargets), 0.58, 1.35) : 88;
    pushPart("neck", neckDirection * 0.5 + shoulderLevel * 0.3 + handScore * 0.2);
    if (handScore < 72) {
      pushPart("leftArm", handScore);
    }
  } else if (checkType.startsWith("shoulder")) {
    const leftDirection =
      userPose.leftShoulder && userPose.leftWrist && guidePose.leftShoulder && guidePose.leftWrist
        ? angleScore(lineAngleDegrees(userPose.leftWrist, userPose.leftShoulder), lineAngleDegrees(guidePose.leftWrist, guidePose.leftShoulder), 48)
        : 50;
    const rightDirection =
      userPose.rightShoulder && userPose.rightWrist && guidePose.rightShoulder && guidePose.rightWrist
        ? angleScore(lineAngleDegrees(userPose.rightWrist, userPose.rightShoulder), lineAngleDegrees(guidePose.rightWrist, guidePose.rightShoulder), 48)
        : leftDirection;
    const leftElbow =
      userPose.leftShoulder && userPose.leftElbow && userPose.leftWrist && guidePose.leftShoulder && guidePose.leftElbow && guidePose.leftWrist
        ? angleScore(angleDegrees(userPose.leftShoulder, userPose.leftElbow, userPose.leftWrist), angleDegrees(guidePose.leftShoulder, guidePose.leftElbow, guidePose.leftWrist), 58)
        : leftDirection;
    const rightElbow =
      userPose.rightShoulder && userPose.rightElbow && userPose.rightWrist && guidePose.rightShoulder && guidePose.rightElbow && guidePose.rightWrist
        ? angleScore(angleDegrees(userPose.rightShoulder, userPose.rightElbow, userPose.rightWrist), angleDegrees(guidePose.rightShoulder, guidePose.rightElbow, guidePose.rightWrist), 58)
        : rightDirection;
    pushPart("leftArm", leftDirection * 0.45 + leftElbow * 0.35 + torsoDirection * 0.2);
    pushPart("rightArm", rightDirection * 0.45 + rightElbow * 0.35 + torsoDirection * 0.2);
  } else if (checkType.startsWith("back")) {
    const armAssist = averageScores([
      userPose.leftShoulder && userPose.leftWrist && guidePose.leftShoulder && guidePose.leftWrist
        ? angleScore(lineAngleDegrees(userPose.leftWrist, userPose.leftShoulder), lineAngleDegrees(guidePose.leftWrist, guidePose.leftShoulder), 55)
        : 65,
      userPose.rightShoulder && userPose.rightWrist && guidePose.rightShoulder && guidePose.rightWrist
        ? angleScore(lineAngleDegrees(userPose.rightWrist, userPose.rightShoulder), lineAngleDegrees(guidePose.rightWrist, guidePose.rightShoulder), 55)
        : 65,
    ]);
    pushPart("torso", torsoDirection * 0.5 + hipStability * 0.3 + armAssist * 0.2);
    if (armAssist < 72) {
      pushPart("leftArm", armAssist);
      pushPart("rightArm", armAssist);
    }
  }

  if (!partScores.length) {
    return evaluateAgainstGuide(checkType, userPose, guidePose);
  }

  const average = capGoodScore(averageScores(partScores.map((part) => part.score)));
  const incorrectParts = partScores.filter((part) => part.score < 70).map((part) => part.part);
  const correctionMessages = Array.from(
    new Set(partScores.filter((part) => part.score < 78).map((part) => part.message))
  );

  return {
    matchPercentage: average,
    incorrectParts,
    correctionMessages,
  };
}

function scorePart(part: StretchBodyPart, userPose: GuidePose, guidePose: GuidePose): PartScore | null {
  const joints = JOINTS_BY_PART[part];
  const jointScores = joints
    .map((joint) => {
      const userPoint = userPose[joint];
      const guidePoint = guidePose[joint];
      return userPoint && guidePoint ? coordinateScore(userPoint, guidePoint) : null;
    })
    .filter((score): score is number => typeof score === "number");

  if (!jointScores.length) {
    return null;
  }

  const angleScores: number[] = [];
  if (part === "neck" && userPose.head && userPose.neck && guidePose.head && guidePose.neck) {
    angleScores.push(angleScore(lineAngleDegrees(userPose.head, userPose.neck), lineAngleDegrees(guidePose.head, guidePose.neck), 34));
  }
  if (part === "torso" && userPose.leftShoulder && userPose.rightShoulder && userPose.leftHip && userPose.rightHip && guidePose.leftShoulder && guidePose.rightShoulder && guidePose.leftHip && guidePose.rightHip) {
    const userShoulder = { x: (userPose.leftShoulder.x + userPose.rightShoulder.x) / 2, y: (userPose.leftShoulder.y + userPose.rightShoulder.y) / 2 };
    const userHip = { x: (userPose.leftHip.x + userPose.rightHip.x) / 2, y: (userPose.leftHip.y + userPose.rightHip.y) / 2 };
    const guideShoulder = { x: (guidePose.leftShoulder.x + guidePose.rightShoulder.x) / 2, y: (guidePose.leftShoulder.y + guidePose.rightShoulder.y) / 2 };
    const guideHip = { x: (guidePose.leftHip.x + guidePose.rightHip.x) / 2, y: (guidePose.leftHip.y + guidePose.rightHip.y) / 2 };
    angleScores.push(angleScore(lineAngleDegrees(userShoulder, userHip), lineAngleDegrees(guideShoulder, guideHip), 36));
  }
  if (part === "leftArm" && userPose.leftShoulder && userPose.leftElbow && userPose.leftWrist && guidePose.leftShoulder && guidePose.leftElbow && guidePose.leftWrist) {
    angleScores.push(angleScore(angleDegrees(userPose.leftShoulder, userPose.leftElbow, userPose.leftWrist), angleDegrees(guidePose.leftShoulder, guidePose.leftElbow, guidePose.leftWrist), 50));
  }
  if (part === "rightArm" && userPose.rightShoulder && userPose.rightElbow && userPose.rightWrist && guidePose.rightShoulder && guidePose.rightElbow && guidePose.rightWrist) {
    angleScores.push(angleScore(angleDegrees(userPose.rightShoulder, userPose.rightElbow, userPose.rightWrist), angleDegrees(guidePose.rightShoulder, guidePose.rightElbow, guidePose.rightWrist), 50));
  }
  if (part === "leftLeg" && userPose.leftHip && userPose.leftKnee && userPose.leftAnkle && guidePose.leftHip && guidePose.leftKnee && guidePose.leftAnkle) {
    angleScores.push(angleScore(angleDegrees(userPose.leftHip, userPose.leftKnee, userPose.leftAnkle), angleDegrees(guidePose.leftHip, guidePose.leftKnee, guidePose.leftAnkle), 48));
  }
  if (part === "rightLeg" && userPose.rightHip && userPose.rightKnee && userPose.rightAnkle && guidePose.rightHip && guidePose.rightKnee && guidePose.rightAnkle) {
    angleScores.push(angleScore(angleDegrees(userPose.rightHip, userPose.rightKnee, userPose.rightAnkle), angleDegrees(guidePose.rightHip, guidePose.rightKnee, guidePose.rightAnkle), 48));
  }

  const coordinateAverage = jointScores.reduce((sum, score) => sum + score, 0) / jointScores.length;
  const angleAverage = angleScores.length
    ? angleScores.reduce((sum, score) => sum + score, 0) / angleScores.length
    : coordinateAverage;
  const score =
    part === "neck"
      ? coordinateAverage * 0.48 + angleAverage * 0.52
      : coordinateAverage * 0.62 + angleAverage * 0.38;

  return {
    part,
    score,
    message: MESSAGE_BY_PART[part],
  };
}

function evaluateAgainstGuide(checkType: StretchStep["checkType"], userPose: GuidePose, guidePose: GuidePose): PoseMatchEvaluation {
  const requiredParts = REQUIRED_PARTS_BY_CHECK[checkType];
  const partScores = requiredParts
    .map((part) => scorePart(part, userPose, guidePose))
    .filter((score): score is PartScore => Boolean(score));

  if (!partScores.length) {
    return {
      matchPercentage: null,
      incorrectParts: requiredParts,
      correctionMessages: ["카메라에 몸이 잘 보이도록 위치를 조정해주세요."],
    };
  }

  const average = partScores.reduce((sum, part) => sum + part.score, 0) / partScores.length;
  const incorrectParts = partScores.filter((part) => part.score < 70).map((part) => part.part);
  const correctionMessages = Array.from(
    new Set(partScores.filter((part) => part.score < 78).map((part) => part.message))
  );

  return {
    matchPercentage: roundScore(average),
    incorrectParts,
    correctionMessages,
  };
}

function evaluatePoseMatch(
  stretchId: string,
  checkType: StretchStep["checkType"],
  landmarks: Landmark[],
  calibration?: StretchCalibration | null
): PoseMatchEvaluation {
  const usePersonalized = isPersonalizedStretch(stretchId) && Boolean(calibration);
  const userPose = normalizeLandmarksToGuideSpace(landmarks, usePersonalized ? calibration : null);
  if (!userPose) {
    return {
      matchPercentage: null,
      incorrectParts: REQUIRED_PARTS_BY_CHECK[checkType],
      correctionMessages: ["카메라에 몸이 잘 보이도록 위치를 조정해주세요."],
    };
  }

  const variants = (usePersonalized
    ? getPersonalizedGuidePoseVariants(checkType, calibration)
    : getGuidePoseVariants(checkType)
  ).map((guidePose) =>
    usePersonalized
      ? evaluatePersonalizedMovement(checkType, userPose, guidePose)
      : evaluateAgainstGuide(checkType, userPose, guidePose)
  );
  const scored = variants.filter((variant) => typeof variant.matchPercentage === "number");
  if (!scored.length) {
    return variants[0];
  }
  return scored.reduce((best, current) =>
    (current.matchPercentage ?? 0) > (best.matchPercentage ?? 0) ? current : best
  );
}

function feedbackForScore(score: number | null, correctionMessages: string[]) {
  if (score === null) {
    return "카메라에 몸이 잘 보이도록 위치를 조정해주세요.";
  }
  if (score >= 85) {
    return "좋아요! 자세를 유지하세요.";
  }
  if (score >= 70) {
    return correctionMessages[0] ?? "거의 맞았습니다. 조금만 조정해주세요.";
  }
  return correctionMessages[0] ?? "가이드 틀에 몸을 맞춰주세요.";
}

function result(
  stretchId: string | null,
  stepIndex: number,
  evaluation: PoseMatchEvaluation,
  fallbackMessage?: string
): StretchCoachingResult {
  const score = evaluation.matchPercentage;
  const coachingMessage = fallbackMessage ?? feedbackForScore(score, evaluation.correctionMessages);
  return {
    stretchId,
    stepIndex,
    isPoseValid: typeof score === "number" && score >= 85,
    poseScore: score,
    matchPercentage: score,
    incorrectParts: evaluation.incorrectParts,
    correctionMessages: evaluation.correctionMessages,
    coachingMessage,
  };
}

function missing(stretchId: string | null, stepIndex: number, message = "자세가 감지되지 않습니다."): StretchCoachingResult {
  return {
    stretchId,
    stepIndex,
    isPoseValid: false,
    poseScore: null,
    matchPercentage: null,
    incorrectParts: [],
    correctionMessages: [message],
    coachingMessage: message,
  };
}

export function getRecommendedStretches(mainIssue: PostureResult["mainIssue"]) {
  const priority =
    mainIssue === "neck"
      ? ["neck-stretch", "shoulder-stretch", "back-stretch", "wrist-stretch", "leg-stretch"]
      : mainIssue === "torso"
        ? ["shoulder-stretch", "back-stretch", "neck-stretch", "wrist-stretch", "leg-stretch"]
        : mainIssue === "stability"
          ? ["back-stretch", "shoulder-stretch", "neck-stretch", "wrist-stretch", "leg-stretch"]
          : ["neck-stretch", "back-stretch", "shoulder-stretch", "wrist-stretch", "leg-stretch"];

  return [...STRETCHES].sort((left, right) => priority.indexOf(left.id) - priority.indexOf(right.id));
}

export function getStretchById(stretchId: string | null) {
  return STRETCHES.find((stretch) => stretch.id === stretchId) ?? null;
}

export function analyzeStretchStep(
  stretchId: string | null,
  stepIndex: number,
  landmarks?: Landmark[] | null,
  calibration?: StretchCalibration | null
): StretchCoachingResult {
  if (!stretchId) {
    return missing(null, stepIndex, "스트레칭을 선택한 뒤 분석을 시작하세요.");
  }

  const stretch = getStretchById(stretchId);
  const step = stretch?.steps[stepIndex];
  if (!stretch || !step) {
    return missing(stretchId, stepIndex, "현재 단계 정보를 찾을 수 없습니다.");
  }

  if (!landmarks?.length) {
    return missing(stretchId, stepIndex);
  }

  return result(stretch.id, stepIndex, evaluatePoseMatch(stretch.id, step.checkType, landmarks, calibration));
}

export function analyzeStretchPose(
  stretchId: string | null,
  landmarks?: Landmark[] | null
): StretchCoachingResult {
  return analyzeStretchStep(stretchId, 0, landmarks);
}