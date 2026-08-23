import { describe, expect, it } from "vitest";

import {
  MAX_POSTURE_HEIGHT_PENALTY_CM,
  calculatePostureHeightPreview,
} from "@/lib/posture-height-preview";

describe("posture height game preview", () => {
  it("does not reduce the preview for angles within the good-posture thresholds", () => {
    expect(calculatePostureHeightPreview(180, 10, 5)).toEqual({
      adjustedHeightCm: 180,
      penaltyCm: 0,
    });
    expect(calculatePostureHeightPreview(180, 4, 2)).toEqual({
      adjustedHeightCm: 180,
      penaltyCm: 0,
    });
  });

  it("applies the full five-centimeter reduction at the maximum thresholds", () => {
    expect(calculatePostureHeightPreview(180, 50, 20)).toEqual({
      adjustedHeightCm: 175,
      penaltyCm: MAX_POSTURE_HEIGHT_PENALTY_CM,
    });
  });

  it("combines neck and trunk severity and rounds to one decimal place", () => {
    expect(calculatePostureHeightPreview(180, 30, 12.5)).toEqual({
      adjustedHeightCm: 177.5,
      penaltyCm: 2.5,
    });
    expect(calculatePostureHeightPreview(180, 20, 5)).toEqual({
      adjustedHeightCm: 179.2,
      penaltyCm: 0.8,
    });
  });

  it("clamps angles below and above the configured posture range", () => {
    expect(calculatePostureHeightPreview(180, -20, -10)?.penaltyCm).toBe(0);
    expect(calculatePostureHeightPreview(180, 90, 45)?.penaltyCm).toBe(5);
  });

  it.each([
    [Number.NaN, 10, 5],
    [0, 10, 5],
    [180, Number.POSITIVE_INFINITY, 5],
    [180, 10, Number.NaN],
  ])("rejects invalid inputs (%s, %s, %s)", (height, neckAngle, trunkAngle) => {
    expect(calculatePostureHeightPreview(height, neckAngle, trunkAngle)).toBeNull();
  });
});
