import { describe, expect, it } from "vitest";

import {
  createGrowthPostureWeek,
  getGrowthPostureDayStatus,
  getGrowthPostureHistoryMessage,
} from "@/components/posture-coach/growth-posture-utils";
import type { HistoryGroup } from "@/lib/types";

function createHistoryGroup(dateKey: string, averageScore: number | null): HistoryGroup {
  return {
    dateKey,
    averageScore,
    totalUsageMinutes: 1,
    alertCount: 0,
    sessionCount: 1,
    sessions: [],
  };
}

describe("growth posture week", () => {
  it("creates the seven Korea dates ending today in chronological order", () => {
    const days = createGrowthPostureWeek([], new Date("2026-08-16T00:30:00+09:00"));
    expect(days.map((day) => day.dateKey)).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });

  it("distinguishes score bands, insufficient measurements, and missing dates", () => {
    const days = createGrowthPostureWeek(
      [
        createHistoryGroup("2026-08-12", 80),
        createHistoryGroup("2026-08-13", 60),
        createHistoryGroup("2026-08-14", 59),
        createHistoryGroup("2026-08-15", null),
      ],
      new Date("2026-08-16T12:00:00+09:00")
    );
    expect(days.map((day) => day.status)).toEqual([
      "unmeasured",
      "unmeasured",
      "good",
      "warning",
      "danger",
      "insufficient",
      "unmeasured",
    ]);
  });
});

describe("growth posture history copy", () => {
  it.each([
    [80, "good"],
    [79, "warning"],
    [60, "warning"],
    [59, "danger"],
    [null, "insufficient"],
  ] as const)("classifies %s as %s", (score, expected) => {
    expect(getGrowthPostureDayStatus(score, true)).toBe(expected);
  });

  it("returns a daily message for measured and insufficient days", () => {
    expect(getGrowthPostureHistoryMessage(85)).toContain("좋은 자세");
    expect(getGrowthPostureHistoryMessage(70)).toContain("바른 자세");
    expect(getGrowthPostureHistoryMessage(50)).toContain("다음 분석");
    expect(getGrowthPostureHistoryMessage(null)).toContain("측정 시간이 부족");
  });
});
