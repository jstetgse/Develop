export function smoothStretchScore(previous: number | null, current: number, previousWeight = 0.68) {
  return previous === null ? current : Math.round(previous * previousWeight + current * (1 - previousWeight));
}

export function shouldPublishStretchFeedback(now: number, lastPublishedAt: number, intervalMs: number, force = false) {
  return force || now - lastPublishedAt >= intervalMs;
}

