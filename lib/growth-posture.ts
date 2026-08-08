export const CURRENT_HEIGHT_RANGE = { min: 100, max: 220 } as const;
export const TARGET_HEIGHT_RANGE = { min: 100, max: 230 } as const;

export type HeightGoalResult =
  | { status: "remaining"; remainingCm: number }
  | { status: "reached"; remainingCm: 0 };

export type PostureScoreStatus = "waiting" | "good" | "warning" | "danger";
export type GrowthPostureState = "idle" | "tracking-lost" | "good" | "warning" | "danger";

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

export function normalizeOptionalHeight(
  value: unknown,
  range: { min: number; max: number }
): number | null {
  return typeof value === "number" && isHeightInRange(value, range)
    ? roundHeightCm(value)
    : null;
}

export function calculateHeightGoal(
  currentHeightCm: number | null | undefined,
  targetHeightCm: number | null | undefined
): HeightGoalResult | null {
  if (
    !isHeightInRange(currentHeightCm, CURRENT_HEIGHT_RANGE) ||
    !isHeightInRange(targetHeightCm, TARGET_HEIGHT_RANGE)
  ) {
    return null;
  }

  const remainingCm = roundHeightCm(targetHeightCm - currentHeightCm);
  return remainingCm > 0
    ? { status: "remaining", remainingCm }
    : { status: "reached", remainingCm: 0 };
}

export function formatHeightCm(value: number) {
  return `${roundHeightCm(value).toLocaleString("ko-KR", {
    minimumFractionDigits: Number.isInteger(roundHeightCm(value)) ? 0 : 1,
    maximumFractionDigits: 1,
  })}cm`;
}

export function getGrowthPostureState({
  isRunning,
  isTracking,
  postureStatus,
}: {
  isRunning: boolean;
  isTracking: boolean;
  postureStatus: PostureScoreStatus;
}): GrowthPostureState {
  if (!isRunning) return "idle";
  if (!isTracking) return "tracking-lost";
  return postureStatus === "waiting" ? "tracking-lost" : postureStatus;
}
