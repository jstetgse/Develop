import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { SCORE_POINT_SAVE_INTERVAL_MS } from "@/components/posture-coach/constants";
import { getIssueText } from "@/components/posture-coach/display-utils";
import { recordPostureAreaStats } from "@/components/posture-coach/history-utils";
import type { Tab } from "@/components/posture-coach/types";
import { getStretchReminderMs } from "@/lib/posture/posture-alert-engine";
import { averageScores, createLiveScorePoint, withPostureScore } from "@/lib/posture/posture-score-stream";
import { calculateSessionAverage } from "@/lib/posture/posture-session-summary";
import { PostureAnalyzer } from "@/lib/posture-analysis";
import { saveAlertLog, saveScorePoint, uploadSessionExtremaImage } from "@/lib/repositories/posture-session-repository";
import type { PostureAreaStats, PostureResult, Settings } from "@/lib/types";

type ScorePoint = { id: string; time: string; timestamp: number; score: number };
type SnapshotExtrema = {
  score: number;
  imageUrl: string | null;
  imagePath: string | null;
  imageScore: number | null;
  imageCapturedAt: number | null;
} | null;
type ExtremaImageKind = "best" | "worst";

const EXTREMA_IMAGE_MIN_DELTA = 3;
const EXTREMA_IMAGE_UPLOAD_COOLDOWN_MS = 10_000;

type Props = {
  uid: string | null;
  settings: Settings;
  captureCurrentFrame: () => string | null;
  setActiveTab: Dispatch<SetStateAction<Tab>>;
  setAlertMessage: Dispatch<SetStateAction<string | null>>;
};

function createInitialPosture(): PostureResult {
  return {
    score: null,
    neckStatus: "대기",
    torsoStatus: "대기",
    stabilityStatus: "대기",
    feedbackMessage: "카메라를 시작하면 자세 분석이 시작됩니다.",
    feedbackItems: [],
    isBadPosture: false,
    isTracking: false,
    mainIssue: "tracking",
    metrics: null,
    analysisSide: null,
  };
}

function showDesktopNotification(title: string, body: string, options: { tag?: string; onClick?: () => void } = {}) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, { body, icon: "/favicon.ico", tag: options.tag });
    notification.onclick = () => {
      window.focus();
      options.onClick?.();
      notification.close();
    };
  } catch (error) {
    console.warn("Failed to show desktop notification:", error);
  }
}

function getRealtimeScoreIntervalMs(settings: Settings) {
  return Math.min(Math.max(Math.round(settings.realtimeScoreIntervalSeconds), 1), 5) * 1000;
}

function createEmptyPostureAreaStats(): PostureAreaStats {
  return {
    neck: { lowCount: 0, totalCount: 0, averageScore: null },
    torso: { lowCount: 0, totalCount: 0, averageScore: null },
    stability: { lowCount: 0, totalCount: 0, averageScore: null },
  };
}

function createExtremaScore(score: number): NonNullable<SnapshotExtrema> {
  return {
    score,
    imageUrl: null,
    imagePath: null,
    imageScore: null,
    imageCapturedAt: null,
  };
}

function shouldUploadBestImage(snapshot: SnapshotExtrema, score: number, now: number, lastUploadedAt: number) {
  if (!snapshot?.imageUrl || typeof snapshot.imageScore !== "number") {
    return true;
  }
  return score >= snapshot.imageScore + EXTREMA_IMAGE_MIN_DELTA && now - lastUploadedAt >= EXTREMA_IMAGE_UPLOAD_COOLDOWN_MS;
}

function shouldUploadWorstImage(snapshot: SnapshotExtrema, score: number, now: number, lastUploadedAt: number) {
  if (!snapshot?.imageUrl || typeof snapshot.imageScore !== "number") {
    return true;
  }
  return score <= snapshot.imageScore - EXTREMA_IMAGE_MIN_DELTA && now - lastUploadedAt >= EXTREMA_IMAGE_UPLOAD_COOLDOWN_MS;
}

