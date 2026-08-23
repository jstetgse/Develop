import { describe, expect, it } from "vitest";

import {
  CURRENT_HEIGHT_RANGE,
  calculateFinalHeightPrediction,
  formatGrowthPercentile,
  normalizeGrowthAge,
  normalizeGrowthSex,
  normalizeOptionalHeight,
} from "@/lib/growth-posture";

describe("growth chart final-height prediction", () => {
  it("projects a median 10-year-old boy to the final male median", () => {
    expect(calculateFinalHeightPrediction("male", 10, 138.8)).toEqual({
      currentAgeYears: 10,
      currentHeightCm: 138.8,
      predictedFinalHeightCm: 174.5,
      percentile: 50,
      zScore: 0,
      isOutsideChartRange: false,
    });
  });

  it("projects a median 18-year-old girl to the final female median", () => {
    expect(calculateFinalHeightPrediction("female", 18, 160.6)).toEqual({
      currentAgeYears: 18,
      currentHeightCm: 160.6,
      predictedFinalHeightCm: 161.1,
      percentile: 50,
      zScore: 0,
      isOutsideChartRange: false,
    });
  });

  it("interpolates between standard-score rows", () => {
    const prediction = calculateFinalHeightPrediction("male", 14, 175);
    expect(prediction?.zScore).toBe(1.57);
    expect(prediction?.percentile).toBeCloseTo(94.2, 1);
    expect(prediction?.predictedFinalHeightCm).toBe(183.5);
  });

  it("clamps values outside the published -3SD to +3SD range", () => {
    expect(calculateFinalHeightPrediction("female", 14, 180)).toMatchObject({
      predictedFinalHeightCm: 177,
      percentile: 99.9,
      zScore: 3,
      isOutsideChartRange: true,
    });
  });

  it.each([
    [null, 14, 165],
    ["unknown", 14, 165],
    ["male", 9, 165],
    ["male", 19, 165],
    ["male", 14.5, 165],
    ["male", 14, null],
    ["male", 14, 99],
  ])("rejects incomplete or invalid input (%s, %s, %s)", (sex, age, height) => {
    expect(calculateFinalHeightPrediction(sex as "male", age as number, height as number)).toBeNull();
  });
});

describe("growth profile normalization and display", () => {
  it("normalizes stored values while preserving backward compatibility", () => {
    expect(normalizeOptionalHeight(undefined, CURRENT_HEIGHT_RANGE)).toBeNull();
    expect(normalizeOptionalHeight(165.56, CURRENT_HEIGHT_RANGE)).toBe(165.6);
    expect(normalizeGrowthSex("male")).toBe("male");
    expect(normalizeGrowthSex("other")).toBeNull();
    expect(normalizeGrowthAge(14)).toBe(14);
    expect(normalizeGrowthAge(14.5)).toBeNull();
  });

  it("formats percentile position as an easy-to-read top percentage", () => {
    expect(formatGrowthPercentile(0.1)).toBe("하위 1% 이내");
    expect(formatGrowthPercentile(50)).toBe("상위 약 50%");
    expect(formatGrowthPercentile(83.7)).toBe("상위 약 16%");
    expect(formatGrowthPercentile(99.9)).toBe("상위 1% 이내");
  });
});
