export const CURRENT_HEIGHT_RANGE = { min: 100, max: 220 } as const;
export const GROWTH_AGE_RANGE = { min: 10, max: 18 } as const;
export const FINAL_PREDICTION_AGE_MONTHS = 227 as const;

export type GrowthSex = "male" | "female";
export type PostureScoreStatus = "waiting" | "good" | "warning" | "danger";

export type FinalHeightPrediction = {
  currentAgeYears: number;
  currentHeightCm: number;
  predictedFinalHeightCm: number;
  percentile: number;
  zScore: number;
  isOutsideChartRange: boolean;
};

type StandardScoreHeights = readonly [number, number, number, number, number, number, number];

const Z_SCORES = [-3, -2, -1, 0, 1, 2, 3] as const;

// 2017 Korean National Growth Charts: height-for-age standard-score rows.
// Ages 10-18 use the birthday row; `final` is the last published row (227 months).
const HEIGHT_STANDARD_SCORES: Record<
  GrowthSex,
  { ages: Record<number, StandardScoreHeights>; final: StandardScoreHeights }
> = {
  male: {
    ages: {
      10: [122.6, 127.8, 133.2, 138.8, 144.8, 151.0, 157.5],
      11: [126.8, 132.5, 138.5, 144.7, 151.2, 157.9, 164.9],
      12: [130.5, 137.4, 144.4, 151.4, 158.5, 165.6, 172.7],
      13: [134.8, 143.2, 151.1, 158.6, 165.8, 172.7, 179.3],
      14: [140.3, 149.6, 157.7, 165.0, 171.5, 177.6, 183.2],
      15: [147.5, 155.6, 162.7, 169.2, 175.1, 180.5, 185.5],
      16: [153.2, 159.6, 165.6, 171.4, 177.0, 182.4, 187.6],
      17: [156.0, 161.6, 167.1, 172.6, 178.2, 183.7, 189.3],
      18: [157.4, 162.7, 168.1, 173.6, 179.2, 184.9, 190.8],
    },
    final: [158.7, 163.8, 169.0, 174.5, 180.1, 186.1, 192.2],
  },
  female: {
    ages: {
      10: [122.1, 127.5, 133.2, 139.1, 145.4, 152.0, 158.9],
      11: [126.6, 133.0, 139.4, 145.8, 152.1, 158.4, 164.6],
      12: [131.6, 138.7, 145.4, 151.7, 157.6, 163.3, 168.7],
      13: [137.3, 143.9, 150.1, 155.9, 161.4, 166.6, 171.6],
      14: [141.2, 147.2, 152.8, 158.3, 163.6, 168.7, 173.6],
      15: [143.0, 148.7, 154.2, 159.5, 164.7, 169.8, 174.7],
      16: [144.5, 149.7, 154.8, 160.0, 165.2, 170.5, 175.7],
      17: [145.9, 150.5, 155.3, 160.2, 165.4, 170.8, 176.3],
      18: [146.6, 151.1, 155.8, 160.6, 165.8, 171.1, 176.7],
    },
    final: [147.2, 151.6, 156.2, 161.1, 166.1, 171.4, 177.0],
  },
};

export function roundHeightCm(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function isHeightInRange(
  value: number | null | undefined,
  range: { min: number; max: number }
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= range.min &&
    value <= range.max
  );
}

export function isGrowthSex(value: unknown): value is GrowthSex {
  return value === "male" || value === "female";
}

export function isGrowthAge(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= GROWTH_AGE_RANGE.min &&
    value <= GROWTH_AGE_RANGE.max
  );
}

export function normalizeOptionalHeight(
  value: unknown,
  range: { min: number; max: number }
): number | null {
  return typeof value === "number" && isHeightInRange(value, range)
    ? roundHeightCm(value)
    : null;
}

export function normalizeGrowthAge(value: unknown): number | null {
  return isGrowthAge(value) ? value : null;
}

export function normalizeGrowthSex(value: unknown): GrowthSex | null {
  return isGrowthSex(value) ? value : null;
}

function interpolate(left: number, right: number, ratio: number) {
  return left + (right - left) * ratio;
}

function findZScore(heightCm: number, anchors: StandardScoreHeights) {
  if (heightCm <= anchors[0]) return -3;
  if (heightCm >= anchors[anchors.length - 1]) return 3;

  for (let index = 0; index < anchors.length - 1; index += 1) {
    const lowerHeight = anchors[index];
    const upperHeight = anchors[index + 1];
    if (heightCm <= upperHeight) {
      const ratio = (heightCm - lowerHeight) / (upperHeight - lowerHeight);
      return interpolate(Z_SCORES[index], Z_SCORES[index + 1], ratio);
    }
  }

  return 3;
}

function heightAtZScore(zScore: number, anchors: StandardScoreHeights) {
  if (zScore <= -3) return anchors[0];
  if (zScore >= 3) return anchors[anchors.length - 1];
  const lowerZ = Math.floor(zScore);
  const lowerIndex = lowerZ + 3;
  return interpolate(anchors[lowerIndex], anchors[lowerIndex + 1], zScore - lowerZ);
}

function errorFunction(value: number) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const approximation =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-x * x);
  return sign * approximation;
}

function zScoreToPercentile(zScore: number) {
  return Math.round(500 * (1 + errorFunction(zScore / Math.SQRT2))) / 10;
}

export function calculateFinalHeightPrediction(
  sex: GrowthSex | null | undefined,
  currentAgeYears: number | null | undefined,
  currentHeightCm: number | null | undefined
): FinalHeightPrediction | null {
  if (
    !isGrowthSex(sex) ||
    !isGrowthAge(currentAgeYears) ||
    !isHeightInRange(currentHeightCm, CURRENT_HEIGHT_RANGE)
  ) {
    return null;
  }

  const currentAnchors = HEIGHT_STANDARD_SCORES[sex].ages[currentAgeYears];
  const isOutsideChartRange =
    currentHeightCm < currentAnchors[0] || currentHeightCm > currentAnchors[currentAnchors.length - 1];
  const zScore = findZScore(currentHeightCm, currentAnchors);

  return {
    currentAgeYears,
    currentHeightCm: roundHeightCm(currentHeightCm),
    predictedFinalHeightCm: roundHeightCm(
      heightAtZScore(zScore, HEIGHT_STANDARD_SCORES[sex].final)
    ),
    percentile: zScoreToPercentile(zScore),
    zScore: Math.round(zScore * 100) / 100,
    isOutsideChartRange,
  };
}

export function formatHeightCm(value: number) {
  return `${roundHeightCm(value).toLocaleString("ko-KR", {
    minimumFractionDigits: Number.isInteger(roundHeightCm(value)) ? 0 : 1,
    maximumFractionDigits: 1,
  })}cm`;
}

export function formatGrowthPercentile(percentile: number) {
  if (percentile < 1) return "하위 1% 이내";
  if (percentile > 99) return "상위 1% 이내";
  return `상위 약 ${Math.round(100 - percentile)}%`;
}
