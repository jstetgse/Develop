import { useCallback, useEffect, useRef, useState } from "react";
import { ensureUserSettings, saveUserSettings } from "@/lib/repositories/settings-repository";
import type { NotificationPermissionStatus, Settings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/components/posture-coach/constants";
import {
  CURRENT_HEIGHT_RANGE,
  isGrowthAge,
  isGrowthSex,
  isHeightInRange,
  normalizeGrowthAge,
  normalizeGrowthSex,
  normalizeOptionalHeight,
} from "@/lib/growth-posture";

type SettingsSaveStatus = "idle" | "saving" | "saved" | "error";
export type AnalysisSettingsPanel = "analysis-options" | "posture-alerts" | "stretch-alerts";

function notificationPermission(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function defaultSettings(): Settings {
  return { ...DEFAULT_SETTINGS, notificationPermissionStatus: notificationPermission() };
}

export function useAnalysisSettings(uid: string | null) {
  const loadTokenRef = useRef(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsDraft, setSettingsDraft] = useState<Settings>(DEFAULT_SETTINGS);
  const [badPostureDurationMinutesInput, setBadPostureDurationMinutesInput] = useState(String(DEFAULT_SETTINGS.badPostureDurationMinutes));
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<SettingsSaveStatus>("idle");
  const [activeAnalysisSettingsPanel, setActiveAnalysisSettingsPanel] = useState<AnalysisSettingsPanel>("analysis-options");
  const [isAnalysisSettingsOpen, setIsAnalysisSettingsOpen] = useState(false);

  const replaceSettings = useCallback((next: Settings) => {
    const normalized = { ...next, smoothingEnabled: true, preferredSideMode: next.preferredSideMode === "right" ? "right" as const : "left" as const, notificationPermissionStatus: notificationPermission() };
    setSettings(normalized); setSettingsDraft(normalized); setBadPostureDurationMinutesInput(String(normalized.badPostureDurationMinutes)); setSettingsSaveStatus("idle");
  }, []);

  useEffect(() => {
    const token = ++loadTokenRef.current;
    if (!uid) { replaceSettings(defaultSettings()); return; }
    void ensureUserSettings(uid, defaultSettings()).then((loaded) => { if (loaded && token === loadTokenRef.current) replaceSettings(loaded); });
  }, [replaceSettings, uid]);

  const persistSettings = useCallback(async (next: Settings) => {
    if (!uid) return;
    setSettingsSaveStatus("saving");
    const saved = await saveUserSettings(uid, next);
    setSettingsSaveStatus(saved ? "saved" : "error");
  }, [uid]);
  const updateSettingsDraft = useCallback((changes: Partial<Settings>) => {
    setSettingsDraft((current) => ({ ...current, ...changes, smoothingEnabled: true, notificationPermissionStatus: notificationPermission() }));
    setSettingsSaveStatus("idle");
  }, []);
  const applySettings = useCallback(() => {
    const duration = Number(badPostureDurationMinutesInput);
    if (!Number.isInteger(duration) || duration < 1 || duration > 10) { setSettingsSaveStatus("error"); return; }
    const isCurrentHeightValid = settingsDraft.currentHeightCm === null || isHeightInRange(settingsDraft.currentHeightCm, CURRENT_HEIGHT_RANGE);
    const isCurrentAgeValid = settingsDraft.currentAgeYears === null || isGrowthAge(settingsDraft.currentAgeYears);
    const isGrowthSexValid = settingsDraft.growthSex === null || isGrowthSex(settingsDraft.growthSex);
    if (!isCurrentHeightValid || !isCurrentAgeValid || !isGrowthSexValid) { setSettingsSaveStatus("error"); return; }
    const next = {
      ...settingsDraft,
      growthSex: normalizeGrowthSex(settingsDraft.growthSex),
      currentAgeYears: normalizeGrowthAge(settingsDraft.currentAgeYears),
      currentHeightCm: normalizeOptionalHeight(settingsDraft.currentHeightCm, CURRENT_HEIGHT_RANGE),
      smoothingEnabled: true,
      badPostureDurationMinutes: duration,
      preferredSideMode: settingsDraft.preferredSideMode === "right" ? "right" as const : "left" as const,
      notificationPermissionStatus: notificationPermission(),
    };
    setSettings(next); setSettingsDraft(next); setBadPostureDurationMinutesInput(String(next.badPostureDurationMinutes)); void persistSettings(next);
  }, [badPostureDurationMinutesInput, persistSettings, settingsDraft]);
  const resetSettings = useCallback(() => { const next = defaultSettings(); setSettingsDraft(next); setBadPostureDurationMinutesInput(String(next.badPostureDurationMinutes)); setSettingsSaveStatus("idle"); }, []);
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) { updateSettingsDraft({ notificationPermissionStatus: "unsupported" }); return; }
    const permission = await Notification.requestPermission(); updateSettingsDraft({ notificationPermissionStatus: permission });
    if (permission === "granted") new Notification("알림 설정 완료", { body: "나쁜 자세가 감지되면 Windows 알림으로 알려드릴게요.", icon: "/favicon.ico" });
  }, [updateSettingsDraft]);

  return { settings, settingsDraft, badPostureDurationMinutesInput, settingsSaveStatus, activeAnalysisSettingsPanel, isAnalysisSettingsOpen, setBadPostureDurationMinutesInput, setSettingsSaveStatus, setActiveAnalysisSettingsPanel, setIsAnalysisSettingsOpen, updateSettingsDraft, applySettings, resetSettings, requestNotificationPermission };
}
