import { describe, expect, it } from "vitest";

import {
  createPostureScreenEffectState,
  shouldPlayPostureEffectSound,
  updatePostureScreenEffectState,
} from "@/lib/posture/posture-screen-effect";

function update(
  state: ReturnType<typeof createPostureScreenEffectState>,
  now: number,
  neckAngleDegrees: number | null,
  overrides: Partial<{ isRunning: boolean; isTracking: boolean }> = {}
) {
  return updatePostureScreenEffectState(state, {
    now,
    isRunning: overrides.isRunning ?? true,
    isTracking: overrides.isTracking ?? true,
    neckAngleDegrees,
  });
}

describe("posture screen effect state", () => {
  it("does not crack at the 40 degree boundary", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 8_000, 40);
    expect(state.level).toBe("none");
  });

  it("shows cracks after an angle above 40 degrees persists for seven seconds", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 6_999, 41);
    expect(state.level).toBe("none");
    state = update(state, 7_000, 41);
    expect(state.level).toBe("cracked");
  });

  it("does not shatter at 50 degrees and shatters above it after ten seconds", () => {
    let boundary = createPostureScreenEffectState(0);
    boundary = update(boundary, 10_000, 50);
    expect(boundary.level).toBe("cracked");

    let severe = createPostureScreenEffectState(0);
    severe = update(severe, 9_999, 51);
    expect(severe.level).toBe("cracked");
    severe = update(severe, 10_000, 51);
    expect(severe.level).toBe("shattered");
  });

  it("resets the crack timer when the angle drops to 40 degrees before activation", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 6_000, 41);
    state = update(state, 6_100, 40);
    state = update(state, 13_099, 41);
    expect(state.level).toBe("none");
    state = update(state, 13_100, 41);
    expect(state.level).toBe("cracked");
  });

  it("resets pre-activation time immediately during a brief good-posture dip", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 6_500, 41);
    state = update(state, 6_600, 20);
    state = update(state, 13_599, 41);
    expect(state.level).toBe("none");
    state = update(state, 13_600, 41);
    expect(state.level).toBe("cracked");
  });

  it("keeps cracks visible between 21 and 40 degrees after activation", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 7_000, 41);
    state = update(state, 20_000, 21);
    expect(state.level).toBe("cracked");
    expect(state.badPostureDurationMs).toBe(0);
  });

  it("downgrades shattered to cracked when the angle drops to 50 degrees", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 10_000, 51);
    expect(state.level).toBe("shattered");
    state = update(state, 10_100, 50);
    expect(state.level).toBe("cracked");
    expect(state.severePostureDurationMs).toBe(0);
  });

  it("requires half a second of recovery before clearing", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 10_000, 51);
    state = update(state, 10_100, 20);
    state = update(state, 10_599, 20);
    expect(state.level).toBe("shattered");
    state = update(state, 10_600, 20);
    expect(state.level).toBe("none");
  });

  it("holds through a short tracking loss and clears after one second", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 7_000, 41);
    state = update(state, 7_100, null, { isTracking: false });
    state = update(state, 8_099, null, { isTracking: false });
    expect(state.level).toBe("cracked");
    state = update(state, 8_100, null, { isTracking: false });
    expect(state.level).toBe("none");
  });

  it("does not count tracking-loss time toward the duration", () => {
    let state = createPostureScreenEffectState(0);
    state = update(state, 6_500, 41);
    state = update(state, 6_600, null, { isTracking: false });
    state = update(state, 7_000, 41);
    state = update(state, 7_499, 41);
    expect(state.level).toBe("none");
    state = update(state, 7_500, 41);
    expect(state.level).toBe("cracked");
  });
});

describe("posture effect sound transitions", () => {
  it("plays only on an upward transition", () => {
    expect(shouldPlayPostureEffectSound({ previousLevel: "none", nextLevel: "cracked", now: 0, lastPlayedAt: null })).toBe(true);
    expect(shouldPlayPostureEffectSound({ previousLevel: "cracked", nextLevel: "cracked", now: 6_000, lastPlayedAt: 0 })).toBe(false);
    expect(shouldPlayPostureEffectSound({ previousLevel: "shattered", nextLevel: "cracked", now: 6_000, lastPlayedAt: 0 })).toBe(false);
  });

  it("allows a direct shattered transition and applies the cooldown", () => {
    expect(shouldPlayPostureEffectSound({ previousLevel: "none", nextLevel: "shattered", now: 10_000, lastPlayedAt: null })).toBe(true);
    expect(shouldPlayPostureEffectSound({ previousLevel: "none", nextLevel: "shattered", now: 14_999, lastPlayedAt: 10_000 })).toBe(false);
    expect(shouldPlayPostureEffectSound({ previousLevel: "none", nextLevel: "shattered", now: 15_000, lastPlayedAt: 10_000 })).toBe(true);
  });
});
