export type AnalysisCardView = "score" | "prediction";

export const ANALYSIS_CARD_ROTATION_MS = 60_000;

export function getNextAnalysisCardView(current: AnalysisCardView): AnalysisCardView {
  return current === "score" ? "prediction" : "score";
}

export function scheduleAnalysisCardRotation(onRotate: () => void) {
  const timer = globalThis.setTimeout(onRotate, ANALYSIS_CARD_ROTATION_MS);
  return () => globalThis.clearTimeout(timer);
}
