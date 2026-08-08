export type PostureScreenEffectLevel = "none" | "cracked" | "shattered";

export type PostureScreenEffectState = {
  level: PostureScreenEffectLevel;
  badPostureDurationMs: number;
  severePostureDurationMs: number;
  recoveryStartedAt: number | null;
  trackingLostAt: number | null;
  lastUpdatedAt: number;
};

export type PostureScreenEffectInput = {
  now: number;
  isRunning: boolean;
  isTracking: boolean;
  neckAngleDegrees: number | null;
};

export const POSTURE_EFFECT_CRACKED_AFTER_MS = 7_000;
export const POSTURE_EFFECT_SHATTERED_AFTER_MS = 10_000;
export const POSTURE_EFFECT_RECOVERY_MS = 500;
export const POSTURE_EFFECT_TRACKING_GRACE_MS = 1_000;
export const POSTURE_EFFECT_SOUND_COOLDOWN_MS = 5_000;

const CRACKED_TRIGGER_ANGLE_DEGREES = 40;
const SHATTERED_TRIGGER_ANGLE_DEGREES = 50;
const RECOVERED_NECK_ANGLE_DEGREES = 20;

export function createPostureScreenEffectState(now = 0): PostureScreenEffectState {
  return {
    level: "none",
    badPostureDurationMs: 0,
    severePostureDurationMs: 0,
    recoveryStartedAt: null,
    trackingLostAt: null,
    lastUpdatedAt: now,
  };
}

export function updatePostureScreenEffectState(
  state: PostureScreenEffectState,
  input: PostureScreenEffectInput
): PostureScreenEffectState {
  const now = Math.max(input.now, state.lastUpdatedAt);

  if (!input.isRunning) {
    return createPostureScreenEffectState(now);
  }

  if (!input.isTracking || input.neckAngleDegrees === null || !Number.isFinite(input.neckAngleDegrees)) {
    const trackingLostAt = state.trackingLostAt ?? now;
    if (now - trackingLostAt >= POSTURE_EFFECT_TRACKING_GRACE_MS) {
      return createPostureScreenEffectState(now);
    }
    return { ...state, trackingLostAt, lastUpdatedAt: now };
  }

  const elapsedMs = state.trackingLostAt === null ? now - state.lastUpdatedAt : 0;
  const angle = input.neckAngleDegrees;

  if (angle <= RECOVERED_NECK_ANGLE_DEGREES) {
    if (state.level === "none") {
      return createPostureScreenEffectState(now);
    }
    const recoveryStartedAt = state.recoveryStartedAt ?? now;
    if (now - recoveryStartedAt >= POSTURE_EFFECT_RECOVERY_MS) {
      return createPostureScreenEffectState(now);
    }
    return {
      ...state,
      recoveryStartedAt,
      trackingLostAt: null,
      lastUpdatedAt: now,
    };
  }

  const badPostureDurationMs =
    angle > CRACKED_TRIGGER_ANGLE_DEGREES ? state.badPostureDurationMs + elapsedMs : 0;
  const severePostureDurationMs =
    angle > SHATTERED_TRIGGER_ANGLE_DEGREES ? state.severePostureDurationMs + elapsedMs : 0;
  const level: PostureScreenEffectLevel =
    severePostureDurationMs >= POSTURE_EFFECT_SHATTERED_AFTER_MS
      ? "shattered"
      : state.level === "shattered" || state.level === "cracked"
        ? "cracked"
        : badPostureDurationMs >= POSTURE_EFFECT_CRACKED_AFTER_MS
        ? "cracked"
        : "none";

  return {
    level,
    badPostureDurationMs,
    severePostureDurationMs,
    recoveryStartedAt: null,
    trackingLostAt: null,
    lastUpdatedAt: now,
  };
}

const EFFECT_RANK: Record<PostureScreenEffectLevel, number> = {
  none: 0,
  cracked: 1,
  shattered: 2,
};

export function shouldPlayPostureEffectSound({
  previousLevel,
  nextLevel,
  now,
  lastPlayedAt,
}: {
  previousLevel: PostureScreenEffectLevel;
  nextLevel: PostureScreenEffectLevel;
  now: number;
  lastPlayedAt: number | null;
}) {
  if (nextLevel === "none" || EFFECT_RANK[nextLevel] <= EFFECT_RANK[previousLevel]) {
    return false;
  }
  return lastPlayedAt === null || now - lastPlayedAt >= POSTURE_EFFECT_SOUND_COOLDOWN_MS;
}
