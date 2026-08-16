import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANALYSIS_CARD_ROTATION_MS,
  getNextAnalysisCardView,
  scheduleAnalysisCardRotation,
} from "@/components/posture-coach/analysis-card-rotation";

afterEach(() => {
  vi.useRealTimers();
});

describe("analysis card rotation", () => {
  it("alternates between score and growth cards", () => {
    expect(getNextAnalysisCardView("score")).toBe("growth");
    expect(getNextAnalysisCardView("growth")).toBe("score");
  });

  it("rotates only after five seconds", () => {
    vi.useFakeTimers();
    const onRotate = vi.fn();
    scheduleAnalysisCardRotation(onRotate);

    vi.advanceTimersByTime(ANALYSIS_CARD_ROTATION_MS - 1);
    expect(onRotate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onRotate).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending rotation", () => {
    vi.useFakeTimers();
    const onRotate = vi.fn();
    const cancel = scheduleAnalysisCardRotation(onRotate);

    cancel();
    vi.advanceTimersByTime(ANALYSIS_CARD_ROTATION_MS);
    expect(onRotate).not.toHaveBeenCalled();
  });
});
