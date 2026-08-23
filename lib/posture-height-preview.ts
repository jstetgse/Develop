export const MAX_POSTURE_HEIGHT_PENALTY_CM = 5;

const NECK_GOOD_MAX_DEGREES = 10;
const NECK_MAX_PENALTY_DEGREES = 50;
const TRUNK_GOOD_MAX_DEGREES = 5;
const TRUNK_MAX_PENALTY_DEGREES = 20;
const NECK_WEIGHT = 0.65;
const TRUNK_WEIGHT = 0.35;

export type PostureHeightPreview = {
  adjustedHeightCm: number;
  penaltyCm: number;
};

function clampUnit(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function roundToTenth(value: number) {
  return Math.round(value * 10) / 10;
}

export function calculatePostureHeightPreview(
  predictedFinalHeightCm: number,
  neckAngleDegrees: number,
  trunkLeanDegrees: number
): PostureHeightPreview | null {
  if (
    !Number.isFinite(predictedFinalHeightCm) ||
    predictedFinalHeightCm <= 0 ||
    !Number.isFinite(neckAngleDegrees) ||
    !Number.isFinite(trunkLeanDegrees)
  ) {
    return null;
  }

  const neckSeverity = clampUnit(
    (neckAngleDegrees - NECK_GOOD_MAX_DEGREES) /
      (NECK_MAX_PENALTY_DEGREES - NECK_GOOD_MAX_DEGREES)
  );
  const trunkSeverity = clampUnit(
    (trunkLeanDegrees - TRUNK_GOOD_MAX_DEGREES) /
      (TRUNK_MAX_PENALTY_DEGREES - TRUNK_GOOD_MAX_DEGREES)
  );
  const penaltyCm = roundToTenth(
    MAX_POSTURE_HEIGHT_PENALTY_CM *
      (neckSeverity * NECK_WEIGHT + trunkSeverity * TRUNK_WEIGHT)
  );

  return {
    adjustedHeightCm: roundToTenth(Math.max(predictedFinalHeightCm - penaltyCm, 0)),
    penaltyCm,
  };
}
