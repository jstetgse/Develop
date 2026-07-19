import type { Settings } from "@/lib/types";

export function getStretchReminderMs(settings: Settings) {
  return settings.stretchReminderTestAlertEnabled ? 20_000 : settings.stretchReminderIntervalMinutes * 60 * 1000;
}

export function isWarningScore(score: number, settings: Settings) {
  return settings.warningAlertEnabled && score <= settings.warningScoreThreshold;
}

