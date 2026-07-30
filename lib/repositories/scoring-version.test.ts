import { describe, expect, it } from "vitest";

import {
  CURRENT_SCORING_VERSION,
  LEGACY_SCORING_VERSION,
  normalizeScoringVersion,
} from "@/lib/types";

describe("scoring version compatibility", () => {
  it("uses the legacy version when old data has no version", () => {
    expect(normalizeScoringVersion(undefined)).toBe(LEGACY_SCORING_VERSION);
  });

  it("preserves the current aspect-corrected version", () => {
    expect(normalizeScoringVersion(CURRENT_SCORING_VERSION)).toBe(CURRENT_SCORING_VERSION);
  });

  it("treats unknown versions as legacy instead of changing score fields", () => {
    const stored = { scoringVersion: "unknown", averageScore: 73, bestScore: 91 };
    const normalized = {
      ...stored,
      scoringVersion: normalizeScoringVersion(stored.scoringVersion),
    };
    expect(normalized).toEqual({
      scoringVersion: LEGACY_SCORING_VERSION,
      averageScore: 73,
      bestScore: 91,
    });
  });
});
