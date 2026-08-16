import { describe, expect, it } from "vitest";

import {
  CURRENT_HEIGHT_RANGE,
  TARGET_HEIGHT_RANGE,
  calculateArticleHeightScenario,
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

describe("article height scenario", () => {
  it("does not subtract from a good posture scenario", () => {
    expect(calculateArticleHeightScenario(175, 4, 80)).toEqual({
      years: 4,
      targetHeightCm: 175,
      averageScore: 80,
      postureStatus: "good",
      applicationRate: 0,
      maximumReductionCm: 2,
      appliedReductionCm: 0,
      estimatedHeightCm: 175,
    });
  });

  it("applies half of the article assumption to a warning posture scenario", () => {
    expect(calculateArticleHeightScenario(175, 1, 60)).toEqual({
      years: 1,
      targetHeightCm: 175,
      averageScore: 60,
      postureStatus: "warning",
      applicationRate: 0.5,
      maximumReductionCm: 0.5,
      appliedReductionCm: 0.3,
      estimatedHeightCm: 174.7,
    });
  });

  it("applies all of the article assumption to a danger posture scenario", () => {
    expect(calculateArticleHeightScenario(175, 4, 59)).toEqual({
      years: 4,
      targetHeightCm: 175,
      averageScore: 59,
      postureStatus: "danger",
      applicationRate: 1,
      maximumReductionCm: 2,
      appliedReductionCm: 2,
      estimatedHeightCm: 173,
    });
  });

  it.each([
    [80, "good"],
    [79, "warning"],
    [60, "warning"],
    [59, "danger"],
  ] as const)("classifies the %s-point boundary as %s", (score, postureStatus) => {
    expect(calculateArticleHeightScenario(175, 4, score)?.postureStatus).toBe(postureStatus);
  });

  it.each([
    [1, 90, 175],
    [1, 70, 174.7],
    [1, 50, 174.5],
    [4, 90, 175],
    [4, 70, 174],
    [4, 50, 173],
  ] as const)("calculates the %s-year scenario for score %s", (years, score, expectedHeight) => {
    expect(calculateArticleHeightScenario(175, years, score)?.estimatedHeightCm).toBe(expectedHeight);
  });

  it("rejects invalid target heights and scores", () => {
    expect(calculateArticleHeightScenario(null, 4, 70)).toBeNull();
    expect(calculateArticleHeightScenario(230.1, 4, 70)).toBeNull();
    expect(calculateArticleHeightScenario(175, 4, null)).toBeNull();
    expect(calculateArticleHeightScenario(175, 4, 101)).toBeNull();
  });
});

describe("growth posture display state", () => {
  it("prioritizes idle and tracking failure before score status", () => {
    expect(getGrowthPostureState({ isRunning: false, isTracking: false, postureStatus: "danger" })).toBe("idle");
    expect(getGrowthPostureState({ isRunning: true, isTracking: false, postureStatus: "danger" })).toBe("tracking-lost");
    expect(getGrowthPostureState({ isRunning: true, isTracking: true, postureStatus: "waiting" })).toBe("tracking-lost");
  });

  it.each(["good", "warning", "danger"] as const)("preserves the %s score status while tracking", (postureStatus) => {
    expect(getGrowthPostureState({ isRunning: true, isTracking: true, postureStatus })).toBe(postureStatus);
  });
});
