export type AnalysisCardView = "score" | "growth";

export const ANALYSIS_CARD_ROTATION_MS = 60_000;

export function getNextAnalysisCardView(current: AnalysisCardView): AnalysisCardView {
  return current === "score" ? "growth" : "score";
}

export function scheduleAnalysisCardRotation(onRotate: () => void) {
  const timer = globalThis.setTimeout(onRotate, ANALYSIS_CARD_ROTATION_MS);
  return () => globalThis.clearTimeout(timer);
}
