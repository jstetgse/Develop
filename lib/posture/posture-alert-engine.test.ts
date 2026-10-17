import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "@/components/posture-coach/constants";
import { getBadPostureAlertMs, getStretchReminderMs } from "@/lib/posture/posture-alert-engine";

describe("posture alert intervals", () => {
  it("uses the configured bad-posture duration", () => {
    expect(getBadPostureAlertMs({ ...DEFAULT_SETTINGS, badPostureDurationMinutes: 3 })).toBe(180_000);
  });

  it("uses the configured stretch reminder interval", () => {
    expect(getStretchReminderMs({ ...DEFAULT_SETTINGS, stretchReminderIntervalMinutes: 40 })).toBe(2_400_000);
  });

  it("ignores legacy test-mode fields from stored settings", () => {
    const legacySettings = {
      ...DEFAULT_SETTINGS,
      badPostureDurationMinutes: 5,
      stretchReminderIntervalMinutes: 30,
      badPostureTestAlertEnabled: true,
      stretchReminderTestAlertEnabled: true,
    };

    expect(getBadPostureAlertMs(legacySettings)).toBe(300_000);
    expect(getStretchReminderMs(legacySettings)).toBe(1_800_000);
  });
});
