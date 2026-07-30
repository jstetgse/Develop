import type { SelectedSide } from "@/lib/types";

export type PostureLandmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type FrameSize = {
  videoWidth: number;
  videoHeight: number;
};

export type MetricInvalidReason =
  | "invalid-frame-size"
  | "missing-landmark"
  | "invalid-landmark"
  | "low-visibility"
  | "zero-length-vector";

export type RequiredLandmarkVisibility = {
  ear: number | null;
  shoulder: number | null;
  hip: number | null;
};

export type RawPostureMetrics = {
  absoluteNeckAngle: number;
  trunkAngle: number;
  relativeNeckAngle: number;
};

export type PostureMetricResult =
  | {
      valid: true;
      value: RawPostureMetrics;
      visibility: RequiredLandmarkVisibility;
    }
  | {
      valid: false;
      reason: MetricInvalidReason;
      visibility: RequiredLandmarkVisibility | null;
    };

export type PostureMetricComparison = {
  image: PostureMetricResult;
  world: PostureMetricResult;
  difference: {
    absoluteNeckAngle: number | null;
    trunkAngle: number | null;
    relativeNeckAngle: number | null;
  };
};

type Point2D = { x: number; y: number };
type Point3D = { x: number; y: number; z: number };
type Vector2D = Point2D;
type Vector3D = Point3D;

const MIN_VISIBILITY = 0.42;
const VECTOR_EPSILON = 1e-9;

const LANDMARKS = {
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
} as const;

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function clampUnit(value: number) {
  return Math.min(Math.max(value, -1), 1);
}

function visibilityOf(landmark: PostureLandmark | undefined) {
  return landmark && Number.isFinite(landmark.visibility ?? 1) ? (landmark.visibility ?? 1) : null;
}

function requiredVisibility(
  ear: PostureLandmark | undefined,
  shoulder: PostureLandmark | undefined,
  hip: PostureLandmark | undefined
): RequiredLandmarkVisibility {
  return {
    ear: visibilityOf(ear),
    shoulder: visibilityOf(shoulder),
    hip: visibilityOf(hip),
  };
}

function hasRequiredVisibility(visibility: RequiredLandmarkVisibility) {
  return Object.values(visibility).every((value) => value !== null && value > MIN_VISIBILITY);
}

function getRequiredLandmarks(landmarks: PostureLandmark[] | null | undefined, side: SelectedSide) {
  if (!landmarks) {
    return null;
  }

  return {
    ear: landmarks[side === "left" ? LANDMARKS.LEFT_EAR : LANDMARKS.RIGHT_EAR],
    shoulder: landmarks[side === "left" ? LANDMARKS.LEFT_SHOULDER : LANDMARKS.RIGHT_SHOULDER],
    hip: landmarks[side === "left" ? LANDMARKS.LEFT_HIP : LANDMARKS.RIGHT_HIP],
  };
}

export function isFiniteLandmark2D(
  landmark: PostureLandmark | null | undefined
): landmark is PostureLandmark {
  return Boolean(landmark && Number.isFinite(landmark.x) && Number.isFinite(landmark.y));
}

export function isFiniteLandmark3D(
  landmark: PostureLandmark | null | undefined
): landmark is PostureLandmark & { z: number } {
  return Boolean(isFiniteLandmark2D(landmark) && Number.isFinite(landmark.z));
}

export function isValidFrameSize(frameSize: FrameSize | null | undefined): frameSize is FrameSize {
  return Boolean(
    frameSize &&
      Number.isFinite(frameSize.videoWidth) &&
      Number.isFinite(frameSize.videoHeight) &&
      frameSize.videoWidth > 0 &&
      frameSize.videoHeight > 0
  );
}

export function toPixelPoint(landmark: PostureLandmark, frameSize: FrameSize): Point2D | null {
  if (!isFiniteLandmark2D(landmark) || !isValidFrameSize(frameSize)) {
    return null;
  }

  return {
    x: landmark.x * frameSize.videoWidth,
    y: landmark.y * frameSize.videoHeight,
  };
}

function getVector2D(from: Point2D, to: Point2D): Vector2D {
  return { x: to.x - from.x, y: to.y - from.y };
}

function getVector3D(from: Point3D, to: Point3D): Vector3D {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

function length2D(vector: Vector2D) {
  return Math.hypot(vector.x, vector.y);
}

function length3D(vector: Vector3D) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

export function getAngleFromVertical2D(vector: Vector2D): number | null {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || length2D(vector) <= VECTOR_EPSILON) {
    return null;
  }

  return Math.abs(toDegrees(Math.atan2(vector.x, -vector.y)));
}

export function getAngleFromVertical3D(vector: Vector3D): number | null {
  const length = length3D(vector);
  if (
    !Number.isFinite(vector.x) ||
    !Number.isFinite(vector.y) ||
    !Number.isFinite(vector.z) ||
    length <= VECTOR_EPSILON
  ) {
    return null;
  }

  return toDegrees(Math.acos(clampUnit(Math.abs(vector.y) / length)));
}

export function getAngleBetween2D(left: Vector2D, right: Vector2D): number | null {
  if (
    !Number.isFinite(left.x) ||
    !Number.isFinite(left.y) ||
    !Number.isFinite(right.x) ||
    !Number.isFinite(right.y)
  ) {
    return null;
  }
  const leftLength = length2D(left);
  const rightLength = length2D(right);
  if (leftLength <= VECTOR_EPSILON || rightLength <= VECTOR_EPSILON) {
    return null;
  }

  return toDegrees(
    Math.acos(clampUnit((left.x * right.x + left.y * right.y) / (leftLength * rightLength)))
  );
}

