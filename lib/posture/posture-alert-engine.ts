import type { Settings } from "@/lib/types";

export function getStretchReminderMs(settings: Settings) {
  return settings.stretchReminderIntervalMinutes * 60 * 1000;
}

export function getBadPostureAlertMs(settings: Settings) {
  return settings.badPostureDurationMinutes * 60 * 1000;
}

export function isWarningScore(score: number, settings: Settings) {
  return settings.warningAlertEnabled && score <= settings.warningScoreThreshold;
}

