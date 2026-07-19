import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { getCameraErrorMessage } from "@/components/posture-coach/display-utils";
import { getKoreaDateKey, hasPostureAreaStats } from "@/components/posture-coach/history-utils";
import type { PoseResults } from "@/components/posture-coach/mediapipe/mediapipe-types";
import type { AppMode, Tab } from "@/components/posture-coach/types";
import { usePoseCamera } from "@/components/posture-coach/hooks/use-pose-camera";
import { usePostureSession } from "@/components/posture-coach/hooks/use-posture-session";
import { useStretchSession } from "@/components/posture-coach/hooks/use-stretch-session";
import { getStretchReminderMs } from "@/lib/posture/posture-alert-engine";
import { createSession, finalizeSessionSummary } from "@/lib/repositories/posture-session-repository";
import { getSessionTitleKey } from "@/lib/session-title";
import type { Settings } from "@/lib/types";
import type { PendingTitleSession } from "@/components/posture-coach/hooks/use-history-records";

type Props = {
  uid: string | null;
  settings: Settings;
  appMode: AppMode;
  setAppMode: Dispatch<SetStateAction<AppMode>>;
  setAuthMessage: (message: string | null) => void;
  refreshHistory: (uid?: string | null) => Promise<void>;
  openPendingTitle: (session: PendingTitleSession) => void;
  playStretchBeep: (count: 1 | 2 | 3, eventKey: string, delayMs?: number) => void;
  speakStretchCue: (message: string, eventKey: string, delayMs?: number) => void;
  resetStretchAudioEvents: (userStarted?: boolean) => void;
  setStretchTtsUserStarted: (started: boolean) => void;
};

function createEmptyPostureAreaStats() {
  return {
    neck: { lowCount: 0, totalCount: 0, averageScore: null },
    torso: { lowCount: 0, totalCount: 0, averageScore: null },
    stability: { lowCount: 0, totalCount: 0, averageScore: null },
  };
}