export function getAngleBetween3D(left: Vector3D, right: Vector3D): number | null {
  if (
    !Number.isFinite(left.x) ||
    !Number.isFinite(left.y) ||
    !Number.isFinite(left.z) ||
    !Number.isFinite(right.x) ||
    !Number.isFinite(right.y) ||
    !Number.isFinite(right.z)
  ) {
    return null;
  }
  const leftLength = length3D(left);
  const rightLength = length3D(right);
  if (leftLength <= VECTOR_EPSILON || rightLength <= VECTOR_EPSILON) {
    return null;
  }

  return toDegrees(
    Math.acos(
      clampUnit(
        (left.x * right.x + left.y * right.y + left.z * right.z) /
          (leftLength * rightLength)
      )
    )
  );
}

export function calculateImagePostureMetrics(
  landmarks: PostureLandmark[] | null | undefined,
  side: SelectedSide,
  frameSize: FrameSize | null | undefined
): PostureMetricResult {
  if (!isValidFrameSize(frameSize)) {
    return { valid: false, reason: "invalid-frame-size", visibility: null };
  }

  const required = getRequiredLandmarks(landmarks, side);
  if (!required?.ear || !required.shoulder || !required.hip) {
    return { valid: false, reason: "missing-landmark", visibility: null };
  }

  const visibility = requiredVisibility(required.ear, required.shoulder, required.hip);
  if (!hasRequiredVisibility(visibility)) {
    return { valid: false, reason: "low-visibility", visibility };
  }
  if (
    !isFiniteLandmark2D(required.ear) ||
    !isFiniteLandmark2D(required.shoulder) ||
    !isFiniteLandmark2D(required.hip)
  ) {
    return { valid: false, reason: "invalid-landmark", visibility };
  }

  const ear = toPixelPoint(required.ear, frameSize);
  const shoulder = toPixelPoint(required.shoulder, frameSize);
  const hip = toPixelPoint(required.hip, frameSize);
  if (!ear || !shoulder || !hip) {
    return { valid: false, reason: "invalid-landmark", visibility };
  }

  const neckVector = getVector2D(shoulder, ear);
  const trunkVector = getVector2D(hip, shoulder);
  const absoluteNeckAngle = getAngleFromVertical2D(neckVector);
  const trunkAngle = getAngleFromVertical2D(trunkVector);
  const relativeNeckAngle = getAngleBetween2D(neckVector, trunkVector);
  if (absoluteNeckAngle === null || trunkAngle === null || relativeNeckAngle === null) {
    return { valid: false, reason: "zero-length-vector", visibility };
  }

  return {
    valid: true,
    value: { absoluteNeckAngle, trunkAngle, relativeNeckAngle },
    visibility,
  };
}

export function calculateWorldPostureMetrics(
  landmarks: PostureLandmark[] | null | undefined,
  side: SelectedSide
): PostureMetricResult {
  const required = getRequiredLandmarks(landmarks, side);
  if (!required?.ear || !required.shoulder || !required.hip) {
    return { valid: false, reason: "missing-landmark", visibility: null };
  }

  const visibility = requiredVisibility(required.ear, required.shoulder, required.hip);
  if (!hasRequiredVisibility(visibility)) {
    return { valid: false, reason: "low-visibility", visibility };
  }
  if (
    !isFiniteLandmark3D(required.ear) ||
    !isFiniteLandmark3D(required.shoulder) ||
    !isFiniteLandmark3D(required.hip)
  ) {
    return { valid: false, reason: "invalid-landmark", visibility };
  }

  const ear = { x: required.ear.x, y: required.ear.y, z: required.ear.z };
  const shoulder = { x: required.shoulder.x, y: required.shoulder.y, z: required.shoulder.z };
  const hip = { x: required.hip.x, y: required.hip.y, z: required.hip.z };
  const neckVector = getVector3D(shoulder, ear);
  const trunkVector = getVector3D(hip, shoulder);
  const absoluteNeckAngle = getAngleFromVertical3D(neckVector);
  const trunkAngle = getAngleFromVertical3D(trunkVector);
  const relativeNeckAngle = getAngleBetween3D(neckVector, trunkVector);
  if (absoluteNeckAngle === null || trunkAngle === null || relativeNeckAngle === null) {
    return { valid: false, reason: "zero-length-vector", visibility };
  }

  return {
    valid: true,
    value: { absoluteNeckAngle, trunkAngle, relativeNeckAngle },
    visibility,
  };
}

export function comparePostureMetrics(
  image: PostureMetricResult,
  world: PostureMetricResult
): PostureMetricComparison {
  return {
    image,
    world,
    difference: {
      absoluteNeckAngle:
        image.valid && world.valid
          ? world.value.absoluteNeckAngle - image.value.absoluteNeckAngle
          : null,
      trunkAngle:
        image.valid && world.valid ? world.value.trunkAngle - image.value.trunkAngle : null,
      relativeNeckAngle:
        image.valid && world.valid
          ? world.value.relativeNeckAngle - image.value.relativeNeckAngle
          : null,
    },
  };
}
