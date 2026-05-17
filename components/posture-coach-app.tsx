"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  Accessibility,
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle,
  ChevronRight,
  Clock,
  LogOut,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  User,
  Video,
  VideoOff,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  clearUserMeasurementHistory,
  createSession,
  ensureUserSettings,
  finalizeSessionSummary,
  getHistoryByDate,
  getRecent24hSummary,
  initFirebase,
  saveAlertLog,
  saveSnapshot,
  saveStretchLog,
  saveUserSettings,
  signInWithGoogle,
  signOutUser,
  subscribeToAuth,
  uploadSnapshotImage,
  upsertUserProfile,
} from "@/lib/firebase";
import { PostureAnalyzer } from "@/lib/posture-analysis";
import {
  averageStretchCalibration,
  createStretchCalibrationSample,
  drawStretchGuidePose,
  type StretchCalibration,
  type StretchCalibrationSample,
} from "@/lib/stretch-guide";
import { analyzeStretchStep, getRecommendedStretches, getStretchById } from "@/lib/stretch-analysis";
import {
  calculateStretchRecommendations,
  type StretchRecommendation,
} from "@/lib/stretch-recommendation";
import type {
  HistoryGroup,
  NotificationPermissionStatus,
  PostureAreaStats,
  PostureRecommendationArea,
  PostureResult,
  RecentSummary,
  Settings,
  SideMode,
  StretchCoachingResult,
  StretchDefinition,
  StretchStep,
} from "@/lib/types";

type Tab = "home" | "analysis" | "stretching" | "history" | "settings";
type AuthPage = "login" | "signup";
type SettingsSaveStatus = "idle" | "saving" | "saved" | "error";

type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

type PoseResults = {
  poseLandmarks?: Landmark[] | null;
};

type PoseInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (callback: (results: PoseResults) => void) => void;
  initialize?: () => Promise<void>;
  send: (payload: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => Promise<void> | void;
};

type DrawingModuleShape = {
  drawConnectors?: (
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    connections: Array<[number, number]> | unknown,
    style?: Record<string, unknown>
  ) => void;
  drawLandmarks?: (
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    style?: Record<string, unknown>
  ) => void;
};

type MediaPipeWindow = Window & {
  Pose?: new (config: { locateFile: (file: string) => string }) => PoseInstance;
  POSE_CONNECTIONS?: Array<[number, number]> | unknown;
  drawConnectors?: DrawingModuleShape["drawConnectors"];
  drawLandmarks?: DrawingModuleShape["drawLandmarks"];
};

type ScorePoint = {
  id: string;
  time: string;
  score: number;
};

type SnapshotExtrema = {
  score: number;
  imageUrl: string | null;
} | null;

type AppMode = "posture" | "stretching" | "paused";
type StretchCalibrationStatus = "idle" | "calibrating" | "ready" | "failed";

type GuideJoint =
  | "head"
  | "neck"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle";

type GuidePose = Partial<Record<GuideJoint, { x: number; y: number }>>;

const GUIDE_CONNECTIONS: Array<[GuideJoint, GuideJoint]> = [
  ["head", "neck"],
  ["neck", "leftShoulder"],
  ["neck", "rightShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftWrist"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightWrist"],
  ["leftShoulder", "leftHip"],
  ["rightShoulder", "rightHip"],
  ["leftHip", "rightHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftAnkle"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightAnkle"],
];

const SNAPSHOT_INTERVAL_MS = 60_000;
const STRETCH_FEEDBACK_INTERVAL_MS = 800;
const STRETCH_HOLD_TARGET_MS = 5_000;
const STRETCH_CALIBRATION_TARGET_MS = 2_000;
const STRETCH_CALIBRATION_MIN_SAMPLES = 12;
const STRETCH_CALIBRATION_MAX_MOVEMENT = 0.09;
const POSE_CONNECTIONS_FALLBACK: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
];

const DEFAULT_SETTINGS: Settings = {
  warningAlertEnabled: true,
  warningScoreThreshold: 60,
  badPostureDurationMinutes: 5,
  badPostureTestAlertEnabled: false,
  stretchReminderEnabled: true,
  stretchReminderIntervalMinutes: 30,
  stretchReminderTestAlertEnabled: false,
  landmarkOverlayEnabled: true,
  smoothingEnabled: true,
  realtimeScoreIntervalSeconds: 1,
  preferredSideMode: "auto",
  notificationPermissionStatus: "default",
};

function getNotificationPermissionStatus(): NotificationPermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

function showDesktopNotification(title: string, body: string, options: { tag?: string; onClick?: () => void } = {}) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: options.tag,
    });
    notification.onclick = () => {
      window.focus();
      options.onClick?.();
      notification.close();
    };
  } catch (error) {
    console.warn("Failed to show desktop notification:", error);
  }
}

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

function createInitialStretchState(): StretchCoachingResult {
  return {
    stretchId: null,
    stepIndex: 0,
    isPoseValid: false,
    poseScore: null,
    matchPercentage: null,
    incorrectParts: [],
    correctionMessages: [],
    coachingMessage: "스트레칭을 선택한 뒤 분석을 시작하세요.",
    holdSeconds: 0,
  };
}

function createDefaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    notificationPermissionStatus: getNotificationPermissionStatus(),
  };
}

function getRealtimeScoreIntervalMs(settings: Settings) {
  return Math.min(Math.max(Math.round(settings.realtimeScoreIntervalSeconds), 1), 5) * 1000;
}

function getStretchReminderMs(settings: Settings) {
  return settings.stretchReminderTestAlertEnabled ? 20_000 : settings.stretchReminderIntervalMinutes * 60 * 1000;
}

function usesPersonalizedStretchAnalysis(stretchId: string | null) {
  return stretchId === "neck-stretch" || stretchId === "shoulder-stretch" || stretchId === "back-stretch";
}

function createEmptyPostureAreaStats(): PostureAreaStats {
  return {
    neck: { lowCount: 0, totalCount: 0, averageScore: null },
    torso: { lowCount: 0, totalCount: 0, averageScore: null },
    stability: { lowCount: 0, totalCount: 0, averageScore: null },
  };
}

function getPostureAreaThreshold(area: PostureRecommendationArea) {
  if (area === "neck") {
    return 85;
  }
  if (area === "torso") {
    return 80;
  }
  return 75;
}

function recordPostureAreaStats(stats: PostureAreaStats, posture: PostureResult) {
  if (!posture.isTracking || !posture.metrics) {
    return;
  }

  const scores: Record<PostureRecommendationArea, number> = {
    neck: posture.metrics.neckScore,
    torso: posture.metrics.trunkScore,
    stability: posture.metrics.stabilityScore,
  };

  for (const area of Object.keys(scores) as PostureRecommendationArea[]) {
    const current = stats[area];
    const nextTotalCount = current.totalCount + 1;
    const previousTotalScore = (current.averageScore ?? 0) * current.totalCount;
    const score = scores[area];
    current.totalCount = nextTotalCount;
    current.lowCount += score < getPostureAreaThreshold(area) ? 1 : 0;
    current.averageScore = Math.round((previousTotalScore + score) / nextTotalCount);
  }
}

function hasPostureAreaStats(stats: PostureAreaStats) {
  return Object.values(stats).some((stat) => stat.totalCount > 0);
}

function getRecommendationPriorityClass(priorityLabel: StretchRecommendation["priorityLabel"]) {
  if (priorityLabel === "높음") {
    return "bg-red-100 text-red-700";
  }
  if (priorityLabel === "보통") {
    return "bg-yellow-100 text-yellow-800";
  }
  return "bg-green-100 text-green-700";
}

function formatDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(timestamp));
}

function formatMinutes(value: number) {
  if (!value) {
    return "0m";
  }
  if (value < 60) {
    return `${value}m`;
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function getCameraErrorMessage(error: unknown) {
  if (
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    window.location.hostname !== "localhost"
  ) {
    return "카메라는 HTTPS 또는 localhost에서만 사용할 수 있습니다.";
  }

  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "카메라 권한이 거부되었습니다. 브라우저 권한을 확인해주세요.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "사용 가능한 카메라를 찾을 수 없습니다.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "다른 앱에서 카메라를 사용 중입니다.";
  }
  return "카메라를 시작하지 못했습니다. 권한과 보안 설정을 확인해주세요.";
}

function getStatusFromScore(score: number | null) {
  if (score === null) {
    return "waiting";
  }
  if (score >= 80) {
    return "good";
  }
  if (score >= 60) {
    return "warning";
  }
  return "danger";
}

function getStatusLabel(score: number | null) {
  const status = getStatusFromScore(score);
  if (status === "good") {
    return "좋음";
  }
  if (status === "warning") {
    return "주의";
  }
  if (status === "danger") {
    return "위험";
  }
  return "대기";
}

function getIssueText(posture: PostureResult) {
  if (!posture.metrics) {
    return posture.feedbackMessage;
  }
  const activeFeedback = posture.feedbackItems.filter((item) => item.severity !== "good");
  if (activeFeedback.length > 1) {
    return activeFeedback.map((item) => item.message).join(" ");
  }
  if (activeFeedback.length === 1) {
    return activeFeedback[0].message;
  }
  if (posture.mainIssue === "neck") {
    return "목이 앞으로 기울어져 있어요. 턱을 살짝 당겨주세요.";
  }
  if (posture.mainIssue === "torso") {
    return "상체가 기울어져 있어요. 허리를 세워주세요.";
  }
  if (posture.mainIssue === "stability") {
    return "자세가 흔들리고 있어요. 화면 중앙에 편하게 앉아주세요.";
  }
  return "좋은 자세를 유지하고 있어요.";
}

function getWeightMessage(posture: PostureResult) {
  const load = posture.metrics?.estimatedNeckLoadKg;
  if (typeof load !== "number") {
    return posture.feedbackMessage;
  }
  if (load < 12) {
    return "지금 목에는 피카츄 한 마리가 올라가 있어요.";
  }
  if (load < 20) {
    return "목 부담이 조금 커졌어요. 어깨를 편하게 내려주세요.";
  }
  return "목에 큰 부담이 걸리고 있어요. 자세를 바로 세워주세요.";
}

function getSideModeLabel(mode: SideMode) {
  if (mode === "left") {
    return "왼쪽 옆모습 고정";
  }
  if (mode === "right") {
    return "오른쪽 옆모습 고정";
  }
  return "자동";
}

function getAnalysisSideLabel(posture: PostureResult, preferredSideMode: SideMode) {
  if (!posture.analysisSide) {
    return `현재 분석 기준: ${getSideModeLabel(preferredSideMode)}`;
  }

  const sideLabel = posture.analysisSide === "left" ? "왼쪽 옆모습" : "오른쪽 옆모습";
  if (preferredSideMode === "auto") {
    return `현재 분석 기준: 자동 · ${sideLabel}`;
  }
  return `현재 분석 기준: ${sideLabel} 고정`;
}

function getFeedbackSeverityLabel(severity: PostureResult["feedbackItems"][number]["severity"]) {
  if (severity === "good") {
    return "좋음";
  }
  if (severity === "caution") {
    return "주의";
  }
  return "경고";
}

function getFeedbackSeverityClass(severity: PostureResult["feedbackItems"][number]["severity"]) {
  if (severity === "good") {
    return "border-green-100 bg-green-50 text-green-800";
  }
  if (severity === "caution") {
    return "border-yellow-100 bg-yellow-50 text-yellow-800";
  }
  return "border-red-100 bg-red-50 text-red-800";
}

function resolvePoseExports(moduleValue: unknown): {
  PoseClass: (new (config: { locateFile: (file: string) => string }) => PoseInstance) | null;
  poseConnections: Array<[number, number]> | unknown;
} {
  const candidates = [
    moduleValue,
    typeof moduleValue === "object" && moduleValue ? (moduleValue as { default?: unknown }).default : null,
    typeof window !== "undefined"
      ? (window as Window & { Pose?: unknown; POSE_CONNECTIONS?: unknown })
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const poseClass = record.Pose;
    if (typeof poseClass === "function") {
      return {
        PoseClass: poseClass as new (config: { locateFile: (file: string) => string }) => PoseInstance,
        poseConnections: (record.POSE_CONNECTIONS as Array<[number, number]> | unknown) ?? POSE_CONNECTIONS_FALLBACK,
      };
    }
  }

  return { PoseClass: null, poseConnections: POSE_CONNECTIONS_FALLBACK };
}

function resolveDrawingExports(moduleValue: unknown): DrawingModuleShape {
  const candidates = [
    moduleValue,
    typeof moduleValue === "object" && moduleValue ? (moduleValue as { default?: unknown }).default : null,
    typeof window !== "undefined"
      ? (window as Window & {
          drawConnectors?: DrawingModuleShape["drawConnectors"];
          drawLandmarks?: DrawingModuleShape["drawLandmarks"];
        })
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as DrawingModuleShape;
    if (typeof record.drawConnectors === "function" || typeof record.drawLandmarks === "function") {
      return record;
    }
  }

  return {};
}

function loadBrowserScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing ?? document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`MediaPipe script load timed out: ${src}`));
    }, 15000);

    script.onload = () => {
      window.clearTimeout(timeoutId);
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`MediaPipe script load failed: ${src}`));
    };

    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

function waitForVideoReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const isReady = () =>
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
    if (isReady()) {
      resolve();
      return;
    }

    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", handleReady);
      video.removeEventListener("canplay", handleReady);
      video.removeEventListener("error", handleError);
    };
    const handleReady = () => {
      if (!isReady()) {
        return;
      }
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Video stream failed before metadata was available."));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for video metadata."));
    }, 10000);
    video.addEventListener("loadedmetadata", handleReady);
    video.addEventListener("canplay", handleReady);
    video.addEventListener("error", handleError);
  });
}

function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function visibleLandmark(landmark: Landmark | undefined, minVisibility = 0.35) {
  return Boolean(landmark && (landmark.visibility ?? 1) >= minVisibility);
}

function midpoint(a: Landmark, b: Landmark) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function getGuideBodyFrame(landmarks?: Landmark[] | null) {
  const leftShoulder = landmarks?.[11];
  const rightShoulder = landmarks?.[12];
  const leftHip = landmarks?.[23];
  const rightHip = landmarks?.[24];

  if (
    visibleLandmark(leftShoulder) &&
    visibleLandmark(rightShoulder) &&
    visibleLandmark(leftHip) &&
    visibleLandmark(rightHip) &&
    leftShoulder &&
    rightShoulder &&
    leftHip &&
    rightHip
  ) {
    const shoulderCenter = midpoint(leftShoulder, rightShoulder);
    const hipCenter = midpoint(leftHip, rightHip);
    const shoulderWidth = Math.max(Math.abs(leftShoulder.x - rightShoulder.x), 0.12);
    const torsoLength = Math.max(Math.hypot(shoulderCenter.x - hipCenter.x, shoulderCenter.y - hipCenter.y), 0.18);
    return {
      isDetected: true,
      shoulderCenter,
      shoulderWidth,
      torsoLength,
    };
  }

  return {
    isDetected: false,
    shoulderCenter: { x: 0.5, y: 0.36 },
    shoulderWidth: 0.22,
    torsoLength: 0.28,
  };
}

function createBaseGuidePose(): GuidePose {
  return {
    head: { x: 0, y: -0.48 },
    neck: { x: 0, y: -0.1 },
    leftShoulder: { x: -0.5, y: 0 },
    rightShoulder: { x: 0.5, y: 0 },
    leftElbow: { x: -0.72, y: 0.55 },
    rightElbow: { x: 0.72, y: 0.55 },
    leftWrist: { x: -0.76, y: 1.12 },
    rightWrist: { x: 0.76, y: 1.12 },
    leftHip: { x: -0.36, y: 1 },
    rightHip: { x: 0.36, y: 1 },
    leftKnee: { x: -0.34, y: 1.92 },
    rightKnee: { x: 0.34, y: 1.92 },
    leftAnkle: { x: -0.34, y: 2.72 },
    rightAnkle: { x: 0.34, y: 2.72 },
  };
}

function getGuidePoseTemplate(checkType: StretchStep["checkType"]): GuidePose {
  const pose = createBaseGuidePose();
  switch (checkType) {
    case "neck-side-pull":
      pose.head = { x: -0.28, y: -0.42 };
      pose.leftElbow = { x: -0.48, y: -0.48 };
      pose.leftWrist = { x: -0.18, y: -0.66 };
      break;
    case "neck-forward-pull":
      pose.head = { x: 0, y: -0.26 };
      pose.leftElbow = { x: -0.52, y: -0.34 };
      pose.rightElbow = { x: 0.52, y: -0.34 };
      pose.leftWrist = { x: -0.14, y: -0.46 };
      pose.rightWrist = { x: 0.14, y: -0.46 };
      break;
    case "neck-back-tilt":
      pose.head = { x: 0, y: -0.68 };
      pose.leftWrist = { x: -0.08, y: -0.34 };
      pose.rightWrist = { x: 0.08, y: -0.34 };
      break;
    case "neck-circle":
      pose.head = { x: 0.2, y: -0.54 };
      break;
    case "shoulder-roll":
      pose.leftElbow = { x: -0.72, y: -0.06 };
      pose.rightElbow = { x: 0.72, y: -0.06 };
      pose.leftWrist = { x: -0.5, y: 0.02 };
      pose.rightWrist = { x: 0.5, y: 0.02 };
      break;
    case "shoulder-cross":
      pose.leftElbow = { x: 0.05, y: 0.12 };
      pose.leftWrist = { x: 0.62, y: 0.08 };
      break;
    case "shoulder-overhead":
      pose.leftElbow = { x: -0.18, y: -0.58 };
      pose.leftWrist = { x: 0.12, y: -0.88 };
      break;
    case "shoulder-chest-open":
      pose.head = { x: 0, y: -0.78 };
      pose.leftElbow = { x: -0.74, y: 0.72 };
      pose.rightElbow = { x: 0.74, y: 0.72 };
      pose.leftWrist = { x: -0.16, y: 0.98 };
      pose.rightWrist = { x: 0.16, y: 0.98 };
      break;
    case "wrist-roll":
    case "wrist-back-press":
    case "wrist-open-close":
      pose.leftElbow = { x: -0.36, y: 0.34 };
      pose.rightElbow = { x: 0.36, y: 0.34 };
      pose.leftWrist = { x: -0.1, y: 0.46 };
      pose.rightWrist = { x: 0.1, y: 0.46 };
      break;
    case "wrist-pull":
      pose.leftElbow = { x: -0.12, y: 0.36 };
      pose.leftWrist = { x: 0.52, y: 0.36 };
      pose.rightElbow = { x: 0.52, y: 0.34 };
      pose.rightWrist = { x: 0.2, y: 0.34 };
      break;
    case "back-side":
      pose.leftShoulder = { x: -0.68, y: 0.06 };
      pose.rightShoulder = { x: 0.32, y: -0.06 };
      pose.leftHip = { x: -0.34, y: 1 };
      pose.rightHip = { x: 0.42, y: 1 };
      pose.leftElbow = { x: -0.58, y: -0.72 };
      pose.rightElbow = { x: -0.1, y: -0.9 };
      pose.leftWrist = { x: -0.3, y: -1.05 };
      pose.rightWrist = { x: -0.18, y: -1.08 };
      break;
    case "back-forward-reach":
      pose.head = { x: 0, y: 0.02 };
      pose.leftShoulder = { x: -0.42, y: 0.2 };
      pose.rightShoulder = { x: 0.42, y: 0.2 };
      pose.leftElbow = { x: -0.3, y: 0.7 };
      pose.rightElbow = { x: 0.3, y: 0.7 };
      pose.leftWrist = { x: -0.24, y: 1.14 };
      pose.rightWrist = { x: 0.24, y: 1.14 };
      break;
    case "back-twist":
      pose.leftShoulder = { x: -0.64, y: 0.02 };
      pose.rightShoulder = { x: 0.28, y: -0.02 };
      pose.leftWrist = { x: -0.64, y: 0.74 };
      pose.rightWrist = { x: 0.24, y: 1 };
      break;
    case "back-hip-circle":
      pose.leftKnee = { x: -0.48, y: 1.72 };
      pose.rightKnee = { x: 0.48, y: 1.72 };
      pose.leftAnkle = { x: -0.62, y: 2.48 };
      pose.rightAnkle = { x: 0.62, y: 2.48 };
      pose.leftShoulder = { x: -0.56, y: 0.08 };
      pose.rightShoulder = { x: 0.42, y: -0.02 };
      break;
    case "leg-forward-fold":
      pose.head = { x: 0, y: 0.52 };
      pose.leftShoulder = { x: -0.42, y: 0.72 };
      pose.rightShoulder = { x: 0.42, y: 0.72 };
      pose.leftWrist = { x: -0.4, y: 1.7 };
      pose.rightWrist = { x: 0.18, y: 1.7 };
      pose.leftAnkle = { x: -0.55, y: 2.72 };
      pose.rightAnkle = { x: 0.42, y: 2.72 };
      break;
    case "leg-knee-pull":
      pose.leftKnee = { x: -0.08, y: 1.04 };
      pose.leftAnkle = { x: -0.1, y: 1.72 };
      pose.leftWrist = { x: -0.14, y: 1.1 };
      pose.rightWrist = { x: 0.08, y: 1.1 };
      break;
    case "leg-quad-pull":
      pose.leftKnee = { x: -0.42, y: 1.82 };
      pose.leftAnkle = { x: -0.72, y: 1.18 };
      pose.leftWrist = { x: -0.7, y: 1.18 };
      pose.rightWrist = { x: 0.72, y: 0.86 };
      break;
    case "leg-calf-stretch":
      pose.leftWrist = { x: -0.82, y: 0.3 };
      pose.rightWrist = { x: -0.62, y: 0.3 };
      pose.leftAnkle = { x: -0.52, y: 2.6 };
      pose.rightAnkle = { x: 0.82, y: 2.72 };
      pose.leftKnee = { x: -0.42, y: 1.82 };
      pose.rightKnee = { x: 0.52, y: 1.92 };
      break;
  }
  return pose;
}

function drawAdaptiveGuidePose(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  checkType: StretchStep["checkType"],
  landmarks?: Landmark[] | null
) {
  const frame = getGuideBodyFrame(landmarks);
  const template = getGuidePoseTemplate(checkType);
  const toCanvasPoint = (point: { x: number; y: number }) => ({
    x: (frame.shoulderCenter.x + point.x * frame.shoulderWidth) * canvas.width,
    y: (frame.shoulderCenter.y + point.y * frame.torsoLength) * canvas.height,
  });

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.globalAlpha = frame.isDetected ? 0.72 : 0.36;

  for (const [from, to] of GUIDE_CONNECTIONS) {
    const fromPoint = template[from];
    const toPoint = template[to];
    if (!fromPoint || !toPoint) {
      continue;
    }
    const start = toCanvasPoint(fromPoint);
    const end = toCanvasPoint(toPoint);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.strokeStyle = "rgba(250, 204, 21, 0.92)";
    context.lineWidth = 7;
    context.stroke();
    context.strokeStyle = "rgba(30, 64, 175, 0.74)";
    context.lineWidth = 3;
    context.stroke();
  }

  for (const point of Object.values(template)) {
    if (!point) {
      continue;
    }
    const center = toCanvasPoint(point);
    context.beginPath();
    context.arc(center.x, center.y, 7, 0, Math.PI * 2);
    context.fillStyle = "rgba(250, 204, 21, 0.9)";
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = "rgba(30, 64, 175, 0.82)";
    context.stroke();
  }

  context.restore();
}