export function useAnalysisRuntime(props: Props) {
  const { uid, settings, appMode, setAppMode, setAuthMessage, refreshHistory, openPendingTitle, playStretchBeep, speakStretchCue, resetStretchAudioEvents, setStretchTtsUserStarted } = props;
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [isRunning, setIsRunning] = useState(false);
  const [pendingCameraStart, setPendingCameraStart] = useState(false);
  const [modeMessage, setModeMessage] = useState<string | null>(null);
  const [cameraText, setCameraText] = useState("카메라 대기");
  const [cameraTone, setCameraTone] = useState<"good" | "warn" | "danger" | "neutral">("neutral");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const activeTabRef = useRef<Tab>("home");
  const appModeRef = useRef<AppMode>("paused");
  const poseFrameHandlerRef = useRef<(results: PoseResults) => void>(() => undefined);
  const startAppHandlerRef = useRef<() => Promise<void>>(async () => undefined);
  const captureFrameHandlerRef = useRef<() => string | null>(() => null);
  const captureFrameProxy = useCallback(() => captureFrameHandlerRef.current(), []);

  const posture = usePostureSession({ uid, settings, captureCurrentFrame: captureFrameProxy, setActiveTab, setAlertMessage });
  const startAppProxy = useCallback(() => startAppHandlerRef.current(), []);
  const stretch = useStretchSession({
    isRunning, appMode, uidRef: posture.uidRef, sessionIdRef: posture.sessionIdRef, appModeRef,
    alertVisibleUntilRef: posture.alertVisibleUntilRef, postureAlertVisibleUntilRef: posture.postureAlertVisibleUntilRef,
    badPostureStartedAtRef: posture.badPostureStartedAtRef, posturePausedStartedAtRef: posture.posturePausedStartedAtRef,
    totalPosturePausedMsRef: posture.totalPosturePausedMsRef, wasPostureRunningBeforeStretchRef: posture.wasPostureRunningBeforeStretchRef,
    setActiveTab, setAppMode, setModeMessage, setCameraText, setCameraTone, setAlertMessage,
    startApp: startAppProxy, playStretchBeep, speakStretchCue, resetStretchAudioEvents, setStretchTtsUserStarted,
  });
  const poseFrameProxy = useCallback((results: PoseResults) => poseFrameHandlerRef.current(results), []);
  const camera = usePoseCamera({
    activeTab, isRunning, showLandmarks: settings.landmarkOverlayEnabled, onPoseFrame: poseFrameProxy,
    getOverlayState: () => ({
      stretchId: activeTabRef.current === "stretching" ? stretch.activeStretchIdRef.current : null,
      stepIndex: stretch.activeStretchStepIndexRef.current,
      coaching: stretch.latestStretchCoachingRef.current,
      calibration: stretch.stretchCalibrationRef.current,
    }),
  });
  captureFrameHandlerRef.current = camera.captureCurrentFrame;

  const handlePoseResults = useCallback((results: PoseResults) => {
    posture.latestLandmarksRef.current = results.poseLandmarks ?? null;
    if (appModeRef.current === "stretching") {
      setCameraText("스트레칭 분석 중");
      setCameraTone("good");
      stretch.processFrame(results.poseLandmarks ?? null);
      return;
    }
    if (appModeRef.current !== "posture") {
      posture.badPostureStartedAtRef.current = null;
      return;
    }
    const result = posture.analyzerRef.current.analyze(results.poseLandmarks, posture.settingsRef.current.preferredSideMode);
    if (result.isTracking) {
      setCameraText("카메라 분석 중");
      setCameraTone("good");
    } else if (isRunning) {
      setCameraText("자세가 감지되지 않습니다.");
      setCameraTone("warn");
      posture.badPostureStartedAtRef.current = null;
    }
    const averagePosture = posture.recordPostureScore(result);
    if (averagePosture) {
      void posture.updateAlerts({ ...result, isBadPosture: result.score !== null && result.score <= posture.settingsRef.current.warningScoreThreshold });
      void posture.persistSnapshotIfNeeded(averagePosture);
    }
  }, [isRunning, posture, stretch]);
  poseFrameHandlerRef.current = handlePoseResults;

  const stopApp = useCallback(async () => {
    await camera.stopCamera();
    const currentUid = posture.uidRef.current;
    const sessionId = posture.sessionIdRef.current;
    const startedAt = posture.startedAtRef.current;
    const finalAverageScore = posture.latestSessionAverageRef.current;
    const areaStats = hasPostureAreaStats(posture.postureAreaStatsRef.current) ? posture.postureAreaStatsRef.current : undefined;
    let finalizedSessionForTitle: PendingTitleSession | null = null;
    const activePausedMs = posture.posturePausedStartedAtRef.current === null ? 0 : Date.now() - posture.posturePausedStartedAtRef.current;
    if (currentUid && sessionId && startedAt) {
      const endedAt = new Date().toISOString();
      const postureDurationMs = Math.max(0, Date.now() - new Date(startedAt).getTime() - posture.totalPosturePausedMsRef.current - activePausedMs);
      const finalized = await finalizeSessionSummary(currentUid, sessionId, {
        endedAt, averageScore: finalAverageScore, durationMinutes: Math.max(1, Math.round(postureDurationMs / 60000)),
        alertCount: posture.alertCountRef.current, bestScore: posture.bestSnapshotRef.current?.score ?? null,
        worstScore: posture.worstSnapshotRef.current?.score ?? null, bestImageUrl: posture.bestSnapshotRef.current?.imageUrl ?? null,
        worstImageUrl: posture.worstSnapshotRef.current?.imageUrl ?? null, preferredSideMode: posture.settingsRef.current.preferredSideMode,
        postureAreaStats: areaStats,
      });
      if (finalized) {
        const dateKey = getKoreaDateKey(new Date(startedAt));
        finalizedSessionForTitle = { sessionId, sessionTitleKey: getSessionTitleKey({ sessionId, startedAt }, dateKey), dateKey, startedAt };
      }
    }
    posture.sessionIdRef.current = null;
    posture.startedAtRef.current = null;
    posture.scoreSamplesRef.current = [];
    posture.realtimeScoreWindowRef.current = [];
    posture.lastRealtimeScoreUpdateAtRef.current = 0;
    posture.scoreTotalRef.current = 0;
    posture.scoreCountRef.current = 0;
    posture.latestSessionAverageRef.current = null;
    posture.postureAreaStatsRef.current = createEmptyPostureAreaStats();
    posture.lastScoreTrendUpdateAtRef.current = 0;
    posture.nextStretchReminderAtRef.current = 0;
    posture.latestLandmarksRef.current = null;
    posture.alertVisibleUntilRef.current = 0;
    posture.postureAlertVisibleUntilRef.current = 0;
    posture.stretchAlertVisibleUntilRef.current = 0;
    posture.alertCountRef.current = 0;
    posture.badPostureStartedAtRef.current = null;
    posture.wasPostureRunningBeforeStretchRef.current = false;
    posture.posturePausedStartedAtRef.current = null;
    posture.totalPosturePausedMsRef.current = 0;
    stretch.resetForAppStop();
    posture.lastSnapshotAtRef.current = 0;
    posture.snapshotSavingRef.current = false;
    posture.bestSnapshotRef.current = null;
    posture.worstSnapshotRef.current = null;
    setIsRunning(false);
    setPendingCameraStart(false);
    stretch.setIsStretchingMode(false);
    appModeRef.current = "paused";
    setAppMode("paused");
    setModeMessage(null);
    posture.setSessionAverageScore(finalAverageScore);
    setCameraText("카메라 대기");
    setCameraTone("neutral");
    setAlertMessage(null);
    await refreshHistory(currentUid);
    if (finalizedSessionForTitle) openPendingTitle(finalizedSessionForTitle);
    posture.liveScorePointsRef.current = [];
    posture.lastScorePointSavedAtRef.current = 0;
    posture.setLiveScorePoints([]);
  }, [camera, openPendingTitle, posture, refreshHistory, stretch]);

  const startApp = useCallback(async () => {
    if (isRunning) return;
    if (!posture.uidRef.current) { setAuthMessage("로그인 후 분석을 시작할 수 있습니다."); return; }
    if (!camera.videoRef.current) {
      setPendingCameraStart(true);
      setCameraText("카메라 화면 준비 중");
      setCameraTone("warn");
      return;
    }
    posture.analyzerRef.current.reset();
    posture.analyzerRef.current.setPreferredSideMode(posture.settingsRef.current.preferredSideMode);
    posture.scoreSamplesRef.current = [];
    posture.realtimeScoreWindowRef.current = [];
    posture.lastRealtimeScoreUpdateAtRef.current = 0;
    posture.scoreTotalRef.current = 0;
    posture.scoreCountRef.current = 0;
    posture.latestSessionAverageRef.current = null;
    posture.postureAreaStatsRef.current = createEmptyPostureAreaStats();
    posture.lastScoreTrendUpdateAtRef.current = 0;
    posture.liveScorePointsRef.current = [];
    posture.lastScorePointSavedAtRef.current = 0;
    posture.setLiveScorePoints([]);
    posture.alertCountRef.current = 0;
    posture.badPostureStartedAtRef.current = null;
    posture.alertVisibleUntilRef.current = 0;
    posture.postureAlertVisibleUntilRef.current = 0;
    posture.stretchAlertVisibleUntilRef.current = 0;
    posture.setHasCurrentSessionPostureData(false);
    if (appModeRef.current !== "stretching") {
      posture.wasPostureRunningBeforeStretchRef.current = false;
      posture.posturePausedStartedAtRef.current = null;
    }
    posture.totalPosturePausedMsRef.current = 0;
    posture.bestSnapshotRef.current = null;
    posture.worstSnapshotRef.current = null;
    posture.lastSnapshotAtRef.current = 0;
    setAlertMessage(null);
    posture.setLatestPosture(posture.createInitialPosture());
    posture.setSessionAverageScore(null);
    stretch.resetForAppStart();
    setCameraText("카메라 시작 중");
    setCameraTone("warn");
    try {
      await camera.startCamera();
      setIsRunning(true);
      setCameraText("자세 분석 준비 중");
      setCameraTone("warn");
      if (appModeRef.current === "stretching") setCameraText("스트레칭 분석 중");
      else { appModeRef.current = "posture"; setAppMode("posture"); setCameraText("자세 분석 중"); }
      setCameraTone("good");
      const currentUid = posture.uidRef.current;
      const sessionId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      posture.sessionIdRef.current = sessionId;
      posture.startedAtRef.current = startedAt;
      posture.nextStretchReminderAtRef.current = posture.settingsRef.current.stretchReminderEnabled ? Date.now() + getStretchReminderMs(posture.settingsRef.current) : 0;
      if (currentUid) void createSession(currentUid, sessionId, startedAt, posture.settingsRef.current.preferredSideMode);
    } catch (error) {
      console.error("Failed to start webcam:", error);
      const message = error instanceof Error ? error.message : "";
      const isPoseLoadError = message.includes("MediaPipe") || message.includes("Pose") || message.includes("@mediapipe");
      setCameraText(isPoseLoadError ? "자세 분석 오류" : "카메라 사용 불가");
      setCameraTone("danger");
      setAlertMessage(isPoseLoadError ? "자세 분석 엔진을 불러오지 못했습니다." : getCameraErrorMessage(error));
      await camera.stopCamera();
      posture.sessionIdRef.current = null;
      posture.startedAtRef.current = null;
      setIsRunning(false);
      setPendingCameraStart(false);
    }
  }, [camera, isRunning, posture, setAuthMessage, stretch]);
  startAppHandlerRef.current = startApp;

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { appModeRef.current = appMode; }, [appMode]);
  useEffect(() => {
    if (!pendingCameraStart || !["analysis", "stretching"].includes(activeTab) || isRunning || !camera.videoRef.current) return;
    setPendingCameraStart(false);
    void startApp();
  }, [activeTab, camera.videoRef, isRunning, pendingCameraStart, startApp]);

  return { activeTab, setActiveTab, isRunning, appMode, modeMessage, cameraText, cameraTone, alertMessage, startApp, stopApp, videoRef: camera.videoRef, canvasRef: camera.canvasRef, posture, stretch };
}
