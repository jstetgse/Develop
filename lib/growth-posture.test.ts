import { describe, expect, it } from "vitest";

import {
  CURRENT_HEIGHT_RANGE,
  TARGET_HEIGHT_RANGE,
  calculateHeightGoal,
  getGrowthPostureState,
  normalizeOptionalHeight,
} from "@/lib/growth-posture";

describe("growth posture height goal", () => {
  it("calculates 7cm remaining from 165cm to 172cm", () => {
    expect(calculateHeightGoal(165, 172)).toEqual({
      status: "remaining",
      remainingCm: 7,
    });
  });

  it("calculates decimal differences to one decimal place", () => {
    expect(calculateHeightGoal(165.5, 172)).toEqual({
      status: "remaining",
      remainingCm: 6.5,
    });
  });

  it("reports the configured goal as reached", () => {
    expect(calculateHeightGoal(172, 170)).toEqual({
      status: "reached",
      remainingCm: 0,
    });
  });

  it.each([
    [null, 172],
    [165, null],
    [Number.NaN, 172],
    [99.9, 172],
    [220.1, 172],
    [165, 99.9],
    [165, 230.1],
  ])("rejects missing or out-of-range values (%s, %s)", (current, target) => {
    expect(calculateHeightGoal(current, target)).toBeNull();
  });

  it("normalizes stored values while preserving backward compatibility", () => {
    expect(normalizeOptionalHeight(undefined, CURRENT_HEIGHT_RANGE)).toBeNull();
    expect(normalizeOptionalHeight(165.56, CURRENT_HEIGHT_RANGE)).toBe(165.6);
    expect(normalizeOptionalHeight(240, TARGET_HEIGHT_RANGE)).toBeNull();
  });
});

describe("growth posture display state", () => {
  it("distinguishes idle, tracking failure, bad posture, and good posture", () => {
    expect(getGrowthPostureState({ isRunning: false, isTracking: false, isBadPosture: false })).toBe("idle");
    expect(getGrowthPostureState({ isRunning: true, isTracking: false, isBadPosture: false })).toBe("tracking-lost");
    expect(getGrowthPostureState({ isRunning: true, isTracking: true, isBadPosture: true })).toBe("bad");
    expect(getGrowthPostureState({ isRunning: true, isTracking: true, isBadPosture: false })).toBe("good");
  });
});
