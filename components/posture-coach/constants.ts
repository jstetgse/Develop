import type { Settings } from "@/lib/types";
export const STRETCH_FEEDBACK_INTERVAL_MS = 800;
export const STRETCH_HOLD_TARGET_MS = 5_000;
export const STRETCH_CALIBRATION_TARGET_MS = 2_000;
export const STRETCH_CALIBRATION_MIN_SAMPLES = 12;
export const STRETCH_CALIBRATION_MAX_MOVEMENT = 0.09;
export const SCORE_POINT_SAVE_INTERVAL_MS = 10_000;
export const STRETCH_BEEP_STORAGE_KEY = "posture-coach-stretch-beep-enabled";
export const STRETCH_TTS_STORAGE_KEY = "posture-coach-stretch-tts-enabled";
export const STRETCH_TTS_VOICE_STORAGE_KEY = "posture-coach-stretch-tts-voice";
export const STRETCH_TTS_COOLDOWN_MS = 2_000;
export const POSE_CONNECTIONS_FALLBACK: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];

export const DEFAULT_SETTINGS: Settings = {
  currentHeightCm: null,
  targetHeightCm: null,
  warningAlertEnabled: true,
  warningScoreThreshold: 60,
  badPostureDurationMinutes: 5,
  badPostureTestAlertEnabled: false,
  stretchReminderEnabled: true,
  stretchReminderIntervalMinutes: 30,
  stretchReminderTestAlertEnabled: false,
  landmarkOverlayEnabled: true,
  postureEffectSoundEnabled: true,
  smoothingEnabled: true,
  realtimeScoreIntervalSeconds: 1,
  preferredSideMode: "left",
  notificationPermissionStatus: "default",
};