export function usePostureSession({ uid, settings, captureCurrentFrame, setActiveTab, setAlertMessage }: Props) {
  const [latestPosture, setLatestPosture] = useState<PostureResult>(createInitialPosture);
  const [hasCurrentSessionPostureData, setHasCurrentSessionPostureData] = useState(false);
  const [liveScorePoints, setLiveScorePoints] = useState<ScorePoint[]>([]);
  const [sessionAverageScore, setSessionAverageScore] = useState<number | null>(null);

  const analyzerRef = useRef(new PostureAnalyzer());
  const settingsRef = useRef(settings);
  const uidRef = useRef(uid);
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const scoreSamplesRef = useRef<number[]>([]);
  const realtimeScoreWindowRef = useRef<number[]>([]);
  const lastRealtimeScoreUpdateAtRef = useRef(0);
  const scoreTotalRef = useRef(0);
  const scoreCountRef = useRef(0);
  const latestSessionAverageRef = useRef<number | null>(null);
  const liveScorePointsRef = useRef<ScorePoint[]>([]);
  const lastScorePointSavedAtRef = useRef(0);
  const postureAreaStatsRef = useRef<PostureAreaStats>(createEmptyPostureAreaStats());
  const lastScoreTrendUpdateAtRef = useRef(0);
  const nextStretchReminderAtRef = useRef(0);
  const latestLandmarksRef = useRef<unknown[] | null>(null);
  const alertVisibleUntilRef = useRef(0);
  const postureAlertVisibleUntilRef = useRef(0);
  const stretchAlertVisibleUntilRef = useRef(0);
  const alertCountRef = useRef(0);
  const badPostureStartedAtRef = useRef<number | null>(null);
  const wasPostureRunningBeforeStretchRef = useRef(false);
  const posturePausedStartedAtRef = useRef<number | null>(null);
  const totalPosturePausedMsRef = useRef(0);
  const bestSnapshotRef = useRef<SnapshotExtrema>(null);
  const worstSnapshotRef = useRef<SnapshotExtrema>(null);
  const bestImageUploadInProgressRef = useRef(false);
  const worstImageUploadInProgressRef = useRef(false);
  const bestImageLastUploadedAtRef = useRef(0);
  const worstImageLastUploadedAtRef = useRef(0);
  const bestImageUploadPromiseRef = useRef<Promise<void> | null>(null);
  const worstImageUploadPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => { uidRef.current = uid; }, [uid]);
  useEffect(() => {
    settingsRef.current = settings;
    analyzerRef.current.setPreferredSideMode(settings.preferredSideMode);
  }, [settings]);

  const clearLiveScorePoints = useCallback(() => {
    setLiveScorePoints([]);
    liveScorePointsRef.current = [];
  }, []);

  const uploadExtremaImage = useCallback((
    kind: ExtremaImageKind,
    score: number,
    imageDataUrl: string,
    capturedAt: number
  ) => {
    const currentUid = uidRef.current;
    const sessionId = sessionIdRef.current;
    if (!currentUid || !sessionId) {
      return Promise.resolve();
    }

    const isBest = kind === "best";
    if (isBest ? bestImageUploadInProgressRef.current : worstImageUploadInProgressRef.current) {
      return Promise.resolve();
    }

    if (isBest) {
      bestImageUploadInProgressRef.current = true;
    } else {
      worstImageUploadInProgressRef.current = true;
    }

    let uploadPromise!: Promise<void>;
    uploadPromise = (async () => {
      try {
        const uploaded = await uploadSessionExtremaImage(currentUid, sessionId, kind, imageDataUrl);
        if (!uploaded) {
          return;
        }

        const current = isBest ? bestSnapshotRef.current : worstSnapshotRef.current;
        const nextSnapshot: NonNullable<SnapshotExtrema> = {
          ...(current ?? createExtremaScore(score)),
          score: current?.score ?? score,
          imageUrl: uploaded.imageUrl,
          imagePath: uploaded.imagePath,
          imageScore: score,
          imageCapturedAt: capturedAt,
        };

        if (isBest) {
          bestSnapshotRef.current = nextSnapshot;
          bestImageLastUploadedAtRef.current = Date.now();
        } else {
          worstSnapshotRef.current = nextSnapshot;
          worstImageLastUploadedAtRef.current = Date.now();
        }
      } catch (error) {
        console.error(`Failed to upload ${kind} posture image:`, error);
      } finally {
        if (isBest) {
          bestImageUploadInProgressRef.current = false;
          if (bestImageUploadPromiseRef.current === uploadPromise) {
            bestImageUploadPromiseRef.current = null;
          }
        } else {
          worstImageUploadInProgressRef.current = false;
          if (worstImageUploadPromiseRef.current === uploadPromise) {
            worstImageUploadPromiseRef.current = null;
          }
        }
      }
    })();

    if (isBest) {
      bestImageUploadPromiseRef.current = uploadPromise;
    } else {
      worstImageUploadPromiseRef.current = uploadPromise;
    }

    return uploadPromise;
  }, []);

  const persistSnapshotIfNeeded = useCallback((posture: PostureResult) => {
    const currentUid = uidRef.current;
    const sessionId = sessionIdRef.current;
    const score = posture.score;
    if (!currentUid || !sessionId || !posture.isTracking || typeof score !== "number") {
      return;
    }

    const now = Date.now();
    const shouldUploadBest =
      !bestImageUploadInProgressRef.current &&
      shouldUploadBestImage(bestSnapshotRef.current, score, now, bestImageLastUploadedAtRef.current);
    const shouldUploadWorst =
      !worstImageUploadInProgressRef.current &&
      shouldUploadWorstImage(worstSnapshotRef.current, score, now, worstImageLastUploadedAtRef.current);

    if (!shouldUploadBest && !shouldUploadWorst) {
      return;
    }

    const imageDataUrl = captureCurrentFrame();
    if (!imageDataUrl) {
      return;
    }

    const uploads: Promise<void>[] = [];
    if (shouldUploadBest) {
      uploads.push(uploadExtremaImage("best", score, imageDataUrl, now));
    }
    if (shouldUploadWorst) {
      uploads.push(uploadExtremaImage("worst", score, imageDataUrl, now));
    }

    void Promise.allSettled(uploads);
  }, [captureCurrentFrame, uploadExtremaImage]);

  const updateAlerts = useCallback(async (posture: PostureResult) => {
    const now = Date.now();
    const activeSettings = settingsRef.current;
    const currentUid = uidRef.current;
    const sessionId = sessionIdRef.current;
    if (!posture.isTracking || posture.score === null) { badPostureStartedAtRef.current = null; return; }
    if (activeSettings.warningAlertEnabled && posture.score <= activeSettings.warningScoreThreshold) {
      badPostureStartedAtRef.current ??= now;
      const durationMs = activeSettings.badPostureTestAlertEnabled ? 1000 : activeSettings.badPostureDurationMinutes * 60 * 1000;
      if (now - badPostureStartedAtRef.current >= durationMs && now > postureAlertVisibleUntilRef.current) {
        const message = getIssueText(posture);
        setAlertMessage(message);
        showDesktopNotification("자세 주의", message);
        postureAlertVisibleUntilRef.current = now + 30_000;
        alertVisibleUntilRef.current = Math.max(alertVisibleUntilRef.current, postureAlertVisibleUntilRef.current);
        badPostureStartedAtRef.current = now;
        alertCountRef.current += 1;
        if (currentUid && sessionId) await saveAlertLog(currentUid, sessionId, { createdAt: new Date(now).toISOString(), score: posture.score, message });
      }
    } else {
      badPostureStartedAtRef.current = null;
      if (now > postureAlertVisibleUntilRef.current && now > stretchAlertVisibleUntilRef.current) setAlertMessage(null);
    }
    const reminderMs = getStretchReminderMs(activeSettings);
    if (activeSettings.stretchReminderEnabled && reminderMs > 0 && nextStretchReminderAtRef.current > 0 && now >= nextStretchReminderAtRef.current) {
      const message = "잠깐 몸을 풀 시간입니다. 스트레칭 탭에서 추천 동작을 확인해보세요.";
      setAlertMessage(message);
      showDesktopNotification("스트레칭 알림", "20초 이상 자세를 측정했습니다. 스트레칭 분석으로 이동해 몸을 풀어보세요.", { tag: "stretch-reminder", onClick: () => setActiveTab("stretching") });
      stretchAlertVisibleUntilRef.current = now + 30_000;
      alertVisibleUntilRef.current = Math.max(alertVisibleUntilRef.current, stretchAlertVisibleUntilRef.current);
      nextStretchReminderAtRef.current = now + reminderMs;
      alertCountRef.current += 1;
      if (currentUid && sessionId) await saveAlertLog(currentUid, sessionId, { createdAt: new Date(now).toISOString(), type: "stretch-reminder", message });
    }
  }, [setActiveTab, setAlertMessage]);

  const recordPostureScore = useCallback((posture: PostureResult) => {
    if (!posture.isTracking || typeof posture.score !== "number") return null;
    const now = Date.now();
    let trendScore = posture.score;
    setHasCurrentSessionPostureData(true);
    scoreTotalRef.current += posture.score;
    scoreCountRef.current += 1;
    recordPostureAreaStats(postureAreaStatsRef.current, posture);
    const cumulativeAverage = calculateSessionAverage(scoreTotalRef.current, scoreCountRef.current) ?? posture.score;
    latestSessionAverageRef.current = cumulativeAverage;
    setSessionAverageScore(cumulativeAverage);
    if (!bestSnapshotRef.current || posture.score > bestSnapshotRef.current.score) {
      bestSnapshotRef.current = {
        ...(bestSnapshotRef.current ?? createExtremaScore(posture.score)),
        score: posture.score,
      };
    }
    if (!worstSnapshotRef.current || posture.score < worstSnapshotRef.current.score) {
      worstSnapshotRef.current = {
        ...(worstSnapshotRef.current ?? createExtremaScore(posture.score)),
        score: posture.score,
      };
    }
    const averagePosture = withPostureScore(posture, cumulativeAverage, settingsRef.current.warningScoreThreshold);
    realtimeScoreWindowRef.current.push(posture.score);
    if (!lastRealtimeScoreUpdateAtRef.current) lastRealtimeScoreUpdateAtRef.current = now;
    if (now - lastRealtimeScoreUpdateAtRef.current >= getRealtimeScoreIntervalMs(settingsRef.current) && realtimeScoreWindowRef.current.length) {
      trendScore = averageScores(realtimeScoreWindowRef.current);
      setLatestPosture(withPostureScore(posture, trendScore, settingsRef.current.warningScoreThreshold));
      realtimeScoreWindowRef.current = [];
      lastRealtimeScoreUpdateAtRef.current = now;
    }
    if (now - lastScoreTrendUpdateAtRef.current >= getRealtimeScoreIntervalMs(settingsRef.current)) {
      const nextPoint = createLiveScorePoint(trendScore, now);
      scoreSamplesRef.current = [...scoreSamplesRef.current.slice(-119), trendScore];
      liveScorePointsRef.current = [...liveScorePointsRef.current.slice(-23), nextPoint];
      setLiveScorePoints(liveScorePointsRef.current);
      lastScoreTrendUpdateAtRef.current = now;
      const currentUid = uidRef.current;
      const sessionId = sessionIdRef.current;
      if (currentUid && sessionId && now - lastScorePointSavedAtRef.current >= SCORE_POINT_SAVE_INTERVAL_MS) {
        lastScorePointSavedAtRef.current = now;
        void saveScorePoint(currentUid, sessionId, { sessionId, capturedAt: new Date(now).toISOString(), timestamp: now, score: trendScore });
      }
    }
    return averagePosture;
  }, []);

  return {
    latestPosture, setLatestPosture, hasCurrentSessionPostureData, setHasCurrentSessionPostureData,
    liveScorePoints, setLiveScorePoints, sessionAverageScore, setSessionAverageScore, clearLiveScorePoints,
    analyzerRef, settingsRef, uidRef, sessionIdRef, startedAtRef, scoreSamplesRef, realtimeScoreWindowRef,
    lastRealtimeScoreUpdateAtRef, scoreTotalRef, scoreCountRef, latestSessionAverageRef, liveScorePointsRef,
    lastScorePointSavedAtRef, postureAreaStatsRef, lastScoreTrendUpdateAtRef, nextStretchReminderAtRef,
    latestLandmarksRef, alertVisibleUntilRef, postureAlertVisibleUntilRef, stretchAlertVisibleUntilRef,
    alertCountRef, badPostureStartedAtRef, wasPostureRunningBeforeStretchRef, posturePausedStartedAtRef,
    totalPosturePausedMsRef, bestSnapshotRef, worstSnapshotRef,
    bestImageUploadInProgressRef, worstImageUploadInProgressRef, bestImageLastUploadedAtRef, worstImageLastUploadedAtRef,
    bestImageUploadPromiseRef, worstImageUploadPromiseRef,
    persistSnapshotIfNeeded, updateAlerts, recordPostureScore, createInitialPosture,
  };
}
