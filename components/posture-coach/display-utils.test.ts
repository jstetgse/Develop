import { describe, expect, it } from "vitest";

import { getStatusFromScore } from "@/components/posture-coach/display-utils";

describe("posture score status", () => {
  it.each([
    [null, "waiting"],
    [100, "good"],
    [80, "good"],
    [79, "warning"],
    [60, "warning"],
    [59, "danger"],
    [0, "danger"],
  ] as const)("classifies %s as %s", (score, expected) => {
    expect(getStatusFromScore(score)).toBe(expected);
  });
});