function AuthScreen({
  authPage,
  setAuthPage,
  onGoogleLogin,
  authMessage,
  isGoogleLoading,
}: {
  authPage: AuthPage;
  setAuthPage: (page: AuthPage) => void;
  onGoogleLogin: () => void;
  authMessage: string | null;
  isGoogleLoading: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFormMessage("Google 로그인만 지원합니다.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Activity className="h-10 w-10 text-blue-600" />
            <span className="text-3xl font-bold text-gray-900">Posture Analyzer</span>
          </div>
          <p className="text-gray-600">AI 기반 자세 분석 서비스</p>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
          <div className="mb-6 flex gap-2 rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setAuthPage("login")}
              className={`flex-1 rounded-lg py-2 font-medium transition-colors ${
                authPage === "login" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => setAuthPage("signup")}
              className={`flex-1 rounded-lg py-2 font-medium transition-colors ${
                authPage === "signup" ? "bg-white text-blue-600 shadow-sm" : "text-gray-600"
              }`}
            >
              회원가입
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {authPage === "signup" && (
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="홍길동"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="example@email.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {authPage === "login" && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded border-gray-300" />
                  <span className="text-gray-600">로그인 상태 유지</span>
                </label>
                <button type="button" className="text-blue-600 hover:text-blue-700">
                  비밀번호 찾기
                </button>
              </div>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              {authPage === "login" ? "로그인" : "회원가입"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-4">
            <div className="h-px flex-1 bg-gray-300" />
            <span className="text-sm text-gray-500">또는</span>
            <div className="h-px flex-1 bg-gray-300" />
          </div>

          <button
            type="button"
            onClick={onGoogleLogin}
            disabled={isGoogleLoading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 px-4 py-3 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGoogleLoading ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
                <span className="font-medium text-gray-700">Google 계정 연동 중...</span>
              </>
            ) : (
              <>
                <GoogleIcon />
                <span className="font-medium text-gray-700">
                  Google로 {authPage === "login" ? "로그인" : "시작하기"}
                </span>
              </>
            )}
          </button>

          {(formMessage || authMessage) && (
            <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-3 text-center text-sm text-blue-900">
              {authMessage ?? formMessage}
            </div>
          )}

          <div className="mt-6 text-center text-sm text-gray-600">
            {authPage === "login" ? (
              <p>
                계정이 없으신가요?{" "}
                <button
                  type="button"
                  onClick={() => setAuthPage("signup")}
                  className="font-medium text-blue-600 hover:text-blue-700"
                >
                  회원가입
                </button>
              </p>
            ) : (
              <p>
                이미 계정이 있으신가요?{" "}
                <button
                  type="button"
                  onClick={() => setAuthPage("login")}
                  className="font-medium text-blue-600 hover:text-blue-700"
                >
                  로그인
                </button>
              </p>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-gray-500">
            로그인 후 분석 기록을 확인할 수 있습니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "green" | "blue" | "orange";
}) {
  const toneClass =
    tone === "green"
      ? "bg-green-100 text-green-600"
      : tone === "orange"
        ? "bg-orange-100 text-orange-600"
        : "bg-blue-100 text-blue-600";

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>{icon}</div>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
      <p className="mt-1 text-sm text-gray-500">{hint}</p>
    </div>
  );
}

export function PostureCoachApp() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [authPage, setAuthPage] = useState<AuthPage>("login");
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<SettingsSaveStatus>("idle");
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [pendingCameraStart, setPendingCameraStart] = useState(false);
  const [appMode, setAppMode] = useState<AppMode>("paused");
  const [modeMessage, setModeMessage] = useState<string | null>(null);
  const [activeStretchId, setActiveStretchId] = useState<string | null>(null);
  const [showAllStretchOptions, setShowAllStretchOptions] = useState(false);
  const [activeStretchStepIndex, setActiveStretchStepIndex] = useState(0);
  const [completedStretchSteps, setCompletedStretchSteps] = useState<number[]>([]);
  const [stretchCalibrationStatus, setStretchCalibrationStatus] = useState<StretchCalibrationStatus>("idle");
  const [stretchCalibrationMessage, setStretchCalibrationMessage] = useState("스트레칭 분석을 시작하면 기준 자세를 측정합니다.");
  const [latestPosture, setLatestPosture] = useState<PostureResult>(createInitialPosture);
  const [hasCurrentSessionPostureData, setHasCurrentSessionPostureData] = useState(false);
  const [stretchCoaching, setStretchCoaching] = useState<StretchCoachingResult>(createInitialStretchState);
  const [recentSummary, setRecentSummary] = useState<RecentSummary | null>(null);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [storageText, setStorageText] = useState("Firebase 확인 중");
  const [storageTone, setStorageTone] = useState<"good" | "warn" | "danger">("warn");
  const [cameraText, setCameraText] = useState("카메라 대기");
  const [cameraTone, setCameraTone] = useState<"good" | "warn" | "danger" | "neutral">("neutral");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [scoreTrend, setScoreTrend] = useState<ScorePoint[]>([]);
  const [sessionAverageScore, setSessionAverageScore] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeTabRef = useRef<Tab>("home");
  const appModeRef = useRef<AppMode>("paused");
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<PoseInstance | null>(null);
  const poseModuleRef = useRef<unknown>(null);
  const drawingModuleRef = useRef<unknown>(null);
  const rafIdRef = useRef<number | null>(null);
  const analyzerRef = useRef(new PostureAnalyzer());
  const settingsRef = useRef<Settings>(DEFAULT_SETTINGS);
  const uidRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const scoreSamplesRef = useRef<number[]>([]);
  const realtimeScoreWindowRef = useRef<number[]>([]);
  const lastRealtimeScoreUpdateAtRef = useRef(0);
  const scoreTotalRef = useRef(0);
  const scoreCountRef = useRef(0);
  const latestSessionAverageRef = useRef<number | null>(null);
  const postureAreaStatsRef = useRef<PostureAreaStats>(createEmptyPostureAreaStats());
  const lastScoreTrendUpdateAtRef = useRef(0);
  const nextStretchReminderAtRef = useRef(0);
  const latestLandmarksRef = useRef<Landmark[] | null>(null);
  const alertVisibleUntilRef = useRef(0);
  const alertCountRef = useRef(0);
  const badPostureStartedAtRef = useRef<number | null>(null);
  const wasPostureRunningBeforeStretchRef = useRef(false);
  const posturePausedStartedAtRef = useRef<number | null>(null);
  const totalPosturePausedMsRef = useRef(0);
  const activeStretchIdRef = useRef<string | null>(null);
  const activeStretchStepIndexRef = useRef(0);
  const completedStretchStepsRef = useRef<Set<number>>(new Set());
  const lastStretchFeedbackUpdateAtRef = useRef(0);
  const stretchHoldStartedAtRef = useRef<number | null>(null);
  const smoothedStretchMatchRef = useRef<number | null>(null);
  const stretchCompletionMatchSamplesRef = useRef<number[]>([]);
  const stretchCalibrationRef = useRef<StretchCalibration | null>(null);
  const stretchCalibrationStatusRef = useRef<StretchCalibrationStatus>("idle");
  const stretchCalibrationStartedAtRef = useRef<number | null>(null);
  const stretchCalibrationSamplesRef = useRef<StretchCalibrationSample[]>([]);
  const latestStretchCoachingRef = useRef<StretchCoachingResult>(createInitialStretchState());
  const lastSnapshotAtRef = useRef(0);
  const snapshotSavingRef = useRef(false);
  const bestSnapshotRef = useRef<SnapshotExtrema>(null);
  const worstSnapshotRef = useRef<SnapshotExtrema>(null);

  const recommendedStretches = useMemo<StretchDefinition[]>(
    () => getRecommendedStretches(latestPosture.mainIssue),
    [latestPosture.mainIssue]
  );
  const allStretchOptions = useMemo<StretchDefinition[]>(
    () => getRecommendedStretches("balanced"),
    []
  );
  const recentHistorySessions = useMemo(
    () => historyGroups.flatMap((group) => group.sessions).slice(0, 30),
    [historyGroups]
  );
  const recommendationHistorySessions = useMemo(
    () => (hasCurrentSessionPostureData ? recentHistorySessions : []),
    [hasCurrentSessionPostureData, recentHistorySessions]
  );
  const personalizedStretchRecommendations = useMemo(
    () =>
      calculateStretchRecommendations({
        currentPosture: latestPosture,
        recentSessions: recommendationHistorySessions,
      }),
    [latestPosture, recommendationHistorySessions]
  );
  const displayedRecommendedStretches = useMemo<StretchDefinition[]>(() => {
    const personalized = personalizedStretchRecommendations.recommendations
      .map((recommendation) => getStretchById(recommendation.stretchId))
      .filter((stretch): stretch is StretchDefinition => Boolean(stretch));
    return personalized.length > 0 ? personalized : recommendedStretches;
  }, [personalizedStretchRecommendations, recommendedStretches]);
  const selectedStretch = useMemo(() => getStretchById(activeStretchId), [activeStretchId]);
  const activeStretchStep = selectedStretch?.steps[activeStretchStepIndex] ?? null;
  const isSelectedStretchComplete = Boolean(
    selectedStretch && completedStretchSteps.length >= selectedStretch.steps.length
  );
  const isStretchingMode = appMode === "stretching";
  const modeLabel =
    appMode === "posture"
      ? "자세 분석 중"
      : appMode === "stretching"
        ? "스트레칭 중"
        : "자세 분석 일시중지";
  const setIsStretchingMode = useCallback((nextIsStretching: boolean) => {
    if (nextIsStretching) {
      appModeRef.current = "stretching";
      setAppMode("stretching");
      return;
    }

    if (wasPostureRunningBeforeStretchRef.current) {
      if (posturePausedStartedAtRef.current !== null) {
        totalPosturePausedMsRef.current += Date.now() - posturePausedStartedAtRef.current;
        posturePausedStartedAtRef.current = null;
      }
      wasPostureRunningBeforeStretchRef.current = false;
      appModeRef.current = "posture";
      setAppMode("posture");
      setActiveTab("analysis");
      setModeMessage("스트레칭이 완료되었습니다. 자세 분석을 다시 시작합니다.");
      setCameraText("카메라 분석 중");
      setCameraTone("good");
      return;
    }

    appModeRef.current = "paused";
    setAppMode("paused");
  }, []);
  const postureStatus = getStatusFromScore(latestPosture.score);
  const currentLoad = latestPosture.metrics?.estimatedNeckLoadKg ?? null;

  const refreshHistory = useCallback(async (uid: string | null = uidRef.current) => {
    if (!uid) {
      setRecentSummary(null);
      setHistoryGroups([]);
      return;
    }

    setIsLoadingHistory(true);
    try {
      const [summary, history] = await Promise.all([getRecent24hSummary(uid), getHistoryByDate(uid)]);
      setRecentSummary(summary);
      setHistoryGroups(history ?? []);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const ensureMediaPipe = useCallback(async () => {
    const mediaPipeWindow = window as MediaPipeWindow;
    let poseModule: unknown = mediaPipeWindow;
    let drawingModule: unknown = mediaPipeWindow;

    if (!mediaPipeWindow.Pose) {
      try {
        poseModule = await import("@mediapipe/pose");
        Object.assign(mediaPipeWindow, poseModule);
      } catch (error) {
        console.warn("[posture] MediaPipe Pose import failed, falling back to browser script:", error);
        await loadBrowserScript("/mediapipe/pose/pose.js");
        poseModule = mediaPipeWindow;
      }
    }
    if (!mediaPipeWindow.drawConnectors || !mediaPipeWindow.drawLandmarks) {
      try {
        drawingModule = await import("@mediapipe/drawing_utils");
        Object.assign(mediaPipeWindow, drawingModule);
      } catch (error) {
        console.warn("[posture] MediaPipe drawing import failed, falling back to browser script:", error);
        await loadBrowserScript("/mediapipe/drawing_utils/drawing_utils.js");
        drawingModule = mediaPipeWindow;
      }
    }

    poseModuleRef.current = poseModule;
    drawingModuleRef.current = drawingModule;
  }, []);

  const drawPoseOverlay = useCallback((results: PoseResults) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !video || !context || !video.videoWidth || !video.videoHeight) {
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const activeStretch = activeTabRef.current === "stretching" ? getStretchById(activeStretchIdRef.current) : null;
    const guideStep = activeStretch?.steps[activeStretchStepIndexRef.current];
    if (guideStep) {
      context.save();
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      drawStretchGuidePose(
        context,
        canvas,
        guideStep.checkType,
        results.poseLandmarks ?? null,
        latestStretchCoachingRef.current.incorrectParts ?? [],
        stretchCalibrationRef.current
      );
      context.restore();
    }

    if (!settingsRef.current.landmarkOverlayEnabled || !results.poseLandmarks?.length) {
      return;
    }

    const drawingModule = resolveDrawingExports(drawingModuleRef.current);
    const { poseConnections } = resolvePoseExports(poseModuleRef.current);
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    drawingModule.drawConnectors?.(context, results.poseLandmarks, poseConnections, {
      color: "rgba(59, 130, 246, 0.85)",
      lineWidth: 3,
    });
    drawingModule.drawLandmarks?.(context, results.poseLandmarks, {
      color: "rgba(255,255,255,0.95)",
      fillColor: "rgba(59,130,246,0.95)",
      lineWidth: 1,
      radius: 3,
    });
    context.restore();
  }, []);

  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }, []);

  const persistSnapshotIfNeeded = useCallback(
    async (posture: PostureResult) => {
      const uid = uidRef.current;
      const sessionId = sessionIdRef.current;
      const now = Date.now();
      if (
        !uid ||
        !sessionId ||
        !posture.isTracking ||
        posture.score === null ||
        snapshotSavingRef.current ||
        now - lastSnapshotAtRef.current < SNAPSHOT_INTERVAL_MS
      ) {
        return;
      }

      const imageDataUrl = captureCurrentFrame();
      if (!imageDataUrl) {
        return;
      }

      snapshotSavingRef.current = true;
      lastSnapshotAtRef.current = now;
      try {
        const imageUrl = await uploadSnapshotImage(uid, sessionId, now, imageDataUrl);
        if (!imageUrl) {
          return;
        }

        const capturedAt = new Date(now).toISOString();
        await saveSnapshot(uid, sessionId, {
          capturedAt,
          score: posture.score,
          imageUrl,
          feedback: getIssueText(posture),
        });

        if (
          !bestSnapshotRef.current ||
          posture.score > bestSnapshotRef.current.score ||
          (posture.score === bestSnapshotRef.current.score && !bestSnapshotRef.current.imageUrl)
        ) {
          bestSnapshotRef.current = { score: posture.score, imageUrl };
        }
        if (
          !worstSnapshotRef.current ||
          posture.score < worstSnapshotRef.current.score ||
          (posture.score === worstSnapshotRef.current.score && !worstSnapshotRef.current.imageUrl)
        ) {
          worstSnapshotRef.current = { score: posture.score, imageUrl };
        }
      } catch (error) {
        console.error("Failed to save posture snapshot:", error);
      } finally {
        snapshotSavingRef.current = false;
      }
    },
    [captureCurrentFrame]
  );

  const updateAlerts = useCallback(async (posture: PostureResult) => {
    const now = Date.now();
    const activeSettings = settingsRef.current;
    const uid = uidRef.current;
    const sessionId = sessionIdRef.current;

    if (!posture.isTracking || posture.score === null) {
      badPostureStartedAtRef.current = null;
      return;
    }

    if (activeSettings.warningAlertEnabled && posture.score <= activeSettings.warningScoreThreshold) {
      badPostureStartedAtRef.current ??= now;
      const badPostureDurationMs = activeSettings.badPostureTestAlertEnabled
        ? 1000
        : activeSettings.badPostureDurationMinutes * 60 * 1000;
      const isSustainedBadPosture = now - badPostureStartedAtRef.current >= badPostureDurationMs;

      if (isSustainedBadPosture && now > alertVisibleUntilRef.current) {
        const message = getIssueText(posture);
        setAlertMessage(message);
        showDesktopNotification("자세 주의", message);
        alertVisibleUntilRef.current = now + 30_000;
        badPostureStartedAtRef.current = now;
        alertCountRef.current += 1;
        if (uid && sessionId) {
          await saveAlertLog(uid, sessionId, {
            createdAt: new Date(now).toISOString(),
            score: posture.score,
            message,
          });
        }
      }
    } else {
      badPostureStartedAtRef.current = null;
      if (now > alertVisibleUntilRef.current) {
        setAlertMessage(null);
      }
    }

    const stretchReminderMs = getStretchReminderMs(activeSettings);
    if (
      activeSettings.stretchReminderEnabled &&
      stretchReminderMs > 0 &&
      nextStretchReminderAtRef.current > 0 &&
      now >= nextStretchReminderAtRef.current
    ) {
      const message = "잠깐 몸을 풀 시간입니다. 스트레칭 탭에서 추천 동작을 확인해보세요.";
      setAlertMessage(message);
      showDesktopNotification("스트레칭 알림", "20초 이상 자세를 측정했습니다. 스트레칭 분석으로 이동해 몸을 풀어보세요.", {
        tag: "stretch-reminder",
        onClick: () => setActiveTab("stretching"),
      });
      alertVisibleUntilRef.current = now + 30_000;
      nextStretchReminderAtRef.current = now + stretchReminderMs;
      alertCountRef.current += 1;
      if (uid && sessionId) {
        await saveAlertLog(uid, sessionId, {
          createdAt: new Date(now).toISOString(),
          type: "stretch-reminder",
          message,
        });
      }
    }
  }, []);

  const resetStretchCalibration = useCallback((message = "스트레칭 분석을 시작하면 기준 자세를 측정합니다.") => {
    stretchCalibrationRef.current = null;
    stretchCalibrationStatusRef.current = "idle";
    stretchCalibrationStartedAtRef.current = null;
    stretchCalibrationSamplesRef.current = [];
    setStretchCalibrationStatus("idle");
    setStretchCalibrationMessage(message);
  }, []);

  const beginStretchCalibration = useCallback(() => {
    if (!usesPersonalizedStretchAnalysis(activeStretchIdRef.current)) {
      stretchCalibrationRef.current = null;
      stretchCalibrationStatusRef.current = "ready";
      stretchCalibrationStartedAtRef.current = null;
      stretchCalibrationSamplesRef.current = [];
      setStretchCalibrationStatus("ready");
      setStretchCalibrationMessage("기존 기준으로 동작 정확도를 분석합니다.");
      return;
    }

    stretchCalibrationRef.current = null;
    stretchCalibrationStatusRef.current = "calibrating";
    stretchCalibrationStartedAtRef.current = Date.now();
    stretchCalibrationSamplesRef.current = [];
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    setStretchCalibrationStatus("calibrating");
    setStretchCalibrationMessage("기준 자세 측정 중...");
    latestStretchCoachingRef.current = {
      stretchId: activeStretchIdRef.current,
      stepIndex: activeStretchStepIndexRef.current,
      isPoseValid: false,
      poseScore: null,
      matchPercentage: null,
      incorrectParts: [],
      correctionMessages: [],
      coachingMessage: "기준 자세 측정 중...",
      holdSeconds: 0,
    };
    setStretchCoaching(latestStretchCoachingRef.current);
  }, []);

  const processStretchCalibration = useCallback((landmarks?: Landmark[] | null) => {
    if (stretchCalibrationStatusRef.current !== "calibrating") {
      return false;
    }

    const sample = createStretchCalibrationSample(landmarks);
    if (!sample) {
      stretchHoldStartedAtRef.current = null;
      setStretchCalibrationMessage("기준 자세를 다시 측정 중입니다. 잠시만 자세를 유지해주세요.");
      latestStretchCoachingRef.current = {
        stretchId: activeStretchIdRef.current,
        stepIndex: activeStretchStepIndexRef.current,
        isPoseValid: false,
        poseScore: null,
        matchPercentage: null,
        incorrectParts: [],
        correctionMessages: ["몸이 잘 보이도록 카메라 위치를 조정해주세요."],
        coachingMessage: "몸이 잘 보이도록 카메라 위치를 조정해주세요.",
        holdSeconds: 0,
      };
      setStretchCoaching(latestStretchCoachingRef.current);
      setStretchCalibrationMessage("몸이 잘 보이도록 카메라 위치를 조정해주세요.");
      return true;
    }

    stretchCalibrationSamplesRef.current.push(sample);
    const samples = stretchCalibrationSamplesRef.current;
    const first = samples[0]?.bodyCenter;
    const maxMovement = first
      ? samples.reduce((max, current) => Math.max(max, Math.hypot(current.bodyCenter.x - first.x, current.bodyCenter.y - first.y)), 0)
      : 0;

    if (maxMovement > STRETCH_CALIBRATION_MAX_MOVEMENT) {
      stretchCalibrationRef.current = null;
      stretchCalibrationStatusRef.current = "calibrating";
      stretchCalibrationStartedAtRef.current = Date.now();
      stretchCalibrationSamplesRef.current = [];
      stretchHoldStartedAtRef.current = null;
      smoothedStretchMatchRef.current = null;
      setStretchCalibrationStatus("calibrating");
      setStretchCalibrationMessage("기준 자세를 다시 측정 중입니다. 잠시만 자세를 유지해주세요.");
      latestStretchCoachingRef.current = {
        stretchId: activeStretchIdRef.current,
        stepIndex: activeStretchStepIndexRef.current,
        isPoseValid: false,
        poseScore: null,
        matchPercentage: null,
        incorrectParts: [],
        correctionMessages: ["기준 자세를 유지해주세요."],
        coachingMessage: "기준 자세를 유지해주세요.",
        holdSeconds: 0,
      };
      setStretchCoaching(latestStretchCoachingRef.current);
      return true;
    }

    const elapsed = Date.now() - (stretchCalibrationStartedAtRef.current ?? Date.now());
    const hasEnoughSamples =
      samples.length >= STRETCH_CALIBRATION_MIN_SAMPLES ||
      (elapsed >= STRETCH_CALIBRATION_TARGET_MS * 2 && samples.length >= 4);
    if (elapsed >= STRETCH_CALIBRATION_TARGET_MS && hasEnoughSamples) {
      const calibration = averageStretchCalibration(samples);
      if (calibration) {
        stretchCalibrationRef.current = calibration;
        stretchCalibrationStatusRef.current = "ready";
        stretchCalibrationStartedAtRef.current = null;
        setStretchCalibrationStatus("ready");
        setStretchCalibrationMessage("개인 맞춤 가이드가 준비되었습니다.");
        latestStretchCoachingRef.current = {
          stretchId: activeStretchIdRef.current,
          stepIndex: activeStretchStepIndexRef.current,
          isPoseValid: false,
          poseScore: null,
          matchPercentage: null,
          incorrectParts: [],
          correctionMessages: [],
          coachingMessage: "개인 맞춤 가이드가 준비되었습니다.",
          holdSeconds: 0,
        };
        setStretchCoaching(latestStretchCoachingRef.current);
      }
    }

    return true;
  }, []);

  const updateStretchCoaching = useCallback((nextResult: StretchCoachingResult, force = false) => {
    const now = Date.now();
    let stableResult = nextResult;
    const activeStepIndex = activeStretchStepIndexRef.current;
    const rawMatch = nextResult.matchPercentage ?? nextResult.poseScore;
    const smoothedMatch =
      typeof rawMatch === "number"
        ? Math.round(
            smoothedStretchMatchRef.current === null
              ? rawMatch
              : smoothedStretchMatchRef.current * 0.75 + rawMatch * 0.25
          )
        : null;

    smoothedStretchMatchRef.current = smoothedMatch;
    stableResult = {
      ...nextResult,
      poseScore: smoothedMatch,
      matchPercentage: smoothedMatch,
      isPoseValid: typeof smoothedMatch === "number" && smoothedMatch >= 85,
      coachingMessage:
        smoothedMatch === null
          ? "카메라에 몸이 잘 보이도록 위치를 조정해주세요."
          : smoothedMatch >= 85
            ? "좋아요! 자세를 유지하세요."
            : smoothedMatch >= 70
              ? nextResult.correctionMessages?.[0] ?? "거의 맞았습니다. 조금만 조정해주세요."
              : nextResult.correctionMessages?.[0] ?? "가이드 틀에 몸을 맞춰주세요.",
    };

    if (nextResult.coachingMessage === "자세가 감지되지 않습니다.") {
      stretchHoldStartedAtRef.current = null;
      stableResult = { ...stableResult, holdSeconds: 0 };
    } else if (stableResult.isPoseValid) {
      stretchHoldStartedAtRef.current ??= now;
      if (typeof smoothedMatch === "number") {
        stretchCompletionMatchSamplesRef.current = [...stretchCompletionMatchSamplesRef.current.slice(-239), smoothedMatch];
      }
      const holdSeconds = Math.floor((now - stretchHoldStartedAtRef.current) / 1000);
      const isCompleted = now - stretchHoldStartedAtRef.current >= STRETCH_HOLD_TARGET_MS;
      stableResult = {
        ...stableResult,
        holdSeconds: Math.min(holdSeconds, STRETCH_HOLD_TARGET_MS / 1000),
        isStepCompleted: isCompleted,
        coachingMessage:
          isCompleted
            ? "현재 단계가 완료되었습니다. 다음 단계로 이동하세요."
            : stableResult.coachingMessage,
      };

      if (isCompleted && !completedStretchStepsRef.current.has(activeStepIndex)) {
        const nextCompleted = new Set(completedStretchStepsRef.current);
        nextCompleted.add(activeStepIndex);
        completedStretchStepsRef.current = nextCompleted;
        setCompletedStretchSteps([...nextCompleted].sort((left, right) => left - right));

        const uid = uidRef.current;
        const sessionId = sessionIdRef.current;
        const stretchId = activeStretchIdRef.current;
        const stretch = getStretchById(stretchId);
        if (uid && sessionId && stretchId) {
          void saveStretchLog(uid, sessionId, {
            createdAt: new Date().toISOString(),
            userId: uid,
            stretchId,
            stretchName: stretch?.name ?? stretchId,
            stepIndex: activeStepIndex,
            action: "step-complete",
            completedAt: new Date().toISOString(),
            poseScore: stableResult.poseScore,
            matchPercentage: stableResult.matchPercentage,
            incorrectParts: stableResult.incorrectParts ?? [],
            coachingMessage: stableResult.coachingMessage,
            feedbackSummary: stableResult.coachingMessage,
          });
        }

        if (stretch) {
          const isLastStep = activeStepIndex >= stretch.steps.length - 1;
          if (isLastStep) {
            const matchSamples = stretchCompletionMatchSamplesRef.current;
            const averageMatchPercentage = matchSamples.length
              ? Math.round(matchSamples.reduce((sum, score) => sum + score, 0) / matchSamples.length)
              : stableResult.matchPercentage;
            setIsStretchingMode(false);
            stableResult = {
              ...stableResult,
              holdSeconds: STRETCH_HOLD_TARGET_MS / 1000,
              isStepCompleted: true,
              coachingMessage: "스트레칭 완료!",
            };
            stableResult.coachingMessage = "스트레칭 완료!";
            if (uid && sessionId && stretchId) {
              const completedAt = new Date().toISOString();
              void saveStretchLog(uid, sessionId, {
                createdAt: completedAt,
                userId: uid,
                stretchId,
                stretchName: stretch.name,
                action: "complete",
                completedAt,
                sessionId,
                averageMatchPercentage,
                totalSteps: stretch.steps.length,
                completedSteps: stretch.steps.length,
                feedbackSummary: "스트레칭 완료!",
              });
            }
          } else {
            const nextStepIndex = activeStepIndex + 1;
            activeStretchStepIndexRef.current = nextStepIndex;
            setActiveStretchStepIndex(nextStepIndex);
            stretchHoldStartedAtRef.current = null;
            smoothedStretchMatchRef.current = null;
            lastStretchFeedbackUpdateAtRef.current = 0;
            stableResult = {
              stretchId: stretch.id,
              stepIndex: nextStepIndex,
              isPoseValid: false,
              poseScore: null,
              coachingMessage: "다음 단계로 자동 이동했습니다. 안내에 맞춰 자세를 준비해주세요.",
              holdSeconds: 0,
            };
          }
        }
      }
    } else {
      stretchHoldStartedAtRef.current = null;
      stableResult = { ...nextResult, holdSeconds: 0 };
    }

    const elapsed = now - lastStretchFeedbackUpdateAtRef.current;
    if (!force && elapsed < STRETCH_FEEDBACK_INTERVAL_MS) {
      return;
    }

    latestStretchCoachingRef.current = stableResult;
    lastStretchFeedbackUpdateAtRef.current = now;
    setStretchCoaching(stableResult);
  }, []);

  const recordPostureScore = useCallback((posture: PostureResult) => {
    if (!posture.isTracking || typeof posture.score !== "number") {
      return null;
    }

    const now = Date.now();
    let trendScore = posture.score;
    setHasCurrentSessionPostureData(true);
    scoreTotalRef.current += posture.score;
    scoreCountRef.current += 1;
    recordPostureAreaStats(postureAreaStatsRef.current, posture);
    const cumulativeAverage = Math.round(scoreTotalRef.current / scoreCountRef.current);
    latestSessionAverageRef.current = cumulativeAverage;
    setSessionAverageScore(cumulativeAverage);

    if (!bestSnapshotRef.current || posture.score > bestSnapshotRef.current.score) {
      bestSnapshotRef.current = { score: posture.score, imageUrl: null };
    }
    if (!worstSnapshotRef.current || posture.score < worstSnapshotRef.current.score) {
      worstSnapshotRef.current = { score: posture.score, imageUrl: null };
    }

    const displayScore = settingsRef.current.smoothingEnabled ? cumulativeAverage : posture.score;
    const averagePosture: PostureResult = {
      ...posture,
      score: displayScore,
      isBadPosture: displayScore <= settingsRef.current.warningScoreThreshold,
    };

    if (!settingsRef.current.smoothingEnabled) {
      if (now - lastRealtimeScoreUpdateAtRef.current >= getRealtimeScoreIntervalMs(settingsRef.current)) {
        setLatestPosture(averagePosture);
        lastRealtimeScoreUpdateAtRef.current = now;
      }
      return averagePosture;
    }

    realtimeScoreWindowRef.current.push(posture.score);
    if (!lastRealtimeScoreUpdateAtRef.current) {
      lastRealtimeScoreUpdateAtRef.current = now;
    }

    if (
      now - lastRealtimeScoreUpdateAtRef.current >= getRealtimeScoreIntervalMs(settingsRef.current) &&
      realtimeScoreWindowRef.current.length
    ) {
      const realtimeScore = Math.round(
        realtimeScoreWindowRef.current.reduce((sum, score) => sum + score, 0) /
          realtimeScoreWindowRef.current.length
      );
      trendScore = realtimeScore;
      setLatestPosture({
        ...posture,
        score: realtimeScore,
        isBadPosture: realtimeScore <= settingsRef.current.warningScoreThreshold,
      });
      realtimeScoreWindowRef.current = [];
      lastRealtimeScoreUpdateAtRef.current = now;
    }

    if (now - lastScoreTrendUpdateAtRef.current >= getRealtimeScoreIntervalMs(settingsRef.current)) {
      scoreSamplesRef.current = [...scoreSamplesRef.current.slice(-119), trendScore];
      setScoreTrend((previous) => [
        ...previous.slice(-23),
        {
          id: `${now}`,
          time: new Intl.DateTimeFormat("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Seoul",
          }).format(new Date(now)),
          score: trendScore,
        },
      ]);
      lastScoreTrendUpdateAtRef.current = now;
    }

    return averagePosture;
  }, []);

  const handlePoseResults = useCallback(
    (results: PoseResults) => {
      drawPoseOverlay(results);
      latestLandmarksRef.current = results.poseLandmarks ?? null;

      if (appModeRef.current === "stretching") {
        setCameraText("스트레칭 분석 중");
        setCameraTone("good");
        if (processStretchCalibration(results.poseLandmarks ?? null)) {
          return;
        }
        if (stretchCalibrationStatusRef.current !== "ready") {
          stretchHoldStartedAtRef.current = null;
          return;
        }
        if (activeStretchIdRef.current) {
          updateStretchCoaching(
            analyzeStretchStep(
              activeStretchIdRef.current,
              activeStretchStepIndexRef.current,
              results.poseLandmarks ?? null,
              stretchCalibrationRef.current
            )
          );
        }
        return;
      }

      if (appModeRef.current !== "posture") {
        badPostureStartedAtRef.current = null;
        return;
      }

      const posture = analyzerRef.current.analyze(results.poseLandmarks, settingsRef.current.preferredSideMode);
      if (posture.isTracking) {
        setCameraText("카메라 분석 중");
        setCameraTone("good");
      } else if (isRunning) {
        setCameraText("자세가 감지되지 않습니다.");
        setCameraTone("warn");
        badPostureStartedAtRef.current = null;
      }

      const averagePosture = recordPostureScore(posture);
      if (averagePosture) {
        void updateAlerts({
          ...posture,
          isBadPosture: posture.score !== null && posture.score <= settingsRef.current.warningScoreThreshold,
        });
        void persistSnapshotIfNeeded(averagePosture);
      }
    },
    [
      drawPoseOverlay,
      isRunning,
      persistSnapshotIfNeeded,
      processStretchCalibration,
      recordPostureScore,
      updateAlerts,
      updateStretchCoaching,
    ]
  );

  const ensurePoseDetector = useCallback(async () => {
    if (detectorRef.current) {
      return detectorRef.current;
    }

    await ensureMediaPipe();
    const { PoseClass } = resolvePoseExports(poseModuleRef.current);
    if (!PoseClass) {
      throw new Error("MediaPipe Pose could not be loaded.");
    }

    const pose = new PoseClass({
      locateFile: (file) => `/mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: settingsRef.current.smoothingEnabled,
      enableSegmentation: false,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
    pose.onResults(handlePoseResults);
    if (pose.initialize) {
      await pose.initialize();
    }

    detectorRef.current = pose;
    return pose;
  }, [ensureMediaPipe, handlePoseResults]);

  const stopApp = useCallback(async () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    const detector = detectorRef.current;
    detectorRef.current = null;
    if (detector?.close) {
      try {
        await detector.close();
      } catch (error) {
        console.error("Failed to close pose detector:", error);
      }
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const uid = uidRef.current;
    const sessionId = sessionIdRef.current;
    const startedAt = startedAtRef.current;
    const finalAverageScore = latestSessionAverageRef.current;
    const postureAreaStats = hasPostureAreaStats(postureAreaStatsRef.current)
      ? postureAreaStatsRef.current
      : undefined;
    const activePausedMs =
      posturePausedStartedAtRef.current === null ? 0 : Date.now() - posturePausedStartedAtRef.current;
    if (uid && sessionId && startedAt) {
      const endedAt = new Date().toISOString();
      const postureDurationMs = Math.max(
        0,
        Date.now() - new Date(startedAt).getTime() - totalPosturePausedMsRef.current - activePausedMs
      );
      const durationMinutes = Math.max(1, Math.round(postureDurationMs / 60000));

      await finalizeSessionSummary(uid, sessionId, {
        endedAt,
        averageScore: finalAverageScore,
        durationMinutes,
        alertCount: alertCountRef.current,
        bestScore: bestSnapshotRef.current?.score ?? null,
        worstScore: worstSnapshotRef.current?.score ?? null,
        bestImageUrl: bestSnapshotRef.current?.imageUrl ?? null,
        worstImageUrl: worstSnapshotRef.current?.imageUrl ?? null,
        preferredSideMode: settingsRef.current.preferredSideMode,
        postureAreaStats,
      });
    }

    sessionIdRef.current = null;
    startedAtRef.current = null;
    scoreSamplesRef.current = [];
    realtimeScoreWindowRef.current = [];
    lastRealtimeScoreUpdateAtRef.current = 0;
    scoreTotalRef.current = 0;
    scoreCountRef.current = 0;
    latestSessionAverageRef.current = null;
    postureAreaStatsRef.current = createEmptyPostureAreaStats();
    lastScoreTrendUpdateAtRef.current = 0;
    nextStretchReminderAtRef.current = 0;
    latestLandmarksRef.current = null;
    alertVisibleUntilRef.current = 0;
    alertCountRef.current = 0;
    badPostureStartedAtRef.current = null;
    wasPostureRunningBeforeStretchRef.current = false;
    posturePausedStartedAtRef.current = null;
    totalPosturePausedMsRef.current = 0;
    lastStretchFeedbackUpdateAtRef.current = 0;
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    latestStretchCoachingRef.current = activeStretchIdRef.current
      ? {
          stretchId: activeStretchIdRef.current,
          stepIndex: activeStretchStepIndexRef.current,
          isPoseValid: false,
          poseScore: null,
          coachingMessage: "카메라를 준비하고 있습니다.",
          holdSeconds: 0,
        }
      : createInitialStretchState();
    lastSnapshotAtRef.current = 0;
    snapshotSavingRef.current = false;
    bestSnapshotRef.current = null;
    worstSnapshotRef.current = null;

    setIsRunning(false);
    setPendingCameraStart(false);
    setIsStretchingMode(false);
    resetStretchCalibration();
    appModeRef.current = "paused";
    setAppMode("paused");
    setModeMessage(null);
    setStretchCoaching(latestStretchCoachingRef.current);
    setSessionAverageScore(finalAverageScore);
    setCameraText("카메라 대기");
    setCameraTone("neutral");
    setAlertMessage(null);

    await refreshHistory(uid);
  }, [refreshHistory, resetStretchCalibration]);

  const startApp = useCallback(async () => {
    if (isRunning) {
      return;
    }

    if (!uidRef.current) {
      setAuthMessage("로그인 후 분석을 시작할 수 있습니다.");
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setPendingCameraStart(true);
      setCameraText("카메라 화면 준비 중");
      setCameraTone("warn");
      return;
    }

    analyzerRef.current.reset();
    analyzerRef.current.setPreferredSideMode(settingsRef.current.preferredSideMode);
    scoreSamplesRef.current = [];
    realtimeScoreWindowRef.current = [];
    lastRealtimeScoreUpdateAtRef.current = 0;
    scoreTotalRef.current = 0;
    scoreCountRef.current = 0;
    latestSessionAverageRef.current = null;
    postureAreaStatsRef.current = createEmptyPostureAreaStats();
    lastScoreTrendUpdateAtRef.current = 0;
    setScoreTrend([]);
    alertCountRef.current = 0;
    badPostureStartedAtRef.current = null;
    setHasCurrentSessionPostureData(false);
    if (appModeRef.current !== "stretching") {
      wasPostureRunningBeforeStretchRef.current = false;
      posturePausedStartedAtRef.current = null;
    }
    totalPosturePausedMsRef.current = 0;
    bestSnapshotRef.current = null;
    worstSnapshotRef.current = null;
    lastSnapshotAtRef.current = 0;
    setAlertMessage(null);
    smoothedStretchMatchRef.current = null;
    stretchCompletionMatchSamplesRef.current = [];
    setLatestPosture(createInitialPosture());
    setSessionAverageScore(null);
    latestStretchCoachingRef.current = activeStretchIdRef.current
      ? {
          stretchId: activeStretchIdRef.current,
          stepIndex: activeStretchStepIndexRef.current,
          isPoseValid: false,
          poseScore: null,
          coachingMessage: "현재 단계 자세를 준비한 뒤 안내에 맞춰 움직여주세요.",
          holdSeconds: 0,
        }
      : createInitialStretchState();
    lastStretchFeedbackUpdateAtRef.current = 0;
    stretchHoldStartedAtRef.current = null;
    setStretchCoaching(latestStretchCoachingRef.current);
    setCameraText("카메라 시작 중");
    setCameraTone("warn");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      await waitForVideoReady(video);

      setIsRunning(true);
      setCameraText("자세 분석 준비 중");
      setCameraTone("warn");

      const detector = await ensurePoseDetector();
      if (appModeRef.current === "stretching") {
        setCameraText("스트레칭 분석 중");
      } else {
        appModeRef.current = "posture";
        setAppMode("posture");
        setCameraText("자세 분석 중");
      }
      setCameraTone("good");

      const uid = uidRef.current;
      const sessionId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      sessionIdRef.current = sessionId;
      startedAtRef.current = startedAt;
      nextStretchReminderAtRef.current = settingsRef.current.stretchReminderEnabled
        ? Date.now() + getStretchReminderMs(settingsRef.current)
        : 0;
      if (uid) {
        void createSession(uid, sessionId, startedAt, settingsRef.current.preferredSideMode);
      }

      const loop = async () => {
        const activeVideo = videoRef.current;
        if (
          !activeVideo ||
          activeVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          activeVideo.videoWidth <= 0 ||
          activeVideo.videoHeight <= 0 ||
          detectorRef.current !== detector
        ) {
          rafIdRef.current = requestAnimationFrame(() => {
            void loop();
          });
          return;
        }

        try {
          await detector.send({ image: activeVideo });
        } catch (error) {
          console.error("Pose send failed:", error);
        }

        rafIdRef.current = requestAnimationFrame(() => {
          void loop();
        });
      };

      rafIdRef.current = requestAnimationFrame(() => {
        void loop();
      });
    } catch (error) {
      console.error("Failed to start webcam:", error);
      const message = error instanceof Error ? error.message : "";
      const isPoseLoadError =
        message.includes("MediaPipe") || message.includes("Pose") || message.includes("@mediapipe");
      setCameraText(isPoseLoadError ? "자세 분석 오류" : "카메라 사용 불가");
      setCameraTone("danger");
      setAlertMessage(isPoseLoadError ? "자세 분석 엔진을 불러오지 못했습니다." : getCameraErrorMessage(error));
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      const detector = detectorRef.current;
      detectorRef.current = null;
      await detector?.close?.();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      sessionIdRef.current = null;
      startedAtRef.current = null;
      setIsRunning(false);
      setPendingCameraStart(false);
    }
  }, [ensurePoseDetector, isRunning]);

  const handleStretchSelection = useCallback((stretchId: string) => {
    setActiveStretchId(stretchId);
    setShowAllStretchOptions(false);
    setActiveStretchStepIndex(0);
    setCompletedStretchSteps([]);
    activeStretchIdRef.current = stretchId;
    activeStretchStepIndexRef.current = 0;
    completedStretchStepsRef.current = new Set();
    if (appModeRef.current === "stretching") {
      setIsStretchingMode(false);
    }
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    stretchCompletionMatchSamplesRef.current = [];
    lastStretchFeedbackUpdateAtRef.current = 0;
    resetStretchCalibration();
    latestStretchCoachingRef.current = {
      stretchId,
      stepIndex: 0,
      isPoseValid: false,
      poseScore: null,
      coachingMessage: "스트레칭 분석 시작을 누르면 실시간 피드백을 제공합니다.",
      holdSeconds: 0,
    };
    setStretchCoaching(latestStretchCoachingRef.current);
  }, [resetStretchCalibration]);

  const handleStartStretchingMode = useCallback(async () => {
    if (!activeStretchIdRef.current) {
      return;
    }

    const wasPostureRunning = isRunning && appModeRef.current === "posture";
    wasPostureRunningBeforeStretchRef.current = wasPostureRunning;
    posturePausedStartedAtRef.current = wasPostureRunning ? Date.now() : null;
    badPostureStartedAtRef.current = null;
    alertVisibleUntilRef.current = 0;
    setAlertMessage(null);
    setActiveTab("stretching");
    setModeMessage("스트레칭 모드로 전환합니다. 자세 분석이 일시중지됩니다.");
    setIsStretchingMode(true);
    beginStretchCalibration();

    if (!isRunning) {
      await startApp();
    }

    const uid = uidRef.current;
    const sessionId = sessionIdRef.current;
    if (uid && sessionId) {
      const payload: Record<string, unknown> = {
        createdAt: new Date().toISOString(),
        stretchId: activeStretchIdRef.current,
        stepIndex: activeStretchStepIndexRef.current,
        action: "start",
      };
      void saveStretchLog(uid, sessionId, payload);
    }
  }, [beginStretchCalibration, isRunning, startApp]);

  const handleStopStretchingMode = useCallback(async () => {
    setIsStretchingMode(false);
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    lastStretchFeedbackUpdateAtRef.current = 0;
    resetStretchCalibration();
    const uid = uidRef.current;
    const sessionId = sessionIdRef.current;
    if (uid && sessionId && activeStretchIdRef.current) {
      await saveStretchLog(uid, sessionId, {
        createdAt: new Date().toISOString(),
        stretchId: activeStretchIdRef.current,
        stepIndex: activeStretchStepIndexRef.current,
        action: "stop",
        poseScore: latestStretchCoachingRef.current.poseScore,
        coachingMessage: latestStretchCoachingRef.current.coachingMessage,
      });
    }
    latestStretchCoachingRef.current = activeStretchIdRef.current
      ? {
          stretchId: activeStretchIdRef.current,
          stepIndex: activeStretchStepIndexRef.current,
          isPoseValid: false,
          poseScore: null,
          coachingMessage: "스트레칭 분석 시작을 누르면 실시간 피드백을 제공합니다.",
          holdSeconds: 0,
        }
      : createInitialStretchState();
    setStretchCoaching(latestStretchCoachingRef.current);
  }, [resetStretchCalibration]);

  const handleNextStretchStep = useCallback(() => {
    const stretch = getStretchById(activeStretchIdRef.current);
    if (!stretch) {
      return;
    }

    const currentStepIndex = activeStretchStepIndexRef.current;
    const nextCompleted = new Set(completedStretchStepsRef.current);
    nextCompleted.add(currentStepIndex);
    completedStretchStepsRef.current = nextCompleted;
    setCompletedStretchSteps([...nextCompleted].sort((left, right) => left - right));

    const nextStepIndex = Math.min(currentStepIndex + 1, stretch.steps.length - 1);
    activeStretchStepIndexRef.current = nextStepIndex;
    setActiveStretchStepIndex(nextStepIndex);
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    lastStretchFeedbackUpdateAtRef.current = 0;

    const isComplete = nextCompleted.size >= stretch.steps.length && currentStepIndex >= stretch.steps.length - 1;
    latestStretchCoachingRef.current = {
      stretchId: stretch.id,
      stepIndex: nextStepIndex,
      isPoseValid: false,
      poseScore: null,
      matchPercentage: null,
      incorrectParts: [],
      correctionMessages: [],
      coachingMessage: isComplete
        ? "스트레칭 완료!"
        : "다음 단계 자세를 준비한 뒤 안내에 맞춰 움직여주세요.",
      holdSeconds: 0,
      isStepCompleted: isComplete,
    };
    setStretchCoaching(latestStretchCoachingRef.current);

    const uid = uidRef.current;
    const sessionId = sessionIdRef.current;
    if (uid && sessionId) {
      const completedAt = new Date().toISOString();
      const matchSamples = stretchCompletionMatchSamplesRef.current;
      const averageMatchPercentage = matchSamples.length
        ? Math.round(matchSamples.reduce((sum, score) => sum + score, 0) / matchSamples.length)
        : latestStretchCoachingRef.current.matchPercentage ?? latestStretchCoachingRef.current.poseScore ?? null;
      const payload: Record<string, unknown> = {
        createdAt: completedAt,
        sessionId,
        stretchId: stretch.id,
        stretchName: stretch.name,
        stepIndex: currentStepIndex,
        action: isComplete ? "complete" : "manual-next",
        completedSteps: nextCompleted.size,
        totalSteps: stretch.steps.length,
        feedbackSummary: isComplete ? "스트레칭 완료!" : latestStretchCoachingRef.current.coachingMessage,
      };
      if (isComplete) {
        payload.completedAt = completedAt;
        payload.averageMatchPercentage = averageMatchPercentage;
      }
      void saveStretchLog(uid, sessionId, payload);
    }

    if (isComplete) {
      setIsStretchingMode(false);
      resetStretchCalibration();
    }
  }, [resetStretchCalibration]);

  const handleClearStretchSelection = useCallback(() => {
    if (isStretchingMode) {
      void handleStopStretchingMode();
    }
    setActiveStretchId(null);
    setActiveStretchStepIndex(0);
    setCompletedStretchSteps([]);
    activeStretchIdRef.current = null;
    activeStretchStepIndexRef.current = 0;
    completedStretchStepsRef.current = new Set();
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    stretchCompletionMatchSamplesRef.current = [];
    lastStretchFeedbackUpdateAtRef.current = 0;
    resetStretchCalibration();
    latestStretchCoachingRef.current = createInitialStretchState();
    setStretchCoaching(latestStretchCoachingRef.current);
  }, [handleStopStretchingMode, isStretchingMode, resetStretchCalibration]);

  const persistSettings = useCallback(async (nextSettings: Settings) => {
    const uid = uidRef.current;
    if (!uid) {
      setSettingsSaveStatus("idle");
      return;
    }

    setSettingsSaveStatus("saving");
    const saved = await saveUserSettings(uid, nextSettings);
    setSettingsSaveStatus(saved ? "saved" : "error");
  }, []);

  const updateSettings = useCallback(
    (changes: Partial<Settings>) => {
      setSettings((current) => {
        const nextSettings = {
          ...current,
          ...changes,
          notificationPermissionStatus: getNotificationPermissionStatus(),
        };
        settingsRef.current = nextSettings;
        analyzerRef.current.setPreferredSideMode(nextSettings.preferredSideMode);
        detectorRef.current?.setOptions({ smoothLandmarks: nextSettings.smoothingEnabled });
        void persistSettings(nextSettings);
        return nextSettings;
      });
    },
    [persistSettings]
  );

  const handleResetSettings = useCallback(() => {
    const nextSettings = createDefaultSettings();
    setSettings(nextSettings);
    settingsRef.current = nextSettings;
    analyzerRef.current.setPreferredSideMode(nextSettings.preferredSideMode);
    detectorRef.current?.setOptions({ smoothLandmarks: nextSettings.smoothingEnabled });
    void persistSettings(nextSettings);
  }, [persistSettings]);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      updateSettings({ notificationPermissionStatus: "unsupported" });
      return;
    }

    const permission = await Notification.requestPermission();
    updateSettings({ notificationPermissionStatus: permission });
    if (permission === "granted") {
      showDesktopNotification("알림 설정 완료", "나쁜 자세가 감지되면 Windows 알림으로 알려드릴게요.");
    }
  }, [updateSettings]);

  const handleClearHistory = useCallback(async () => {
    const uid = uidRef.current;
    if (!uid || isClearingHistory) {
      return;
    }

    setIsClearingHistory(true);
    try {
      const cleared = await clearUserMeasurementHistory(uid);
      if (cleared) {
        setScoreTrend([]);
        setRecentSummary(null);
        setHistoryGroups([]);
        await refreshHistory(uid);
      }
    } finally {
      setIsClearingHistory(false);
    }
  }, [isClearingHistory, refreshHistory]);

  const handleGoogleLogin = useCallback(async () => {
    setIsGoogleLoading(true);
    setAuthMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error("Google login failed:", error);
      setAuthMessage("Google 로그인에 실패했습니다. Firebase 설정을 확인해주세요.");
    } finally {
      setIsGoogleLoading(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (isRunning) {
      await stopApp();
    }
    await signOutUser();
    setActiveTab("home");
  }, [isRunning, stopApp]);

  useEffect(() => {
    const initialSettings = createDefaultSettings();
    setSettings(initialSettings);
    settingsRef.current = initialSettings;
    analyzerRef.current.setPreferredSideMode(initialSettings.preferredSideMode);

    const firebaseStatus = initFirebase();
    if (firebaseStatus.enabled) {
      setStorageText("Firebase 연결됨");
      setStorageTone("good");
    } else {
      setStorageText(firebaseStatus.reason === "missing-config" ? "Firebase 설정 없음" : "Firebase 사용 불가");
      setStorageTone(firebaseStatus.reason === "missing-config" ? "warn" : "danger");
    }

    let authLoadToken = 0;
    const unsubscribe = subscribeToAuth((user) => {
      authLoadToken += 1;
      const currentToken = authLoadToken;
      setAuthUser(user);
      uidRef.current = user?.uid ?? null;
      setIsAuthReady(true);
      setSettingsSaveStatus("idle");
      if (user) {
        void upsertUserProfile(user);
        void refreshHistory(user.uid);
        void ensureUserSettings(user.uid, createDefaultSettings()).then((loadedSettings) => {
          if (!loadedSettings || currentToken !== authLoadToken) {
            return;
          }
          const nextSettings = {
            ...loadedSettings,
            notificationPermissionStatus: getNotificationPermissionStatus(),
          };
          setSettings(nextSettings);
          settingsRef.current = nextSettings;
          analyzerRef.current.setPreferredSideMode(nextSettings.preferredSideMode);
          detectorRef.current?.setOptions({ smoothLandmarks: nextSettings.smoothingEnabled });
        });
      } else {
        const nextSettings = createDefaultSettings();
        setSettings(nextSettings);
        settingsRef.current = nextSettings;
        analyzerRef.current.setPreferredSideMode(nextSettings.preferredSideMode);
        detectorRef.current?.setOptions({ smoothLandmarks: nextSettings.smoothingEnabled });
        void refreshHistory(null);
      }
    });

    return () => {
      unsubscribe();
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const detector = detectorRef.current;
      detectorRef.current = null;
      void detector?.close?.();
    };
  }, [refreshHistory]);

  useEffect(() => {
    settingsRef.current = settings;
    analyzerRef.current.setPreferredSideMode(settings.preferredSideMode);
    detectorRef.current?.setOptions({ smoothLandmarks: settings.smoothingEnabled });
  }, [settings]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    appModeRef.current = appMode;
  }, [appMode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.srcObject === streamRef.current) {
      return;
    }
    video.srcObject = streamRef.current;
    void video.play();
  }, [activeTab, isRunning]);

  useEffect(() => {
    if (!pendingCameraStart || !["analysis", "stretching"].includes(activeTab) || isRunning || !videoRef.current) {
      return;
    }

    setPendingCameraStart(false);
    void startApp();
  }, [activeTab, isRunning, pendingCameraStart, startApp]);

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  if (!authUser) {
    return (
      <AuthScreen
        authPage={authPage}
        setAuthPage={setAuthPage}
        onGoogleLogin={handleGoogleLogin}
        authMessage={authMessage}
        isGoogleLoading={isGoogleLoading}
      />
    );
  }

  const renderHome = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">다시 오신 것을 환영합니다</h1>
        <p className="mt-1 text-gray-600">오늘도 바른 자세로 시작해볼까요?</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <SummaryCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="평균 점수"
          value={recentSummary?.averageScore === null || recentSummary?.averageScore === undefined ? "--" : `${recentSummary.averageScore}`}
          hint="지난 24시간"
          tone="green"
        />
        <SummaryCard
          icon={<Clock className="h-5 w-5" />}
          label="사용 시간"
          value={formatMinutes(recentSummary?.totalUsageMinutes ?? 0)}
          hint="오늘 측정 시간"
          tone="blue"
        />
        <SummaryCard
          icon={<Bell className="h-5 w-5" />}
          label="알림 횟수"
          value={`${recentSummary?.alertCount ?? 0}`}
          hint="자세 경고"
          tone="orange"
        />
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-bold text-gray-900">오늘의 자세 점수 변화</h2>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={scoreTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
            <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
            <Tooltip />
            <Line type="linear" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveTab("analysis")}
          className="rounded-xl bg-blue-600 p-6 text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          <div className="flex items-center justify-center gap-3">
            <Video className="h-5 w-5" />
            <span className="text-lg font-medium">자세 분석 시작</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className="rounded-xl border border-gray-200 bg-white p-6 text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          <div className="flex items-center justify-center gap-3">
            <Calendar className="h-5 w-5" />
            <span className="text-lg font-medium">기록 보기</span>
          </div>
        </button>
      </div>
    </div>
  );

  const renderAnalysis = () => (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">실시간 카메라</p>
            <h2 className="text-2xl font-bold text-gray-900">측면 자세 분석</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              카메라가 사용자의 옆모습을 볼 수 있도록 앉아주세요.
            </p>
          </div>
          <span
            className={`inline-flex min-h-9 items-center justify-center rounded-full px-3 py-1 text-sm font-bold ${
              cameraTone === "good"
                ? "bg-green-100 text-green-700"
                : cameraTone === "danger"
                  ? "bg-red-100 text-red-700"
                  : cameraTone === "warn"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
            }`}
          >
            {cameraText}
          </span>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">
            {modeLabel}
          </span>
          <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-700">
            {getAnalysisSideLabel(latestPosture, settings.preferredSideMode)}
          </span>
          {modeMessage && (
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-800">
              {modeMessage}
            </span>
          )}
        </div>

        <div className="relative mt-4 aspect-video overflow-hidden rounded-2xl bg-gray-900">
          <video ref={videoRef} className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" playsInline muted />
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {!isRunning && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/45 p-6 text-center">
              <div>
                <VideoOff className="mx-auto mb-4 h-14 w-14 text-gray-500" />
                <p className="text-lg font-bold text-gray-100">카메라 대기 중</p>
                <p className="mt-2 max-w-sm text-sm leading-6 text-gray-300">
                  분석을 시작하면 실시간 자세 오버레이와 1초 평균 점수가 표시됩니다.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => (isRunning ? void stopApp() : void startApp())}
            className={`min-h-12 flex-1 rounded-xl px-6 py-3 font-bold text-white transition-colors ${
              isRunning ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isRunning ? "분석 중지" : "분석 시작"}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("stretching");
              setPendingCameraStart(!isRunning);
            }}
            className="min-h-12 rounded-xl border border-gray-300 bg-white px-6 py-3 font-bold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <div className="flex items-center justify-center gap-2">
              <Accessibility className="h-5 w-5" />
              스트레칭 분석 모드
            </div>
          </button>
        </div>
      </section>

      <div className="space-y-4">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">실시간 자세</p>
              <h3 className="text-xl font-bold text-gray-900">실시간 자세 점수</h3>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                postureStatus === "good"
                  ? "bg-green-100 text-green-700"
                  : postureStatus === "warning"
                    ? "bg-yellow-100 text-yellow-700"
                    : postureStatus === "danger"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-600"
              }`}
            >
              {getStatusLabel(latestPosture.score)}
            </span>
          </div>

          <div className="my-5 flex flex-wrap items-end gap-3 font-bold text-gray-900">
            <span className="text-7xl leading-none">{latestPosture.score ?? "--"}</span>
            <span className="mb-2 text-lg text-gray-500">/100</span>
            {appMode === "stretching" && (
              <span className="mb-3 rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-800">
                일시중지됨
              </span>
            )}
          </div>

          <p className="rounded-2xl bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-950">
            현재 분석 평균 점수: {sessionAverageScore ?? "--"}점
          </p>
          <p className="mt-4 text-sm leading-6 text-gray-700">{getWeightMessage(latestPosture)}</p>
          {latestPosture.feedbackItems.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold text-gray-900">부위별 피드백</p>
              {latestPosture.feedbackItems.map((item) => (
                <div
                  key={item.part}
                  className={`rounded-2xl border p-3 text-sm leading-6 ${getFeedbackSeverityClass(item.severity)}`}
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 font-bold">
                    <span>
                      {item.label} · {getFeedbackSeverityLabel(item.severity)}
                    </span>
                    <span>{item.score}점</span>
                  </div>
                  <p>{item.message}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-gray-500">
            분석 시작 후 감지된 유효 자세 점수만 누적해 평균을 계산합니다.
          </p>
        </section>

        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-gray-900">분석 지표</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
              <span className="text-sm text-gray-600">목 점수 / 각도 / 하중</span>
              <strong className="text-right text-gray-900">
                {latestPosture.metrics
                  ? `${Math.round(latestPosture.metrics.neckScore)}점 · ${latestPosture.metrics.neckAngleDegrees.toFixed(1)}° · ${latestPosture.metrics.estimatedNeckLoadKg.toFixed(1)}kg`
                  : "--"}
              </strong>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-600">허리 점수 / 기울기</span>
              <strong className="text-right text-gray-900">
                {latestPosture.metrics
                  ? `${Math.round(latestPosture.metrics.trunkScore)}점 · ${latestPosture.metrics.trunkLeanDegrees.toFixed(1)}°`
                  : "--"}
              </strong>
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-sm text-gray-600">안정성 점수</span>
              <strong className="text-right text-gray-900">
                {latestPosture.metrics ? `${Math.round(latestPosture.metrics.stabilityScore)}점` : "--"}
              </strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );

  const renderStretching = () => (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">스트레칭 단계별 분석</h1>
          <p className="mt-1 text-gray-600">추천 스트레칭을 순서대로 따라 하며 각 단계의 자세를 확인합니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab("analysis")}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-5 py-2 font-bold text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Video className="h-5 w-5" />
          자세 분석 모드
        </button>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h3 className="mb-3 font-medium text-blue-900">스트레칭 상태</h3>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700">{modeLabel}</span>
          {modeMessage && <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-800">{modeMessage}</span>}
        </div>
        <p className="mb-3 rounded-lg bg-white px-3 py-2 text-sm font-bold text-blue-900">
          {stretchCalibrationMessage}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <span className="text-sm text-gray-900">
            {isRunning
              ? latestPosture.isTracking
                ? getIssueText(latestPosture)
                : "자세가 감지되지 않습니다."
              : "스트레칭 분석 시작을 누르면 카메라가 켜집니다."}
          </span>
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
            {isRunning && latestPosture.isTracking ? latestPosture.mainIssue : cameraText}
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900">맞춤 스트레칭 추천</h2>
            {personalizedStretchRecommendations.message && (
              <p className="mt-1 text-sm text-gray-600">{personalizedStretchRecommendations.message}</p>
            )}
          </div>
          {isLoadingHistory && (
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">
              추천 계산 중...
            </span>
          )}
        </div>

        {isLoadingHistory ? (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
            추천 계산 중...
          </div>
        ) : personalizedStretchRecommendations.recommendations.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {personalizedStretchRecommendations.recommendations.slice(0, 3).map((recommendation) => {
              const stretch = getStretchById(recommendation.stretchId);
              if (!stretch) {
                return null;
              }

              return (
                <button
                  key={recommendation.stretchId}
                  type="button"
                  onClick={() => handleStretchSelection(recommendation.stretchId)}
                  className={`rounded-xl border p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md ${
                    activeStretchId === recommendation.stretchId
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-100 bg-white"
                  }`}
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="mb-1 text-xs font-bold text-blue-600">{stretch.targetBodyPart}</p>
                      <h3 className="font-bold text-gray-900">{stretch.name}</h3>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${getRecommendationPriorityClass(
                        recommendation.priorityLabel
                      )}`}
                    >
                      우선순위: {recommendation.priorityLabel}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">추천 이유:</p>
                    <ul className="mt-1 space-y-1 text-sm leading-6 text-gray-600">
                      {recommendation.reasons.slice(0, 2).map((reason) => (
                        <li key={reason}>- {reason}</li>
                      ))}
                    </ul>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">
            자세 분석을 먼저 진행하면 맞춤 스트레칭을 추천받을 수 있습니다.
          </div>
        )}

        <div className="mt-4 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => setShowAllStretchOptions((current) => !current)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50"
          >
            {showAllStretchOptions ? "다른 스트레칭 목록 닫기" : "다른 스트레칭 선택하기"}
            <ChevronRight
              className={`h-4 w-4 transition-transform ${showAllStretchOptions ? "rotate-90" : ""}`}
            />
          </button>

          {showAllStretchOptions && (
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {allStretchOptions.map((stretch) => (
                <button
                  key={stretch.id}
                  type="button"
                  onClick={() => handleStretchSelection(stretch.id)}
                  className={`rounded-xl border p-4 text-left transition-all hover:border-blue-300 hover:shadow-md ${
                    activeStretchId === stretch.id
                      ? "border-blue-400 bg-blue-50 shadow-sm"
                      : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="mb-1 text-xs font-bold text-blue-600">{stretch.targetBodyPart}</p>
                      <h3 className="font-bold text-gray-900">{stretch.name}</h3>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                  </div>
                  <p className="text-sm leading-6 text-gray-600">{stretch.shortDescription}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    <span>{stretch.durationSec}초</span>
                    <span>{stretch.steps.length}단계</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="stretch-analysis-layout">
        <div className="space-y-4">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-gray-900">
            <video ref={videoRef} className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" playsInline muted />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {!isRunning ? (
              <div className="relative text-center">
                <VideoOff className="mx-auto mb-4 h-16 w-16 text-gray-600" />
                <p className="text-gray-400">스트레칭 분석 시작을 누르면 카메라가 켜집니다.</p>
              </div>
            ) : (
              <div className="absolute left-4 top-4">
                <div className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  <span className="text-sm font-medium text-white">자세 감지 중</span>
                </div>
              </div>
            )}
            {selectedStretch && activeStretchStep && (
              <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
                <span className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-bold text-blue-950 backdrop-blur">
                  동작 정확도: {stretchCoaching.matchPercentage ?? stretchCoaching.poseScore ?? "--"}%
                </span>
                <span className="rounded-lg bg-blue-700/85 px-3 py-1.5 text-sm font-bold text-white backdrop-blur">
                  {activeStretchStepIndex + 1} / {selectedStretch.steps.length} 단계
                </span>
                <span className="rounded-lg bg-yellow-300/90 px-3 py-1.5 text-sm font-bold text-blue-950 backdrop-blur">
                  유지 시간: {stretchCoaching.holdSeconds ?? 0} / 5초
                </span>
              </div>
            )}
          </div>

          {selectedStretch && activeStretchStep && (
            <div className="rounded-xl bg-blue-600 p-6 text-white">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Activity className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold">{selectedStretch.name}</p>
                    <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold">
                      {activeStretchStepIndex + 1} / {selectedStretch.steps.length} 단계
                    </span>
                    {isSelectedStretchComplete && (
                      <span className="rounded-full bg-green-400 px-2.5 py-1 text-xs font-bold text-green-950">
                        완료
                      </span>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-bold text-blue-50">{activeStretchStep.title}</p>
                  <p className="mt-1 text-base leading-7 text-blue-50">{activeStretchStep.instruction}</p>
                  <div className="mt-4 rounded-lg bg-white/15 p-4">
                    <p className="text-sm font-bold text-blue-50">실시간 피드백</p>
                    <p className="mt-1 text-lg font-bold leading-7">{stretchCoaching.coachingMessage}</p>
                    <p className="mt-3 text-2xl font-black text-white">
                      동작 정확도: {stretchCoaching.matchPercentage ?? stretchCoaching.poseScore ?? "--"}%
                    </p>
                    {stretchCoaching.correctionMessages?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {stretchCoaching.correctionMessages.slice(0, 2).map((message) => (
                          <span key={message} className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
                            {message}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-blue-50">
                      <span>점수: {stretchCoaching.poseScore ?? "--"}점</span>
                      <span>유지 시간: {stretchCoaching.holdSeconds ?? 0} / 5초</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                if (isStretchingMode) {
                  void handleStopStretchingMode();
                } else if (activeStretchId) {
                  void handleStartStretchingMode();
                }
              }}
              disabled={!activeStretchId || isSelectedStretchComplete}
              className={`flex-1 rounded-lg px-6 py-3 font-medium transition-colors ${
                isStretchingMode
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : !activeStretchId || isSelectedStretchComplete
                    ? "cursor-not-allowed bg-gray-300 text-gray-500"
                    : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isStretchingMode ? "중지" : "스트레칭 분석 시작"}
            </button>
            <button
              type="button"
              onClick={handleNextStretchStep}
              disabled={!selectedStretch || isSelectedStretchComplete}
              className="rounded-lg border border-blue-200 bg-white px-6 py-3 font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
            >
              다음 단계
            </button>
            <button
              type="button"
              onClick={() => (isRunning ? void stopApp() : void startApp())}
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {isRunning ? "카메라 중지" : "카메라 시작"}
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {selectedStretch ? (
            <>
              <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-2 text-xs font-bold text-blue-600">{selectedStretch.targetBodyPart}</p>
                    <h3 className="mb-1 text-xl font-bold text-gray-900">{selectedStretch.name}</h3>
                    <p className="text-sm leading-6 text-gray-600">{selectedStretch.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearStretchSelection}
                    className="shrink-0 text-sm text-gray-400 hover:text-gray-600"
                  >
                    변경
                  </button>
                </div>

                <div className="mb-5 flex items-center gap-2 text-sm text-gray-600">
                  <Clock className="h-4 w-4" />
                  <span>{selectedStretch.durationSec}초</span>
                  <span className="text-gray-300">|</span>
                  <span>{completedStretchSteps.length} / {selectedStretch.steps.length} 단계 완료</span>
                </div>

                <div className="space-y-3">
                  {selectedStretch.steps.map((step, index) => {
                    const isCurrent = index === activeStretchStepIndex;
                    const isDone = completedStretchSteps.includes(index);
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => {
                          activeStretchStepIndexRef.current = index;
                          setActiveStretchStepIndex(index);
                          stretchHoldStartedAtRef.current = null;
                          lastStretchFeedbackUpdateAtRef.current = 0;
                          latestStretchCoachingRef.current = {
                            stretchId: selectedStretch.id,
                            stepIndex: index,
                            isPoseValid: false,
                            poseScore: null,
                            coachingMessage: "선택한 단계 자세를 준비한 뒤 안내에 맞춰 움직여주세요.",
                            holdSeconds: 0,
                          };
                          setStretchCoaching(latestStretchCoachingRef.current);
                        }}
                        className={`w-full rounded-xl border p-4 text-left transition-all ${
                          isCurrent
                            ? "border-blue-400 bg-blue-50 shadow-sm"
                            : isDone
                              ? "border-green-200 bg-green-50"
                              : "border-gray-200 bg-white hover:border-blue-200"
                        }`}
                      >
                        <div className="flex gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                              isDone
                                ? "bg-green-600 text-white"
                                : isCurrent
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {isDone ? <CheckCircle className="h-4 w-4" /> : index + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold text-gray-900">{step.title}</p>
                              {isCurrent && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                                  현재 단계
                                </span>
                              )}
                              {isDone && (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                  완료
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm leading-6 text-gray-600">{step.instruction}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="mb-2 text-sm font-medium text-green-900">진행 방법</p>
                <ul className="space-y-1 text-sm text-green-800">
                  <li>현재 단계 안내를 보고 자세를 맞추세요.</li>
                  <li>좋은 자세를 5초 유지하면 단계가 완료됩니다.</li>
                  <li>필요하면 다음 단계 버튼으로 직접 이동할 수 있습니다.</li>
                </ul>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <h3 className="font-bold text-gray-900">추천 스트레칭</h3>
              {displayedRecommendedStretches.map((stretch) => (
                <button
                  key={stretch.id}
                  type="button"
                  onClick={() => handleStretchSelection(stretch.id)}
                  className="w-full rounded-xl border border-gray-100 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="mb-1 text-xs font-bold text-blue-600">{stretch.targetBodyPart}</p>
                      <h4 className="font-bold text-gray-900">{stretch.name}</h4>
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                  </div>
                  <p className="mb-3 text-sm leading-6 text-gray-600">{stretch.shortDescription}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    <span>{stretch.durationSec}초</span>
                    <span>{stretch.steps.length}단계</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">기록</h1>
        <p className="mt-1 text-gray-600">자세 분석 기록을 확인하세요</p>
      </div>

      {isLoadingHistory ? (
        <div className="rounded-xl border border-gray-100 bg-white p-6 text-gray-600 shadow-sm">
          기록을 불러오는 중입니다...
        </div>
      ) : historyGroups.length === 0 ? (
        <div className="rounded-xl border border-gray-100 bg-white p-6 text-gray-600 shadow-sm">
          아직 기록이 없습니다. 분석을 시작하면 세션 기록이 표시됩니다.
        </div>
      ) : (
        <div className="space-y-4">
          {historyGroups.map((day) => (
            <div key={day.dateKey} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="mb-4 flex flex-col justify-between gap-3 border-b border-gray-200 pb-4 md:flex-row md:items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{formatDateKey(day.dateKey)}</h3>
                  <p className="text-sm text-gray-500">총 {day.sessionCount}회 측정</p>
                </div>
                <div className="flex flex-wrap gap-6 text-sm">
                  <div>
                    <span className="text-gray-600">평균 점수:</span>
                    <span className="ml-2 font-bold text-gray-900">{day.averageScore ?? "--"}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">사용 시간:</span>
                    <span className="ml-2 font-bold text-gray-900">{formatMinutes(day.totalUsageMinutes)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">알림:</span>
                    <span className="ml-2 font-bold text-orange-600">{day.alertCount}회</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {day.sessions.map((session) => (
                  <div key={session.sessionId} className="rounded-lg bg-gray-50 p-4">
                    <div className="mb-3 flex flex-col justify-between gap-2 md:flex-row md:items-center">
                      <div>
                        <p className="font-medium text-gray-900">
                          {formatTime(session.startedAt)}
                          {session.endedAt ? ` - ${formatTime(session.endedAt)}` : ""}
                        </p>
                        <div className="mt-1 flex gap-4 text-sm text-gray-600">
                          <span>평균: {session.averageScore ?? "--"}</span>
                          <span>최고: {session.bestScore ?? "--"}</span>
                          <span>최저: {session.worstScore ?? "--"}</span>
                          <span>알림: {session.alertCount}</span>
                        </div>
                      </div>
                      {session.averageScore !== null && session.averageScore >= 80 ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-yellow-600" />
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                        {session.bestImageUrl ? (
                          <img src={session.bestImageUrl} alt="최고 자세" className="aspect-video w-full object-cover" />
                        ) : (
                          <div className="flex aspect-video items-center justify-center text-sm text-gray-400">
                            최고 자세 이미지 없음
                          </div>
                        )}
                        <div className="p-3 text-sm font-medium text-gray-900">최고 점수: {session.bestScore ?? "--"}</div>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                        {session.worstImageUrl ? (
                          <img src={session.worstImageUrl} alt="최저 자세" className="aspect-video w-full object-cover" />
                        ) : (
                          <div className="flex aspect-video items-center justify-center text-sm text-gray-400">
                            최저 자세 이미지 없음
                          </div>
                        )}
                        <div className="p-3 text-sm font-medium text-gray-900">
                          최저 점수: {session.worstScore ?? "--"}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const settingsStatusText =
    settingsSaveStatus === "saving"
      ? "설정 저장 중..."
      : settingsSaveStatus === "saved"
        ? "설정이 저장되었습니다."
        : settingsSaveStatus === "error"
          ? "설정 저장 실패"
          : "";

  const ToggleControl = ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
  }) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
      <span className="font-medium text-gray-900">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-gray-300 text-blue-600"
      />
    </label>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">설정</h1>
          <p className="mt-1 text-gray-600">알림과 분석 방식을 원하는 대로 조정하세요.</p>
        </div>
        {settingsStatusText && (
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              settingsSaveStatus === "error" ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700"
            }`}
          >
            {settingsStatusText}
          </span>
        )}
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Bell className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">자세 경고 알림</h2>
        </div>
        <div className="space-y-4">
          <ToggleControl
            checked={settings.warningAlertEnabled}
            onChange={(checked) => updateSettings({ warningAlertEnabled: checked })}
            label="자세 경고 알림 켜기/끄기"
          />
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              {settings.warningScoreThreshold}점 이하일 때 경고
            </span>
            <input
              type="range"
              min="40"
              max="90"
              step="5"
              value={settings.warningScoreThreshold}
              onChange={(event) => updateSettings({ warningScoreThreshold: Number(event.target.value) })}
              className="mt-3 w-full"
            />
          </label>
          <ToggleControl
            checked={settings.badPostureTestAlertEnabled}
            onChange={(checked) => updateSettings({ badPostureTestAlertEnabled: checked })}
            label="테스트 모드: 나쁜 자세가 1초 이상 지속되면 알림"
          />
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-gray-900">Windows 알림</p>
                <p className="mt-1 text-sm text-gray-600">
                  현재 상태:{" "}
                  {settings.notificationPermissionStatus === "granted"
                    ? "허용됨"
                    : settings.notificationPermissionStatus === "denied"
                      ? "차단됨"
                      : settings.notificationPermissionStatus === "unsupported"
                        ? "지원 안 됨"
                        : "권한 필요"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleRequestNotificationPermission()}
                disabled={
                  settings.notificationPermissionStatus === "granted" ||
                  settings.notificationPermissionStatus === "unsupported"
                }
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Windows 알림 허용
              </button>
            </div>
            {settings.notificationPermissionStatus === "denied" && (
              <p className="mt-3 text-sm leading-6 text-red-600">
                브라우저에서 알림이 차단되어 있습니다. 주소창 왼쪽 사이트 설정에서 알림 권한을 허용해주세요.
              </p>
            )}
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              나쁜 자세가 {settings.badPostureDurationMinutes}분 이상 지속되면 알림
            </span>
            <input
              type="number"
              min="1"
              max="30"
              value={settings.badPostureDurationMinutes}
              onChange={(event) =>
                updateSettings({ badPostureDurationMinutes: Math.max(1, Number(event.target.value) || 1) })
              }
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              실시간 자세 점수 갱신: {settings.realtimeScoreIntervalSeconds}초마다
            </span>
            <select
              value={settings.realtimeScoreIntervalSeconds}
              onChange={(event) => updateSettings({ realtimeScoreIntervalSeconds: Number(event.target.value) })}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              {[1, 2, 3, 4, 5].map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds}초
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <Clock className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">스트레칭 알림</h2>
        </div>
        <div className="space-y-4">
          <ToggleControl
            checked={settings.stretchReminderEnabled}
            onChange={(checked) => updateSettings({ stretchReminderEnabled: checked })}
            label="스트레칭 알림 켜기/끄기"
          />
          <ToggleControl
            checked={settings.stretchReminderTestAlertEnabled}
            onChange={(checked) => updateSettings({ stretchReminderTestAlertEnabled: checked })}
            label="테스트 모드: 20초 이상 측정하면 Windows 스트레칭 알림"
          />
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              {settings.stretchReminderIntervalMinutes}분마다 스트레칭 알림
            </span>
            <select
              value={settings.stretchReminderIntervalMinutes}
              onChange={(event) => updateSettings({ stretchReminderIntervalMinutes: Number(event.target.value) })}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              {[10, 20, 30, 40, 50, 60].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}분
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <SlidersHorizontal className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">분석 설정</h2>
        </div>
        <div className="space-y-4">
          <ToggleControl
            checked={settings.landmarkOverlayEnabled}
            onChange={(checked) => updateSettings({ landmarkOverlayEnabled: checked })}
            label="자세 랜드마크 표시 켜기/끄기"
          />
          <ToggleControl
            checked={settings.smoothingEnabled}
            onChange={(checked) => updateSettings({ smoothingEnabled: checked })}
            label="점수 부드럽게 처리 켜기/끄기"
          />
          <label className="block">
            <span className="text-sm font-medium text-gray-700">측면 분석 기준</span>
            <select
              value={settings.preferredSideMode}
              onChange={(event) => updateSettings({ preferredSideMode: event.target.value as SideMode })}
              className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="auto">자동</option>
              <option value="left">왼쪽 옆모습</option>
              <option value="right">오른쪽 옆모습</option>
            </select>
            <p className="mt-2 text-xs leading-5 text-gray-500">
              자동은 MediaPipe visibility가 더 높은 쪽을 사용하고, 고정 모드는 선택한 쪽 landmark만 사용합니다.
            </p>
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">데이터 설정</h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void handleClearHistory()}
            disabled={isClearingHistory}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {isClearingHistory ? "기록 초기화 중..." : "기록 초기화"}
          </button>
          <button
            type="button"
            onClick={handleResetSettings}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <RotateCcw className="h-4 w-4" />
            기본 설정으로 되돌리기
          </button>
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="flex min-h-16 flex-col gap-3 py-3 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
            <div className="flex items-center gap-2">
              <Activity className="h-6 w-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">PostureAI</span>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="flex gap-1 overflow-x-auto">
                {[
                  { id: "home" as Tab, label: "홈" },
                  { id: "analysis" as Tab, label: "자세 분석" },
                  { id: "stretching" as Tab, label: "스트레칭 분석" },
                  { id: "history" as Tab, label: "기록 보기" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`rounded-lg px-6 py-2 transition-colors ${
                      activeTab === tab.id
                        ? "bg-blue-50 font-medium text-blue-600"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="hidden h-6 w-px bg-gray-300 lg:block" />
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    storageTone === "good"
                      ? "bg-green-100 text-green-700"
                      : storageTone === "danger"
                        ? "bg-red-100 text-red-700"
                        : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {storageText}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    cameraTone === "good"
                      ? "bg-green-100 text-green-700"
                      : cameraTone === "danger"
                        ? "bg-red-100 text-red-700"
                        : cameraTone === "warn"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {cameraText}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveTab("settings")}
                  className={`flex items-center gap-2 rounded-full border px-2 py-1 transition-colors ${
                    activeTab === "settings"
                      ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100"
                      : "border-gray-200 text-gray-700 hover:border-blue-200 hover:bg-gray-50"
                  }`}
                  aria-label="설정으로 이동"
                >
                  {authUser.photoURL ? (
                    <img
                      src={authUser.photoURL}
                      alt=""
                      className={`h-7 w-7 rounded-full border object-cover ${
                        activeTab === "settings" ? "border-blue-500" : "border-white"
                      }`}
                    />
                  ) : (
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full border ${
                        activeTab === "settings" ? "border-blue-500 bg-white" : "border-gray-200 bg-gray-50"
                      }`}
                    >
                      <User className="h-4 w-4 text-gray-600" />
                    </span>
                  )}
                  <span className="text-sm">{authUser.displayName ?? authUser.email}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1100px] px-6 py-8">
        {alertMessage && (
          <section className="mb-6 rounded-3xl border border-yellow-200 bg-yellow-50 p-5 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="font-bold text-yellow-950">자세 주의</h3>
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
            <p className="text-sm leading-6 text-yellow-800">{alertMessage}</p>
          </section>
        )}
        {activeTab === "home" && renderHome()}
        {activeTab === "analysis" && renderAnalysis()}
        {activeTab === "stretching" && renderStretching()}
        {activeTab === "history" && renderHistory()}
        {activeTab === "settings" && renderSettings()}
      </main>
    </div>
  );
}
