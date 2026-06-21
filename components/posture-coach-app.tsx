"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type JSX, type ReactNode } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bone,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  History,
  House,
  LogOut,
  Pencil,
  PersonStanding,
  RotateCcw,
  ShieldCheck,
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
  saveSessionTitle,
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
  drawDynamicStretchGuidePose,
  drawStretchGuidePose,
  type StretchCalibration,
  type StretchCalibrationSample,
} from "@/lib/stretch-guide";
import {
  analyzeDynamicStretchStep,
  analyzeStretchStep,
  createDynamicStretchRuntimeState,
  getRecommendedStretches,
  getStretchById,
  isDynamicStretchStep,
  type DynamicStretchRuntimeState,
} from "@/lib/stretch-analysis";
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
  SessionSummary,
  SideMode,
  StretchCoachingResult,
  StretchDefinition,
  StretchStep,
} from "@/lib/types";
import { getSessionTitleKey, normalizeSessionTitle, SESSION_TITLE_MAX_LENGTH } from "@/lib/session-title";

type Tab = "home" | "analysis" | "stretching" | "history";
type AuthPage = "login" | "signup";
type SettingsSaveStatus = "idle" | "saving" | "saved" | "error";
type AnalysisSettingsPanel = "analysis-options" | "posture-alerts" | "stretch-alerts";
type PendingTitleSession = {
  sessionId: string;
  sessionTitleKey: string;
  dateKey: string;
  startedAt: string;
};

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
  timestamp: number;
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
const STRETCH_BEEP_STORAGE_KEY = "posture-coach-stretch-beep-enabled";
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
  preferredSideMode: "left",
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

function normalizeSideMode(value: unknown): SideMode {
  return value === "right" ? "right" : "left";
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

function getPostureAreaLabel(area: PostureRecommendationArea) {
  if (area === "neck") {
    return "목";
  }
  if (area === "torso") {
    return "허리";
  }
  return "안정성";
}

function getPostureAreaIcon(area: PostureRecommendationArea, className = "h-4 w-4") {
  if (area === "neck") {
    return <Bone className={className} />;
  }
  if (area === "torso") {
    return <PersonStanding className={className} />;
  }
  return <ShieldCheck className={className} />;
}

function getGenericStretchPictogram(className: string): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="32" cy="12" r="6" />
      <path d="M32 18v15" />
      <path d="M18 27c5-5 23-5 28 0" />
      <path d="M25 33l-7 13" />
      <path d="M39 33l7 13" />
      <path d="M23 50h18" />
    </svg>
  );
}

function getStretchStepPictogram(checkType: StretchStep["checkType"], className = "h-6 w-6"): JSX.Element {
  const icon = (children: ReactNode) => (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
    >
      {children}
    </svg>
  );

  const person = ({
    head = [32, 10, 5],
    torso = "M29 18c-3 8-3 16 0 25h10c3-9 3-17 0-25z",
    leftArm = "M28 23c-6 3-10 8-12 15l6 2c2-5 5-9 9-11z",
    rightArm = "M40 23c5 3 8 7 10 13l-6 2c-2-5-5-8-8-10z",
    leftLeg = "M29 41c-4 6-7 11-10 17h8c2-4 5-8 8-13z",
    rightLeg = "M39 41c5 5 9 10 12 17h-8c-3-5-6-9-10-13z",
    extras,
  }: {
    head?: [number, number, number];
    torso?: string;
    leftArm?: string;
    rightArm?: string;
    leftLeg?: string;
    rightLeg?: string;
    extras?: ReactNode;
  }) => (
    <>
      <circle cx={head[0]} cy={head[1]} r={head[2]} />
      <path d={torso} />
      <path d={leftArm} />
      <path d={rightArm} />
      <path d={leftLeg} />
      <path d={rightLeg} />
      {extras}
    </>
  );

  const arrowRight = (x: number, y: number) => (
    <path d={`M${x} ${y}h13l-4-4 2-2 8 7-8 7-2-2 4-4H${x}z`} opacity="0.6" />
  );

  const arrowLeft = (x: number, y: number) => (
    <path d={`M${x + 19} ${y}H${x + 6}l4-4-2-2-8 7 8 7 2-2-4-4h13z`} opacity="0.6" />
  );

  switch (checkType) {
    case "neck-side-pull":
      return icon(
        person({
          head: [29, 13, 5],
          torso: "M27 20c-2 8-2 17 1 27h10c2-10 2-19-1-27z",
          leftArm: "M28 22c-7 1-12 5-16 12l5 5c3-5 7-8 13-10z",
          rightArm: "M38 23c5 3 8 8 9 15l-6 2c-1-5-3-9-7-12z",
          leftLeg: "M29 46c-3 4-5 8-7 12h8c2-3 4-6 6-9z",
          rightLeg: "M38 46c3 4 6 8 8 12h-8c-2-3-4-6-7-9z",
          extras: (
            <>
              <path d="M18 18c5-7 13-9 21-5l-5-6 4-2 10 13-15 4-1-4 6-2c-6-3-12-1-16 4z" opacity="0.65" />
              <path d="M24 20c2-6 7-9 13-8l-2 6c-4-1-7 1-9 5z" opacity="0.55" />
            </>
          ),
        })
      );
    case "neck-forward-pull":
      return icon(
        person({
          head: [32, 17, 5],
          torso: "M27 23c-2 8-2 17 1 27h10c3-10 3-19 0-27z",
          leftArm: "M27 25c-7 2-12 6-15 12l5 5c3-5 7-8 13-10z",
          rightArm: "M38 25c7 2 12 6 15 12l-5 5c-3-5-7-8-13-10z",
          leftLeg: "M29 49c-3 3-5 6-7 9h8c1-2 3-4 5-6z",
          rightLeg: "M38 49c3 3 5 6 7 9h-8c-1-2-3-4-5-6z",
          extras: <path d="M17 15c9-9 24-9 33 0l-2-7 4-1 5 16-17-2 1-4 6 1c-8-7-19-7-27 1z" opacity="0.65" />,
        })
      );
    case "neck-back-tilt":
      return icon(
        person({
          head: [32, 13, 5],
          torso: "M27 21c-2 8-2 17 1 27h10c3-10 3-19 0-27z",
          leftArm: "M28 25c-5 3-8 7-10 13l5 4c2-4 5-7 9-10z",
          rightArm: "M38 25c5 3 8 7 10 13l-5 4c-2-4-5-7-9-10z",
          leftLeg: "M29 47c-3 4-5 7-7 11h8c1-3 3-5 5-8z",
          rightLeg: "M38 47c3 4 5 7 7 11h-8c-1-3-3-5-5-8z",
          extras: (
            <>
              <path d="M25 14c3-5 9-6 14-2l-4 4c-3-2-6-1-8 2z" opacity="0.55" />
              <path d="M38 7c7 5 10 12 8 20l5-4 3 3-11 11-6-14 4-1 2 6c2-7-1-13-7-16z" opacity="0.65" />
              <path d="M49 6h8v5h-8zM50 11h6v9h-6zM48 20a5 5 0 1 0 10 0 5 5 0 0 0-10 0z" opacity="0.5" />
            </>
          ),
        })
      );
    case "neck-circle":
      return icon(
        person({
          head: [38, 17, 5],
          torso: "M28 24c-2 8-2 17 1 27h10c3-10 3-19 0-27z",
          leftArm: "M29 27c-4 3-7 7-8 13l6 2c1-4 3-7 6-9z",
          rightArm: "M39 27c4 3 7 7 8 13l-6 2c-1-4-3-7-6-9z",
          leftLeg: "M30 50c-3 3-5 6-7 8h8c1-2 3-4 5-6z",
          rightLeg: "M39 50c3 3 5 6 6 8h-8c-1-2-3-4-5-6z",
          extras: (
            <>
              <path d="M17 19c5-12 19-17 31-10l-6-6 3-3 13 13-18 4-1-4 7-2c-10-5-21-1-25 9z" opacity="0.65" />
              <path d="M55 20c3 13-6 25-19 27l6 4-2 4-16-9 13-12 3 3-5 5c10-2 17-11 14-21z" opacity="0.65" />
              <path d="M24 19c4 2 8 2 12 0l1 4c-5 3-11 3-17 0z" opacity="0.4" />
            </>
          ),
        })
      );
    case "shoulder-roll":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 22c-5 2-8 6-9 12l6 2c1-4 3-7 7-9z",
          rightArm: "M39 22c5 2 8 6 9 12l-6 2c-1-4-3-7-7-9z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: (
            <>
              <path d="M15 21c3-7 9-10 16-8l-4-4 2-3 9 8-10 7-2-3 4-3c-5-1-9 1-11 6z" opacity="0.55" />
              <path d="M49 21c-3-7-9-10-16-8l4-4-2-3-9 8 10 7 2-3-4-3c5-1 9 1 11 6z" opacity="0.55" />
            </>
          ),
        })
      );
    case "shoulder-cross":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M19 27c9 0 16 3 22 9l-5 5c-5-5-10-7-18-7z",
          rightArm: "M47 27c-9 0-16 3-22 9l5 5c5-5 10-7 18-7z",
          leftLeg: "M29 42c-3 5-5 10-7 16h8c2-4 4-8 6-12z",
          rightLeg: "M38 42c3 5 6 10 8 16h-8c-2-4-4-8-6-12z",
          extras: arrowLeft(8, 32),
        })
      );
    case "shoulder-overhead":
      return icon(
        person({
          head: [32, 16, 5],
          torso: "M28 24c-2 7-2 14 0 22h10c3-8 3-15 0-22z",
          leftArm: "M27 25c-6-5-9-10-9-17h7c0 5 2 8 7 12z",
          rightArm: "M39 25c6-5 9-10 9-17h-7c0 5-2 8-7 12z",
          leftLeg: "M29 45c-3 4-5 8-7 13h8c2-3 4-6 6-9z",
          rightLeg: "M38 45c3 4 5 8 7 13h-8c-2-3-4-6-6-9z",
          extras: <path d="M25 4h14l-3-3 2-2 8 7-8 7-2-2 3-3H25z" opacity="0.55" />,
        })
      );
    case "shoulder-chest-open":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M29 24c-6 1-11 0-16-4l-3 6c6 5 13 7 21 4z",
          rightArm: "M37 24c6 1 11 0 16-4l3 6c-6 5-13 7-21 4z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: (
            <>
              {arrowLeft(6, 23)}
              {arrowRight(45, 23)}
            </>
          ),
        })
      );
    case "wrist-roll":
      return icon(
        person({
          head: [30, 10, 5],
          torso: "M26 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M25 24c-5 3-8 7-10 13l5 3c2-4 5-8 9-10z",
          rightArm: "M37 23c6 4 10 8 13 14l-6 3c-3-5-6-8-11-11z",
          leftLeg: "M27 42c-3 5-5 10-7 16h8c2-4 4-8 6-12z",
          rightLeg: "M36 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: <path d="M45 15c7 2 11 8 9 15l4-3 2 3-9 8-6-10 3-2 2 4c1-5-1-9-6-11z" opacity="0.6" />,
        })
      );
    case "wrist-back-press":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M28 26c-6 2-10 5-14 10l5 4c3-4 6-6 11-8z",
          rightArm: "M38 26c5 2 9 5 13 10l-5 4c-3-4-7-6-11-8z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: <path d="M16 36h34v7H16zM22 29h6v7h-6zM36 29h6v7h-6z" opacity="0.65" />,
        })
      );
    case "wrist-open-close":
      return icon(
        person({
          head: [31, 10, 5],
          torso: "M27 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 24c-5 3-8 7-10 13l5 3c2-4 5-8 9-10z",
          rightArm: "M38 24c5 3 9 7 12 13l-6 3c-2-4-5-7-9-10z",
          leftLeg: "M28 42c-3 5-5 10-7 16h8c2-4 4-8 6-12z",
          rightLeg: "M37 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: (
            <>
              <path d="M50 30l8-7v14z" opacity="0.6" />
              <circle cx="47" cy="30" r="3" opacity="0.7" />
              <path d="M43 46l9-5 2 4-5 3 5 3-2 4z" opacity="0.6" />
            </>
          ),
        })
      );
    case "wrist-pull":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M28 25c-5 2-9 5-13 10l5 4c3-4 6-6 11-8z",
          rightArm: "M38 25c7 2 12 5 17 10l-5 5c-4-4-8-7-14-8z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: arrowRight(45, 36),
        })
      );
    case "back-side":
      return icon(
        person({
          head: [35, 14, 5],
          torso: "M31 21c-8 8-11 17-10 28h10c0-8 3-15 9-22z",
          leftArm: "M29 22c-4-5-6-10-5-17h7c0 5 2 8 6 12z",
          rightArm: "M39 25c5-3 8-8 10-14l6 3c-2 8-7 14-14 18z",
          leftLeg: "M23 48c-3 3-6 6-9 10h8c2-2 4-4 7-7z",
          rightLeg: "M31 48c5 3 10 6 15 10h-10c-4-3-7-5-11-7z",
          extras: (
            <>
              {arrowLeft(7, 24)}
              {arrowRight(42, 24)}
            </>
          ),
        })
      );
    case "back-forward-reach":
      return icon(
        person({
          head: [42, 25, 5],
          torso: "M20 29c9-4 18-4 27 1l-3 9c-8-3-15-3-22 0z",
          leftArm: "M43 30c5 0 10 2 14 5l-3 6c-4-3-8-4-13-4z",
          rightArm: "M42 36c5 1 9 3 13 7l-4 5c-3-3-7-5-12-6z",
          leftLeg: "M21 37c-4 5-8 9-13 13l6 5c5-4 9-8 13-13z",
          rightLeg: "M29 38c-1 6-1 12 1 18h8c-2-5-2-10-1-15z",
          extras: arrowRight(44, 17),
        })
      );
    case "back-twist":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M27 18c-3 8-2 17 2 26h10c-4-10-4-18 0-26z",
          leftArm: "M27 24c-6 0-11 2-15 6l4 5c4-3 8-4 13-4z",
          rightArm: "M39 24c6 1 10 4 14 9l-5 4c-3-4-6-6-11-7z",
          leftLeg: "M29 43c-5 2-9 5-14 10l6 5c3-3 7-6 12-8z",
          rightLeg: "M39 43c4 4 8 8 12 15h-9c-3-4-6-8-10-11z",
          extras: (
            <>
              <path d="M17 20c9-6 20-6 29 0l-5 2 2 4 12-5-8-10-3 3 3 4c-10-6-21-5-31 2z" opacity="0.6" />
              <path d="M17 46c10 5 21 5 31-1l-3-3 3-3 8 9-11 6-2-4 5-2c-9 4-19 4-28-1z" opacity="0.5" />
            </>
          ),
        })
      );
    case "back-hip-circle":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 24c-5 3-8 7-10 13l5 3c2-4 5-8 9-10z",
          rightArm: "M39 24c5 3 8 7 10 13l-5 3c-2-4-5-8-9-10z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: <path d="M20 40c2-8 9-13 18-12l-4-4 3-3 10 8-11 8-2-3 4-4c-6 0-11 4-13 10 1 7 6 11 13 11l-4-4 3-3 10 8-10 8-3-3 4-4c-10 0-17-6-18-15z" opacity="0.6" />,
        })
      );
    case "leg-forward-fold":
      return icon(
        person({
          head: [43, 31, 5],
          torso: "M18 28c10-5 20-4 31 3l-4 8c-8-4-15-4-23 0z",
          leftArm: "M45 33c4 2 7 5 10 10l-5 4c-2-3-5-5-9-7z",
          rightArm: "M38 36c3 4 5 8 6 13l-6 2c-1-4-3-7-6-10z",
          leftLeg: "M22 37c-5 5-9 9-14 13l6 5c4-3 8-7 13-12z",
          rightLeg: "M30 38c-1 6 0 11 2 18h8c-2-5-3-10-2-15z",
          extras: <path d="M48 47h11v6H48z" opacity="0.55" />,
        })
      );
    case "leg-knee-pull":
      return icon(
        person({
          head: [31, 10, 5],
          torso: "M27 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 26c-4 4-6 9-5 15l6-1c0-4 1-7 4-10z",
          rightArm: "M39 26c4 4 6 9 5 15l-6-1c0-4-1-7-4-10z",
          leftLeg: "M28 42c-2 5-4 10-5 16h8c1-4 2-8 5-12z",
          rightLeg: "M38 42c4 1 7 4 9 8l-5 5c-2-3-4-5-8-6z",
          extras: <path d="M34 42c4-7 8-9 13-8l2 7c-5-1-8 1-11 7z" opacity="0.9" />,
        })
      );
    case "leg-quad-pull":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 24c-5 3-8 7-10 13l5 3c2-4 5-8 9-10z",
          rightArm: "M39 24c4 5 7 10 8 17l-6 1c-1-5-3-9-7-12z",
          leftLeg: "M29 42c-2 5-3 10-4 16h8c1-4 2-8 4-12z",
          rightLeg: "M38 43c5-1 8-4 9-9l6 3c-2 8-8 13-16 14z",
          extras: <path d="M48 34c2 0 4 1 5 3l-2 5c-2-1-4-1-6 0z" opacity="0.7" />,
        })
      );
    case "leg-calf-stretch":
      return icon(
        person({
          head: [34, 12, 5],
          torso: "M29 19c-4 7-4 15-1 23h10c3-8 3-15-1-23z",
          leftArm: "M29 24c-6 1-11 4-15 9l5 5c3-4 7-6 12-7z",
          rightArm: "M38 24c5 2 9 5 12 10l-5 4c-3-4-6-6-11-7z",
          leftLeg: "M29 41c-6 1-11 4-16 9l5 6c4-4 9-6 15-7z",
          rightLeg: "M38 41c7 4 12 8 18 15h-10c-4-4-8-7-13-10z",
          extras: <path d="M51 20h7v38h-7z" opacity="0.55" />,
        })
      );
    default:
      return getGenericStretchPictogram(className);
  }
}

const HISTORY_REPORT_AREAS: PostureRecommendationArea[] = ["neck", "torso"];
const SCORE_INDICATOR_BORDER_WIDTH = 3;

function getHistoryAreaScores(postureAreaStats?: PostureAreaStats) {
  return HISTORY_REPORT_AREAS.map((area) => {
    const score = postureAreaStats?.[area]?.averageScore;
    return {
      area,
      label: getPostureAreaLabel(area),
      score: typeof score === "number" ? score : null,
    };
  });
}

function getHistoryWeakestArea(postureAreaStats?: PostureAreaStats) {
  return getHistoryAreaScores(postureAreaStats)
    .filter((item): item is { area: PostureRecommendationArea; label: string; score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score)[0] ?? null;
}

function getHistoryReportComment(areaScores: ReturnType<typeof getHistoryAreaScores>) {
  const validScores = areaScores
    .filter((item): item is { area: PostureRecommendationArea; label: string; score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score);
  const weakest = validScores[0];

  if (!weakest) {
    return "측정 시간이 짧아 부위별 점수를 계산하지 못했어요.";
  }

  if (weakest.score < 60) {
    return `${weakest.label} 점수가 낮아 먼저 확인이 필요합니다.`;
  }

  if (weakest.score < 75) {
    return `${weakest.label} 정렬을 조금 더 확인하세요.`;
  }

  return "목과 허리 균형이 안정적으로 기록되었습니다.";
}

function getHistorySessionDisplayTitle(session: SessionSummary) {
  if (session.customTitle?.trim()) {
    return session.customTitle;
  }

  return "제목을 입력해주세요";
}

function getScoreIndicatorStyle(score: number | null) {
  if (score === null) {
    return {
      background: "#ffffff",
      borderColor: "rgba(18, 100, 76, 0.22)",
      outline: `${SCORE_INDICATOR_BORDER_WIDTH}px solid rgba(107, 114, 128, 0.34)`,
      outlineOffset: "0px",
    };
  }

  const normalizedScore = Math.min(Math.max(score, 0), 100);
  const fill = Math.round(normalizedScore * 3.6);
  const color = score >= 80 ? "#39AF8E" : score >= 60 ? "#EAB308" : "#DC2626";
  const emptyColor = score >= 80 ? "#D6F3EB" : score >= 60 ? "#FEF3C7" : "#FEE2E2";
  const outlineColor =
    score >= 80 ? "rgba(57, 175, 142, 0.72)" : score >= 60 ? "rgba(234, 179, 8, 0.72)" : "rgba(220, 38, 38, 0.72)";

  if (fill >= 360) {
    return {
      background: color,
      borderColor: "rgba(18, 100, 76, 0.22)",
      outline: `${SCORE_INDICATOR_BORDER_WIDTH}px solid ${outlineColor}`,
      outlineOffset: "0px",
    };
  }

  return {
    background: `conic-gradient(${color} 0deg ${fill}deg, ${emptyColor} ${fill}deg 360deg)`,
    borderColor: "rgba(18, 100, 76, 0.22)",
    outline: `${SCORE_INDICATOR_BORDER_WIDTH}px solid ${outlineColor}`,
    outlineOffset: "0px",
  };
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
    weekday: "long",
  }).format(date);
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(timestamp));
}

function getKoreaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function createTodaySavedScorePoints(historyGroups: HistoryGroup[]): ScorePoint[] {
  const today = getKoreaDateKey();
  const todayGroup = historyGroups.find((group) => group.dateKey === today);
  if (!todayGroup) {
    return [];
  }

  return todayGroup.sessions
    .filter((session) => typeof session.averageScore === "number")
    .map((session) => {
      const timestamp = new Date(session.startedAt).getTime();
      return {
        id: `saved-${session.sessionId}`,
        time: formatTime(session.startedAt),
        timestamp,
        score: session.averageScore ?? 0,
      };
    })
    .sort((left, right) => left.timestamp - right.timestamp);
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

function getHomeScoreTone(score: number | null) {
  const status = getStatusFromScore(score);

  if (status === "good") {
    return {
      badgeClass: "bg-[#C4F6E8] text-[#18755B]",
      barClass: "bg-[#39AF8E]",
      trackClass: "bg-[#D6F3EB]",
    };
  }

  if (status === "warning") {
    return {
      badgeClass: "bg-amber-100 text-amber-800",
      barClass: "bg-amber-500",
      trackClass: "bg-amber-100",
    };
  }

  if (status === "danger") {
    return {
      badgeClass: "bg-red-100 text-red-700",
      barClass: "bg-red-600",
      trackClass: "bg-red-100",
    };
  }

  return {
    badgeClass: "bg-gray-100 text-gray-500",
    barClass: "bg-gray-300",
    trackClass: "bg-[#D6F3EB]",
  };
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
  return "오른쪽 옆모습 고정";
}

function getAnalysisSideLabel(posture: PostureResult, preferredSideMode: SideMode) {
  if (!posture.analysisSide) {
    return `현재 분석 기준: ${getSideModeLabel(preferredSideMode)}`;
  }

  const sideLabel = posture.analysisSide === "left" ? "왼쪽 옆모습" : "오른쪽 옆모습";
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
    <div className="app-shell flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Activity className="h-10 w-10 text-blue-600" />
            <span className="text-3xl font-bold text-gray-900">Posture Analyzer</span>
          </div>
          <p className="text-gray-600">웹캠 기반 자세 분석 서비스</p>
        </div>

        <div className="app-surface p-8">
          <div className="mb-6 flex gap-1 border border-[rgba(18,100,76,0.18)] bg-[rgba(196,246,232,0.36)] p-1">
            <button
              type="button"
              onClick={() => setAuthPage("login")}
              className={`flex-1 py-2 font-medium ${
                authPage === "login" ? "bg-white text-blue-600" : "text-gray-600"
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => setAuthPage("signup")}
              className={`flex-1 py-2 font-medium ${
                authPage === "signup" ? "bg-white text-blue-600" : "text-gray-600"
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
                  className="w-full border border-gray-300 bg-white px-4 py-3 focus:outline-none"
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
                className="w-full border border-gray-300 bg-white px-4 py-3 focus:outline-none"
                placeholder="example@email.com"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full border border-gray-300 bg-white px-4 py-3 focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {authPage === "login" && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded border-gray-300" />
                  <span className="text-gray-600">로그인 상태 유지</span>
                </label>
                <button type="button" className="text-blue-600">
                  비밀번호 찾기
                </button>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 py-3 font-medium text-white"
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
            className="flex w-full items-center justify-center gap-3 border border-gray-300 bg-white px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="mt-5 border border-blue-100 bg-blue-50 p-3 text-center text-sm text-blue-900">
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
                  className="font-medium text-blue-600"
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
                  className="font-medium text-blue-600"
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
      ? "bg-[#C4F6E8] text-[#18755B]"
      : tone === "orange"
        ? "bg-[#FDECC8] text-orange-700"
        : "bg-[#9BE7D1] text-[#12644C]";

  return (
    <div className="app-surface p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center ${toneClass}`}>{icon}</div>
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
  const [settingsDraft, setSettingsDraft] = useState<Settings>(DEFAULT_SETTINGS);
  const [badPostureDurationMinutesInput, setBadPostureDurationMinutesInput] = useState(
    String(DEFAULT_SETTINGS.badPostureDurationMinutes)
  );
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<SettingsSaveStatus>("idle");
  const [activeAnalysisSettingsPanel, setActiveAnalysisSettingsPanel] =
    useState<AnalysisSettingsPanel>("analysis-options");
  const [isAnalysisSettingsOpen, setIsAnalysisSettingsOpen] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [isClearHistoryConfirmOpen, setIsClearHistoryConfirmOpen] = useState(false);
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
  const [stretchBeepEnabled, setStretchBeepEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.localStorage.getItem(STRETCH_BEEP_STORAGE_KEY) !== "false";
  });
  const [latestPosture, setLatestPosture] = useState<PostureResult>(createInitialPosture);
  const [hasCurrentSessionPostureData, setHasCurrentSessionPostureData] = useState(false);
  const [stretchCoaching, setStretchCoaching] = useState<StretchCoachingResult>(createInitialStretchState);
  const [recentSummary, setRecentSummary] = useState<RecentSummary | null>(null);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedHistoryDateKey, setSelectedHistoryDateKey] = useState<string | null>(null);
  const [historySessionPage, setHistorySessionPage] = useState(0);
  const [storageText, setStorageText] = useState("Firebase 확인 중");
  const [storageTone, setStorageTone] = useState<"good" | "warn" | "danger">("warn");
  const [cameraText, setCameraText] = useState("카메라 대기");
  const [cameraTone, setCameraTone] = useState<"good" | "warn" | "danger" | "neutral">("neutral");
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [todaySavedScorePoints, setTodaySavedScorePoints] = useState<ScorePoint[]>([]);
  const [liveScorePoints, setLiveScorePoints] = useState<ScorePoint[]>([]);
  const [sessionAverageScore, setSessionAverageScore] = useState<number | null>(null);
  const [expandedHistoryImageSessions, setExpandedHistoryImageSessions] = useState<Set<string>>(() => new Set());
  const [editingSessionTitleKey, setEditingSessionTitleKey] = useState<string | null>(null);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [savingSessionTitleKey, setSavingSessionTitleKey] = useState<string | null>(null);
  const [sessionTitleErrors, setSessionTitleErrors] = useState<Record<string, string>>({});
  const [pendingTitleSession, setPendingTitleSession] = useState<PendingTitleSession | null>(null);
  const [pendingTitleDraft, setPendingTitleDraft] = useState("");
  const [pendingTitleSaving, setPendingTitleSaving] = useState(false);
  const [pendingTitleError, setPendingTitleError] = useState<string | null>(null);

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
  const postureAlertVisibleUntilRef = useRef(0);
  const stretchAlertVisibleUntilRef = useRef(0);
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
  const dynamicStretchRuntimeRef = useRef<DynamicStretchRuntimeState>(createDynamicStretchRuntimeState());
  const stretchBeepAudioContextRef = useRef<AudioContext | null>(null);
  const stretchBeepEventKeysRef = useRef<Set<string>>(new Set());
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
  const homeScoreInsight = useMemo(() => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentSevenDaySessions = historyGroups
      .flatMap((group) => group.sessions)
      .filter((session) => {
        const startedAt = new Date(session.startedAt).getTime();
        return Number.isFinite(startedAt) && startedAt >= sevenDaysAgo && startedAt <= now;
      });
    const scoredSevenDaySessions = recentSevenDaySessions.filter((session) => typeof session.averageScore === "number");
    const sevenDayAverage = scoredSevenDaySessions.length
      ? Math.round(
          scoredSevenDaySessions.reduce((sum, session) => sum + (session.averageScore ?? 0), 0) /
            scoredSevenDaySessions.length
        )
      : null;
    const currentAverage =
      typeof recentSummary?.averageScore === "number" ? recentSummary.averageScore : null;
    const trend = currentAverage !== null && sevenDayAverage !== null ? currentAverage - sevenDayAverage : null;
    const bestScores = recentSevenDaySessions
      .map((session) => session.bestScore)
      .filter((score): score is number => typeof score === "number");
    const worstScores = recentSevenDaySessions
      .map((session) => session.worstScore)
      .filter((score): score is number => typeof score === "number");
    const mostRecentSession = recentSevenDaySessions
      .filter((session) => Number.isFinite(new Date(session.startedAt).getTime()))
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())[0];
    const areaTotals: Record<PostureRecommendationArea, { totalScore: number; totalCount: number }> = {
      neck: { totalScore: 0, totalCount: 0 },
      torso: { totalScore: 0, totalCount: 0 },
      stability: { totalScore: 0, totalCount: 0 },
    };

    for (const session of recentSevenDaySessions) {
      if (!session.postureAreaStats) {
        continue;
      }
      for (const area of Object.keys(areaTotals) as PostureRecommendationArea[]) {
        const stat = session.postureAreaStats[area];
        if (!stat || typeof stat.averageScore !== "number" || stat.totalCount <= 0) {
          continue;
        }
        areaTotals[area].totalScore += stat.averageScore * stat.totalCount;
        areaTotals[area].totalCount += stat.totalCount;
      }
    }

    const areaScores = (Object.keys(areaTotals) as PostureRecommendationArea[]).map((area) => {
      const total = areaTotals[area];
      return {
        area,
        label: getPostureAreaLabel(area),
        score: total.totalCount > 0 ? Math.round(total.totalScore / total.totalCount) : null,
      };
    });
    const weakestArea = areaScores
      .filter((item): item is { area: PostureRecommendationArea; label: string; score: number } => item.score !== null)
      .sort((left, right) => left.score - right.score)[0];

    return {
      trend,
      sevenDayAverage,
      weakestAreaLabel: weakestArea?.label ?? null,
      weakestArea: weakestArea?.area ?? null,
      weakestAreaScore: weakestArea?.score ?? null,
      areaScores,
      bestScore: bestScores.length ? Math.max(...bestScores) : null,
      worstScore: worstScores.length ? Math.min(...worstScores) : null,
      latestMeasuredAt: mostRecentSession?.startedAt ?? null,
    };
  }, [historyGroups, recentSummary?.averageScore]);
  const homePostureSummary = useMemo(() => {
    const validAreaScores = homeScoreInsight.areaScores.filter(
      (item): item is { area: PostureRecommendationArea; label: string; score: number } => item.score !== null
    );
    const isStable =
      validAreaScores.length > 0 &&
      validAreaScores.every((item) => item.score >= getPostureAreaThreshold(item.area));

    if (validAreaScores.length === 0 || !homeScoreInsight.weakestAreaLabel) {
      return {
        attentionText: "--",
        statusText: "분석을 시작하면 자세 요약이 표시됩니다",
        weakestArea: null,
      };
    }

    if (isStable) {
      return {
        attentionText: "안정",
        statusText: "최근 자세 흐름이 안정적입니다",
        weakestArea: null,
      };
    }

    const statusText =
      homeScoreInsight.weakestArea === "neck"
        ? "목 정렬을 먼저 확인해보세요"
        : homeScoreInsight.weakestArea === "torso"
          ? "허리 균형을 먼저 확인해보세요"
          : "자세 안정성을 먼저 확인해보세요";

    return {
      attentionText: `${homeScoreInsight.weakestAreaLabel} ${homeScoreInsight.weakestAreaScore ?? "--"}`,
      statusText,
      weakestArea: homeScoreInsight.weakestArea,
    };
  }, [homeScoreInsight]);
  const homeAttentionTone = getHomeScoreTone(
    homePostureSummary.attentionText === "안정" ? 100 : homeScoreInsight.weakestAreaScore
  );
  const combinedScorePoints = useMemo(
    () =>
      [...todaySavedScorePoints, ...liveScorePoints]
        .filter((point) => Number.isFinite(point.timestamp))
        .sort((left, right) => left.timestamp - right.timestamp),
    [todaySavedScorePoints, liveScorePoints]
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
  const selectedHistoryGroup = useMemo(
    () => historyGroups.find((group) => group.dateKey === selectedHistoryDateKey) ?? historyGroups[0] ?? null,
    [historyGroups, selectedHistoryDateKey]
  );
  const isSelectedStretchComplete = Boolean(
    selectedStretch && completedStretchSteps.length >= selectedStretch.steps.length
  );
  const isStretchingMode = appMode === "stretching";
  const isStretchBeepSupported =
    typeof window === "undefined" ||
    Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  const modeLabel =
    appMode === "posture"
      ? "자세 분석 중"
      : appMode === "stretching"
        ? "스트레칭 중"
        : "자세 분석 일시중지";
  const resetDynamicStretchRuntime = useCallback(() => {
    dynamicStretchRuntimeRef.current = createDynamicStretchRuntimeState();
  }, []);
  const playStretchBeep = useCallback((count: 1 | 2 | 3, eventKey: string, delayMs = 0) => {
    if (!stretchBeepEnabled || typeof window === "undefined" || appModeRef.current !== "stretching") {
      return;
    }
    if (stretchBeepEventKeysRef.current.has(eventKey)) {
      return;
    }
    stretchBeepEventKeysRef.current.add(eventKey);

    const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    let audioContext = stretchBeepAudioContextRef.current;
    if (!audioContext) {
      audioContext = new AudioContextConstructor();
      stretchBeepAudioContextRef.current = audioContext;
    }

    const playSequence = async () => {
      if (!audioContext) {
        return;
      }
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      for (let index = 0; index < count; index += 1) {
        window.setTimeout(() => {
          if (!audioContext) {
            return;
          }
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          const startAt = audioContext.currentTime;
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, startAt);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.13);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
        }, index * 180);
      }
    };

    window.setTimeout(() => {
      void playSequence().catch((error) => {
        console.warn("Failed to play stretch beep:", error);
      });
    }, delayMs);
  }, [stretchBeepEnabled]);
  const updateStretchBeepEnabled = useCallback((enabled: boolean) => {
    setStretchBeepEnabled(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STRETCH_BEEP_STORAGE_KEY, String(enabled));
    }
  }, []);
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
      setTodaySavedScorePoints([]);
      setLiveScorePoints([]);
      return;
    }

    setIsLoadingHistory(true);
    try {
      const [summary, history] = await Promise.all([getRecent24hSummary(uid), getHistoryByDate(uid)]);
      const historyItems = history ?? [];
      setRecentSummary(summary);
      setHistoryGroups(historyItems);
      setTodaySavedScorePoints(createTodaySavedScorePoints(historyItems));
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const updateLocalSessionTitle = useCallback((sessionTitleKey: string, title: string | null) => {
    setHistoryGroups((currentGroups) =>
      currentGroups.map((group) => ({
        ...group,
        sessions: group.sessions.map((session) => {
          const key = session.sessionTitleKey ?? getSessionTitleKey(session, group.dateKey);
          return key === sessionTitleKey
            ? {
                ...session,
                sessionTitleKey,
                customTitle: title,
              }
            : session;
        }),
      }))
    );
  }, []);

  const handleSaveHistorySessionTitle = useCallback(
    async (session: SessionSummary, dateKey: string) => {
      const uid = uidRef.current;
      const sessionTitleKey = session.sessionTitleKey ?? getSessionTitleKey(session, dateKey);
      const normalizedTitle = normalizeSessionTitle(sessionTitleDraft);
      if (!uid || savingSessionTitleKey) {
        return;
      }

      if (!normalizedTitle) {
        setSessionTitleErrors((current) => ({
          ...current,
          [sessionTitleKey]: "제목을 입력해주세요.",
        }));
        return;
      }

      setSavingSessionTitleKey(sessionTitleKey);
      setSessionTitleErrors((current) => {
        const next = { ...current };
        delete next[sessionTitleKey];
        return next;
      });

      const saved = await saveSessionTitle(uid, sessionTitleKey, normalizedTitle, dateKey, session.sessionId);
      setSavingSessionTitleKey(null);

      if (!saved) {
        setSessionTitleErrors((current) => ({
          ...current,
          [sessionTitleKey]: "제목을 저장하지 못했습니다.",
        }));
        return;
      }

      updateLocalSessionTitle(sessionTitleKey, normalizedTitle);
      setEditingSessionTitleKey(null);
      setSessionTitleDraft("");
    },
    [savingSessionTitleKey, sessionTitleDraft, updateLocalSessionTitle]
  );

  const handleSavePendingSessionTitle = useCallback(async () => {
    const uid = uidRef.current;
    if (!uid || !pendingTitleSession || pendingTitleSaving) {
      return;
    }

    const normalizedTitle = normalizeSessionTitle(pendingTitleDraft);
    if (!normalizedTitle) {
      setPendingTitleError("제목을 입력해주세요.");
      return;
    }

    setPendingTitleSaving(true);
    setPendingTitleError(null);
    const saved = await saveSessionTitle(
      uid,
      pendingTitleSession.sessionTitleKey,
      normalizedTitle,
      pendingTitleSession.dateKey,
      pendingTitleSession.sessionId
    );
    setPendingTitleSaving(false);

    if (!saved) {
      setPendingTitleError("제목을 저장하지 못했습니다.");
      return;
    }

    updateLocalSessionTitle(pendingTitleSession.sessionTitleKey, normalizedTitle);
    setPendingTitleSession(null);
    setPendingTitleDraft("");
    setPendingTitleError(null);
  }, [pendingTitleDraft, pendingTitleSaving, pendingTitleSession, updateLocalSessionTitle]);

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
      if (isDynamicStretchStep(guideStep)) {
        drawDynamicStretchGuidePose(
          context,
          canvas,
          guideStep.checkType,
          results.poseLandmarks ?? null,
          latestStretchCoachingRef.current,
          stretchCalibrationRef.current
        );
      } else {
        drawStretchGuidePose(
          context,
          canvas,
          guideStep.checkType,
          results.poseLandmarks ?? null,
          latestStretchCoachingRef.current.incorrectParts ?? [],
          stretchCalibrationRef.current
        );
      }
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

      if (isSustainedBadPosture && now > postureAlertVisibleUntilRef.current) {
        const message = getIssueText(posture);
        setAlertMessage(message);
        showDesktopNotification("자세 주의", message);
        postureAlertVisibleUntilRef.current = now + 30_000;
        alertVisibleUntilRef.current = Math.max(alertVisibleUntilRef.current, postureAlertVisibleUntilRef.current);
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
      if (now > postureAlertVisibleUntilRef.current && now > stretchAlertVisibleUntilRef.current) {
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
      stretchAlertVisibleUntilRef.current = now + 30_000;
      alertVisibleUntilRef.current = Math.max(alertVisibleUntilRef.current, stretchAlertVisibleUntilRef.current);
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
    dynamicStretchRuntimeRef.current = createDynamicStretchRuntimeState();
    stretchCalibrationRef.current = null;
    stretchCalibrationStatusRef.current = "idle";
    stretchCalibrationStartedAtRef.current = null;
    stretchCalibrationSamplesRef.current = [];
    setStretchCalibrationStatus("idle");
    setStretchCalibrationMessage(message);
  }, []);

  const beginStretchCalibration = useCallback(() => {
    resetDynamicStretchRuntime();
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
  }, [resetDynamicStretchRuntime]);

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
    if (nextResult.isDynamic) {
      const rawScore = nextResult.matchPercentage ?? nextResult.poseScore;
      const smoothedScore =
        typeof rawScore === "number"
          ? Math.round(
              smoothedStretchMatchRef.current === null
                ? rawScore
                : smoothedStretchMatchRef.current * 0.65 + rawScore * 0.35
            )
          : null;
      smoothedStretchMatchRef.current = smoothedScore;
      stableResult = {
        ...nextResult,
        poseScore: smoothedScore,
        matchPercentage: smoothedScore,
        isPoseValid: typeof smoothedScore === "number" && smoothedScore >= 70,
        holdSeconds: 0,
      };

      if (typeof smoothedScore === "number") {
        stretchCompletionMatchSamplesRef.current = [...stretchCompletionMatchSamplesRef.current.slice(-239), smoothedScore];
      }

      if (stableResult.isStepCompleted && !completedStretchStepsRef.current.has(activeStepIndex)) {
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
            action: "dynamic-step-complete",
            completedAt: new Date().toISOString(),
            poseScore: stableResult.poseScore,
            matchPercentage: stableResult.matchPercentage,
            repeatCount: stableResult.repeatCount,
            feedbackSummary: stableResult.coachingMessage,
          });
        }

        if (stretch) {
          const isLastStep = activeStepIndex >= stretch.steps.length - 1;
          if (isLastStep) {
            playStretchBeep(3, `stretch-complete:${stretch.id}`);
            setIsStretchingMode(false);
            stableResult = {
              ...stableResult,
              isStepCompleted: true,
              coachingMessage: "스트레칭 완료!",
            };
          } else {
            const nextStepIndex = activeStepIndex + 1;
            playStretchBeep(2, `step-complete:${stretch.id}:${activeStepIndex}`);
            playStretchBeep(1, `step-start:${stretch.id}:${nextStepIndex}`, 520);
            activeStretchStepIndexRef.current = nextStepIndex;
            setActiveStretchStepIndex(nextStepIndex);
            resetDynamicStretchRuntime();
            stretchHoldStartedAtRef.current = null;
            smoothedStretchMatchRef.current = null;
            lastStretchFeedbackUpdateAtRef.current = 0;
            stableResult = {
              stretchId: stretch.id,
              stepIndex: nextStepIndex,
              isPoseValid: false,
              poseScore: null,
              coachingMessage: "다음 단계로 이동했습니다. 안내에 맞춰 자세를 준비해주세요.",
              holdSeconds: 0,
            };
          }
        }
      }

      const elapsed = now - lastStretchFeedbackUpdateAtRef.current;
      if (!force && elapsed < STRETCH_FEEDBACK_INTERVAL_MS) {
        return;
      }

      latestStretchCoachingRef.current = stableResult;
      lastStretchFeedbackUpdateAtRef.current = now;
      setStretchCoaching(stableResult);
      return;
    }

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
            playStretchBeep(3, `stretch-complete:${stretch.id}`);
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
            playStretchBeep(2, `step-complete:${stretch.id}:${activeStepIndex}`);
            playStretchBeep(1, `step-start:${stretch.id}:${nextStepIndex}`, 520);
            activeStretchStepIndexRef.current = nextStepIndex;
            setActiveStretchStepIndex(nextStepIndex);
            resetDynamicStretchRuntime();
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
  }, [playStretchBeep, resetDynamicStretchRuntime, setIsStretchingMode]);

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

    const averagePosture: PostureResult = {
      ...posture,
      score: cumulativeAverage,
      isBadPosture: cumulativeAverage <= settingsRef.current.warningScoreThreshold,
    };

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
      setLiveScorePoints((previous) => [
        ...previous.slice(-23),
        {
          id: `live-${now}`,
          time: new Intl.DateTimeFormat("ko-KR", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Seoul",
          }).format(new Date(now)),
          timestamp: now,
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
          const activeStretch = getStretchById(activeStretchIdRef.current);
          const activeStep = activeStretch?.steps[activeStretchStepIndexRef.current];
          updateStretchCoaching(
            isDynamicStretchStep(activeStep)
              ? analyzeDynamicStretchStep(
                  activeStretchIdRef.current,
                  activeStretchStepIndexRef.current,
                  results.poseLandmarks ?? null,
                  dynamicStretchRuntimeRef.current,
                  Date.now(),
                  stretchCalibrationRef.current
                )
              : analyzeStretchStep(
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
      smoothLandmarks: true,
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
    let finalizedSessionForTitle: PendingTitleSession | null = null;
    const activePausedMs =
      posturePausedStartedAtRef.current === null ? 0 : Date.now() - posturePausedStartedAtRef.current;
    if (uid && sessionId && startedAt) {
      const endedAt = new Date().toISOString();
      const postureDurationMs = Math.max(
        0,
        Date.now() - new Date(startedAt).getTime() - totalPosturePausedMsRef.current - activePausedMs
      );
      const durationMinutes = Math.max(1, Math.round(postureDurationMs / 60000));

      const finalized = await finalizeSessionSummary(uid, sessionId, {
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
      if (finalized) {
        const dateKey = getKoreaDateKey(new Date(startedAt));
        finalizedSessionForTitle = {
          sessionId,
          sessionTitleKey: getSessionTitleKey({ sessionId, startedAt }, dateKey),
          dateKey,
          startedAt,
        };
      }
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
    postureAlertVisibleUntilRef.current = 0;
    stretchAlertVisibleUntilRef.current = 0;
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
    if (finalizedSessionForTitle) {
      setPendingTitleSession(finalizedSessionForTitle);
      setPendingTitleDraft("");
      setPendingTitleError(null);
    }
    setLiveScorePoints([]);
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
    setLiveScorePoints([]);
    alertCountRef.current = 0;
    badPostureStartedAtRef.current = null;
    alertVisibleUntilRef.current = 0;
    postureAlertVisibleUntilRef.current = 0;
    stretchAlertVisibleUntilRef.current = 0;
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
    stretchBeepEventKeysRef.current = new Set();
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
    postureAlertVisibleUntilRef.current = 0;
    setAlertMessage(null);
    setActiveTab("stretching");
    setModeMessage("스트레칭 모드로 전환합니다. 자세 분석이 일시중지됩니다.");
    setIsStretchingMode(true);
    stretchBeepEventKeysRef.current = new Set();
    playStretchBeep(1, `step-start:${activeStretchIdRef.current}:${activeStretchStepIndexRef.current}`);
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
  }, [beginStretchCalibration, isRunning, playStretchBeep, startApp]);

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
    resetDynamicStretchRuntime();
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
      playStretchBeep(3, `stretch-complete:${stretch.id}`);
      setIsStretchingMode(false);
      resetStretchCalibration();
    } else if (appModeRef.current === "stretching") {
      playStretchBeep(2, `step-complete:${stretch.id}:${currentStepIndex}`);
      playStretchBeep(1, `step-start:${stretch.id}:${nextStepIndex}`, 520);
    }
  }, [playStretchBeep, resetDynamicStretchRuntime, resetStretchCalibration, setIsStretchingMode]);

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
    stretchBeepEventKeysRef.current = new Set();
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

  const updateSettingsDraft = useCallback((changes: Partial<Settings>) => {
    setSettingsDraft((current) => ({
      ...current,
      ...changes,
      notificationPermissionStatus: getNotificationPermissionStatus(),
    }));
    setSettingsSaveStatus("idle");
  }, []);

  const handleApplySettings = useCallback(() => {
    const badPostureDurationMinutes = Number(badPostureDurationMinutesInput);
    if (
      !badPostureDurationMinutesInput.trim() ||
      !Number.isInteger(badPostureDurationMinutes) ||
      badPostureDurationMinutes < 1 ||
      badPostureDurationMinutes > 10
    ) {
      return;
    }

    const nextSettings = {
      ...settingsDraft,
      smoothingEnabled: true,
      badPostureDurationMinutes,
      notificationPermissionStatus: getNotificationPermissionStatus(),
    };
    setSettings(nextSettings);
    setSettingsDraft(nextSettings);
    setBadPostureDurationMinutesInput(String(nextSettings.badPostureDurationMinutes));
    settingsRef.current = nextSettings;
    analyzerRef.current.setPreferredSideMode(nextSettings.preferredSideMode);
    detectorRef.current?.setOptions({ smoothLandmarks: true });
    void persistSettings(nextSettings);
  }, [badPostureDurationMinutesInput, persistSettings, settingsDraft]);

  const handleResetSettings = useCallback(() => {
    const nextSettings = createDefaultSettings();
    setSettingsDraft(nextSettings);
    setBadPostureDurationMinutesInput(String(nextSettings.badPostureDurationMinutes));
    setSettingsSaveStatus("idle");
  }, []);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      updateSettingsDraft({ notificationPermissionStatus: "unsupported" });
      return;
    }

    const permission = await Notification.requestPermission();
    updateSettingsDraft({ notificationPermissionStatus: permission });
    if (permission === "granted") {
      showDesktopNotification("알림 설정 완료", "나쁜 자세가 감지되면 Windows 알림으로 알려드릴게요.");
    }
  }, [updateSettingsDraft]);

  const handleClearHistory = useCallback(async () => {
    const uid = uidRef.current;
    if (!uid || isClearingHistory) {
      return;
    }

    setIsClearingHistory(true);
    try {
      const cleared = await clearUserMeasurementHistory(uid);
      if (cleared) {
        setIsClearHistoryConfirmOpen(false);
        setTodaySavedScorePoints([]);
        setLiveScorePoints([]);
        setRecentSummary(null);
        setHistoryGroups([]);
        setEditingSessionTitleKey(null);
        setSessionTitleDraft("");
        setSavingSessionTitleKey(null);
        setSessionTitleErrors({});
        setPendingTitleSession(null);
        setPendingTitleDraft("");
        setPendingTitleError(null);
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
    setSettingsDraft(initialSettings);
    setBadPostureDurationMinutesInput(String(initialSettings.badPostureDurationMinutes));
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
            smoothingEnabled: true,
            preferredSideMode: normalizeSideMode(loadedSettings.preferredSideMode),
            notificationPermissionStatus: getNotificationPermissionStatus(),
          };
          setSettings(nextSettings);
          setSettingsDraft(nextSettings);
          setBadPostureDurationMinutesInput(String(nextSettings.badPostureDurationMinutes));
          settingsRef.current = nextSettings;
          analyzerRef.current.setPreferredSideMode(nextSettings.preferredSideMode);
          detectorRef.current?.setOptions({ smoothLandmarks: true });
        });
      } else {
        const nextSettings = createDefaultSettings();
        setSettings(nextSettings);
        setSettingsDraft(nextSettings);
        setBadPostureDurationMinutesInput(String(nextSettings.badPostureDurationMinutes));
        settingsRef.current = nextSettings;
        analyzerRef.current.setPreferredSideMode(nextSettings.preferredSideMode);
        detectorRef.current?.setOptions({ smoothLandmarks: true });
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
      void stretchBeepAudioContextRef.current?.close();
      stretchBeepAudioContextRef.current = null;
    };
  }, [refreshHistory]);

  useEffect(() => {
    settingsRef.current = settings;
    analyzerRef.current.setPreferredSideMode(settings.preferredSideMode);
    detectorRef.current?.setOptions({ smoothLandmarks: true });
  }, [settings]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (historyGroups.length === 0) {
      if (selectedHistoryDateKey !== null) {
        setSelectedHistoryDateKey(null);
      }
      return;
    }

    if (!selectedHistoryDateKey || !historyGroups.some((group) => group.dateKey === selectedHistoryDateKey)) {
      setSelectedHistoryDateKey(historyGroups[0].dateKey);
    }
  }, [historyGroups, selectedHistoryDateKey]);

  useEffect(() => {
    setHistorySessionPage(0);
  }, [selectedHistoryDateKey]);

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

  const analysisSettingsPanels: Array<{ id: AnalysisSettingsPanel; title: string; icon: ReactNode }> = [
    { id: "analysis-options", title: "분석 옵션", icon: <SlidersHorizontal className="h-5 w-5 text-blue-600" /> },
    { id: "posture-alerts", title: "자세 경고 알림", icon: <Bell className="h-5 w-5 text-blue-600" /> },
    { id: "stretch-alerts", title: "스트레칭 알림", icon: <Clock className="h-5 w-5 text-blue-600" /> },
  ];
  const activeAnalysisSettingsPanelIndex = Math.max(
    0,
    analysisSettingsPanels.findIndex((panel) => panel.id === activeAnalysisSettingsPanel)
  );
  const currentAnalysisSettingsPanel = analysisSettingsPanels[activeAnalysisSettingsPanelIndex];
  const showPreviousAnalysisSettingsPanel = () => {
    setActiveAnalysisSettingsPanel((current) => {
      const currentIndex = analysisSettingsPanels.findIndex((panel) => panel.id === current);
      const nextIndex = (currentIndex - 1 + analysisSettingsPanels.length) % analysisSettingsPanels.length;
      return analysisSettingsPanels[nextIndex].id;
    });
  };
  const showNextAnalysisSettingsPanel = () => {
    setActiveAnalysisSettingsPanel((current) => {
      const currentIndex = analysisSettingsPanels.findIndex((panel) => panel.id === current);
      const nextIndex = (currentIndex + 1) % analysisSettingsPanels.length;
      return analysisSettingsPanels[nextIndex].id;
    });
  };

  const renderHome = () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">다시 오신 것을 환영합니다</h1>
        <p className="mt-1 text-gray-600">오늘도 바른 자세로 시작해볼까요?</p>
      </div>

      <section className="app-surface border-l-4 border-l-[#18755B] p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-center">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center bg-[#C4F6E8] text-[#18755B]">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">오늘의 자세 요약</h2>
                <p className="text-sm text-gray-500">최근 기록으로 몸 상태를 확인하세요</p>
              </div>
            </div>
            <div className="grid gap-4 text-sm sm:grid-cols-[300px_minmax(0,1fr)] sm:items-start">
              <div className="grid max-w-[300px] gap-1.5">
              <div className="grid grid-cols-[76px_minmax(0,170px)] items-center gap-3 border-b border-gray-200 pb-1.5 leading-5">
                <span className="text-gray-500">주의 부위</span>
                <strong className="inline-flex items-center justify-end gap-1.5 text-right font-bold tabular-nums text-[#18755B]">
                  {homePostureSummary.weakestArea ? getPostureAreaIcon(homePostureSummary.weakestArea, "h-3.5 w-3.5") : null}
                  <span className={`${homeAttentionTone.badgeClass} px-1.5 py-0.5`}>{homePostureSummary.attentionText}</span>
                </strong>
              </div>
              <p className="pt-1 text-sm font-medium leading-6 text-gray-600">{homePostureSummary.statusText}</p>
              </div>
              <div className="grid max-w-[560px] gap-2">
                <div className="grid gap-2">
                  {homeScoreInsight.areaScores.map((area) => (
                    (() => {
                      const areaTone = getHomeScoreTone(area.score);
                      return (
                        <div key={area.area} className="grid grid-cols-[56px_minmax(0,1fr)_44px] items-center gap-3 leading-5">
                          <span className="inline-flex items-center gap-1.5 text-gray-500">
                            {getPostureAreaIcon(area.area, "h-3.5 w-3.5")}
                            {area.label}
                          </span>
                          <div className={`h-1.5 ${areaTone.trackClass}`}>
                            <div
                              className={`block h-full ${areaTone.barClass}`}
                              style={{ width: `${area.score ?? 0}%` }}
                            />
                          </div>
                          <strong className="text-right tabular-nums text-gray-900">{area.score ?? "--"}</strong>
                        </div>
                      );
                    })()
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("analysis")}
              className="app-action-tile p-5"
            >
              <div className="flex items-center justify-center gap-3">
                <Video className="h-5 w-5" />
                <span className="text-lg font-medium">자세 분석 시작</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className="app-action-tile-secondary p-4"
            >
              <div className="flex items-center justify-center gap-3">
                <Calendar className="h-5 w-5" />
                <span className="text-base font-medium">기록 보기</span>
              </div>
            </button>
          </div>
        </div>
      </section>

      <div className="grid items-stretch gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="app-surface flex h-full flex-col justify-between p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center bg-[#C4F6E8] text-[#18755B]">
            <CheckCircle className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">최근 변화</h2>
            <p className="text-sm text-gray-500">지난 24시간</p>
          </div>
        </div>
        <div className="grid w-full gap-1.5 text-sm">
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 border-b border-gray-200 pb-1.5 leading-5">
            <span className="text-gray-500">평균 점수</span>
            <strong className="text-right tabular-nums text-gray-900">
              {recentSummary?.averageScore === null || recentSummary?.averageScore === undefined ? "--" : recentSummary.averageScore}
              <span className="ml-1 text-xs font-bold text-gray-500">/100</span>
            </strong>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 border-b border-gray-200 pb-1.5 leading-5">
            <span className="text-gray-500">7일 비교</span>
            <strong
              className={`text-right tabular-nums ${
                homeScoreInsight.trend === null
                  ? "text-gray-700"
                  : homeScoreInsight.trend >= 0
                    ? "text-[#18755B]"
                    : "text-yellow-800"
              }`}
            >
              {homeScoreInsight.trend === null ? "--" : `${homeScoreInsight.trend >= 0 ? "+" : ""}${homeScoreInsight.trend}`}
            </strong>
          </div>
          <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 border-b border-gray-200 pb-1.5 leading-5">
            <span className="text-gray-500">최고 / 최저</span>
            <strong className="text-right tabular-nums text-gray-900">
              {homeScoreInsight.bestScore !== null || homeScoreInsight.worstScore !== null
                ? `${homeScoreInsight.bestScore ?? "--"} / ${homeScoreInsight.worstScore ?? "--"}`
                : "--"}
            </strong>
          </div>
        </div>
        <div className="mt-5 grid w-full gap-1.5 border-t border-gray-200 pt-3 text-xs leading-5 text-gray-500">
          <span className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
            <span>최근 측정</span>
            <span className="text-right tabular-nums text-gray-700">
              {homeScoreInsight.latestMeasuredAt ? formatTime(homeScoreInsight.latestMeasuredAt) : "--"}
            </span>
          </span>
          <span className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
            <span>사용 시간</span>
            <span className="text-right tabular-nums text-gray-700">{formatMinutes(recentSummary?.totalUsageMinutes ?? 0)}</span>
          </span>
          <span className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
            <span>알림 횟수</span>
            <span className="text-right tabular-nums text-gray-700">{recentSummary?.alertCount ?? 0}</span>
          </span>
        </div>
      </section>

      <div className="app-surface p-6">
        <h2 className="mb-4 text-lg font-bold text-gray-900">오늘의 자세 점수 변화</h2>
        {combinedScorePoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={combinedScorePoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
              <Tooltip />
              <Line type="linear" dataKey="score" stroke="#18755B" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[200px] items-center justify-center border border-dashed border-gray-200 bg-[rgba(196,246,232,0.28)] px-4 text-center text-sm font-medium text-gray-500">
            오늘 분석 기록이 아직 없습니다
          </div>
        )}
      </div>
      </div>
    </div>
  );

  const renderAnalysis = () => (
    <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <section className="app-surface flex h-full flex-col p-6">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">실시간 카메라</p>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">측면 자세 분석</h2>
              <button
                type="button"
                onClick={() => setIsAnalysisSettingsOpen(true)}
                className="flex h-8 items-center justify-center gap-1.5 border border-[rgba(18,100,76,0.24)] bg-white px-2.5 text-sm font-bold text-[#18755B]"
                aria-label="분석 설정 열기"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>설정</span>
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              카메라가 사용자의 옆모습을 볼 수 있도록 앉아주세요.
            </p>
          </div>
          <span
            className={`inline-flex min-h-9 items-center justify-center gap-2 border px-3 py-1 text-sm font-bold ${
              cameraTone === "good"
                ? "border-[#70E5C4] bg-[#C4F6E8] text-[#18755B]"
                : cameraTone === "danger"
                  ? "bg-red-100 text-red-700"
                : cameraTone === "warn"
                  ? "bg-yellow-100 text-yellow-700"
                  : "border-gray-200 bg-gray-100 text-gray-600"
            }`}
          >
            <span className="app-status-dot" />
            {cameraText}
          </span>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-gray-200 py-3 text-sm">
          <span className="inline-flex items-center gap-2 font-bold text-blue-700">
            <span className="app-status-dot" />
            {modeLabel}
          </span>
          <span className="font-bold text-gray-700">
            {getAnalysisSideLabel(latestPosture, settings.preferredSideMode)}
          </span>
          {modeMessage && (
            <span className="border-l border-yellow-300 pl-4 font-bold text-yellow-800">
              {modeMessage}
            </span>
          )}
        </div>

        <div className="app-camera-frame relative mt-4 aspect-video overflow-hidden">
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
            className={`min-h-12 flex-1 px-6 py-3 font-bold text-white ${
              isRunning ? "bg-red-600" : "bg-blue-600"
            }`}
          >
            {isRunning ? "분석 중지" : "분석 시작"}
          </button>
        </div>

      </section>

      <div className="flex h-full flex-col gap-4">
        <section className="app-surface flex-none p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">실시간 자세</p>
              <h3 className="text-xl font-bold text-gray-900">실시간 자세 점수</h3>
            </div>
            <span
              className={`inline-flex items-center gap-2 border px-3 py-1 text-sm font-bold ${
                postureStatus === "good"
                  ? "border-[#70E5C4] bg-[#C4F6E8] text-[#18755B]"
                  : postureStatus === "warning"
                    ? "bg-yellow-100 text-yellow-700"
                  : postureStatus === "danger"
                    ? "bg-red-100 text-red-700"
                    : "border-gray-200 bg-gray-100 text-gray-600"
              }`}
            >
              <span className="app-status-dot" />
              {getStatusLabel(latestPosture.score)}
            </span>
          </div>

          <div className="my-5 flex flex-wrap items-end gap-3 font-bold text-gray-900">
            <span className="text-7xl leading-none">{latestPosture.score ?? "--"}</span>
            <span className="mb-2 text-lg text-gray-500">/100</span>
            {appMode === "stretching" && (
              <span className="mb-3 border border-yellow-200 bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-800">
                일시중지됨
              </span>
            )}
          </div>

          <p className="border-l-4 border-l-[#18755B] bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-950">
            현재 분석 평균 점수: {sessionAverageScore ?? "--"}점
          </p>
          <p className="mt-4 text-sm leading-6 text-gray-700">{getWeightMessage(latestPosture)}</p>
          {latestPosture.feedbackItems.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-bold text-gray-900">부위별 피드백</p>
              {latestPosture.feedbackItems.map((item) => (
                <div
                  key={item.part}
                  className={`border p-3 text-sm leading-6 ${getFeedbackSeverityClass(item.severity)}`}
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

        <section className="app-surface flex min-h-[280px] flex-1 flex-col p-6">
          <h3 className="mb-4 text-lg font-bold text-gray-900">분석 지표</h3>
          <div className="grid flex-1 grid-rows-3 gap-3">
            <div className="flex min-h-0 flex-col justify-center border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
              <span className="text-sm font-medium text-gray-600">목 점수 / 각도 / 하중</span>
              <strong className="mt-2 break-keep text-right text-xl leading-tight text-gray-900">
                {latestPosture.metrics
                  ? `${Math.round(latestPosture.metrics.neckScore)}점 · ${latestPosture.metrics.neckAngleDegrees.toFixed(1)}° · ${latestPosture.metrics.estimatedNeckLoadKg.toFixed(1)}kg`
                  : "--"}
              </strong>
            </div>
            <div className="flex min-h-0 flex-col justify-center border-t border-gray-100 pt-3">
              <span className="text-sm font-medium text-gray-600">허리 점수 / 기울기</span>
              <strong className="mt-2 break-keep text-right text-xl leading-tight text-gray-900">
                {latestPosture.metrics
                  ? `${Math.round(latestPosture.metrics.trunkScore)}점 · ${latestPosture.metrics.trunkLeanDegrees.toFixed(1)}°`
                  : "--"}
              </strong>
            </div>
            <div className="flex min-h-0 flex-col justify-center border-t border-gray-100 pt-3">
              <span className="text-sm font-medium text-gray-600">안정성 점수</span>
              <strong className="mt-2 break-keep text-right text-xl leading-tight text-gray-900">
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
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-gray-300 bg-white px-5 py-2 font-bold text-gray-700"
        >
          <Video className="h-5 w-5" />
          자세 분석 모드
        </button>
      </div>

      {hasCurrentSessionPostureData && (
        <section className="app-surface p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">맞춤 스트레칭 추천</h2>
              {personalizedStretchRecommendations.message && (
                <p className="mt-1 text-sm text-gray-600">{personalizedStretchRecommendations.message}</p>
              )}
            </div>
            {isLoadingHistory && (
              <span className="border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                추천 계산 중...
              </span>
            )}
          </div>

          {isLoadingHistory ? (
            <div className="border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
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
                    className={`group flex h-full flex-col border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18755B] ${
                      activeStretchId === recommendation.stretchId
                        ? "border-[#18755B] bg-[#E7FFF7]"
                        : "border-gray-200 bg-white hover:border-[#18755B] hover:bg-[#E7FFF7]"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="mb-1 text-xs font-bold text-blue-600">{stretch.targetBodyPart}</p>
                        <h3 className="font-bold text-gray-900">{stretch.name}</h3>
                      </div>
                      <span
                        className={`shrink-0 border px-2.5 py-1 text-xs font-bold ${getRecommendationPriorityClass(
                          recommendation.priorityLabel
                        )}`}
                      >
                        우선순위: {recommendation.priorityLabel}
                      </span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800">추천 이유:</p>
                      <ul className="mt-1 space-y-1 text-sm leading-6 text-gray-600">
                        {recommendation.reasons.slice(0, 2).map((reason) => (
                          <li key={reason}>- {reason}</li>
                        ))}
                      </ul>
                    </div>
                    <div
                      className={`mt-4 flex items-center justify-between border px-3 py-2 text-sm font-bold ${
                        activeStretchId === recommendation.stretchId
                          ? "border-[#18755B] bg-[#18755B] text-white"
                          : "border-[#18755B]/25 bg-white text-[#18755B] group-hover:border-[#18755B]"
                      }`}
                    >
                      <span>{activeStretchId === recommendation.stretchId ? "선택됨" : "이 스트레칭 선택하기"}</span>
                      {activeStretchId === recommendation.stretchId ? (
                        <CheckCircle className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="border border-gray-100 bg-[rgba(196,246,232,0.28)] px-4 py-3 text-sm font-bold text-gray-700">
              자세 분석을 먼저 진행하면 맞춤 스트레칭을 추천받을 수 있습니다.
            </div>
          )}
          <div className="mt-4 border-t border-gray-100 pt-4">
            <button
              type="button"
              onClick={() => setShowAllStretchOptions((current) => !current)}
              className="inline-flex min-h-10 items-center justify-center gap-2 border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700"
            >
              {showAllStretchOptions ? "다른 스트레칭 목록 닫기" : "다른 스트레칭 선택하기"}
              <ChevronRight
                className="h-4 w-4"
              />
            </button>

            {showAllStretchOptions && (
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {allStretchOptions.map((stretch) => (
                  <button
                    key={stretch.id}
                    type="button"
                    onClick={() => handleStretchSelection(stretch.id)}
                    className={`group flex h-full flex-col border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18755B] ${
                      activeStretchId === stretch.id
                        ? "border-[#18755B] bg-[#E7FFF7]"
                        : "border-gray-200 bg-gray-50 hover:border-[#18755B] hover:bg-[#E7FFF7]"
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <p className="mb-1 text-xs font-bold text-blue-600">{stretch.targetBodyPart}</p>
                        <h3 className="font-bold text-gray-900">{stretch.name}</h3>
                      </div>
                      {activeStretchId === stretch.id ? (
                        <CheckCircle className="h-5 w-5 shrink-0 text-[#18755B]" />
                      ) : (
                        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-[#18755B]" />
                      )}
                    </div>
                    <p className="text-sm leading-6 text-gray-600">{stretch.shortDescription}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{stretch.durationSec}초</span>
                      <span>{stretch.steps.length}단계</span>
                    </div>
                    <div
                      className={`mt-4 flex items-center justify-between border px-3 py-2 text-sm font-bold ${
                        activeStretchId === stretch.id
                          ? "border-[#18755B] bg-[#18755B] text-white"
                          : "border-[#18755B]/25 bg-white text-[#18755B] group-hover:border-[#18755B]"
                      }`}
                    >
                      <span>{activeStretchId === stretch.id ? "선택됨" : "선택하기"}</span>
                      {activeStretchId === stretch.id ? (
                        <CheckCircle className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <div className="stretch-analysis-layout">
        <div className="flex min-h-0 flex-col gap-4">
          <div className="app-camera-frame relative flex aspect-video items-center justify-center overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" playsInline muted />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {!isRunning ? (
              <div className="relative text-center">
                <VideoOff className="mx-auto mb-4 h-16 w-16 text-gray-600" />
                <p className="text-gray-400">스트레칭 분석 시작을 누르면 카메라가 켜집니다.</p>
              </div>
            ) : (
              <div className="absolute left-4 top-4">
                <div className="flex items-center gap-2 border border-[#70E5C4] bg-[#18755B] px-3 py-1.5">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                  <span className="text-sm font-medium text-white">자세 감지 중</span>
                </div>
              </div>
            )}
            {selectedStretch && activeStretchStep && (
              <div className="absolute right-4 top-4 flex max-w-[75%] flex-wrap justify-end gap-1.5">
                <span className="border border-white/40 bg-white/90 px-2.5 py-1 text-xs font-bold text-blue-950">
                  동작 정확도: {stretchCoaching.matchPercentage ?? stretchCoaching.poseScore ?? "--"}%
                </span>
                <span className="border border-[#70E5C4]/40 bg-[#18755B]/90 px-2.5 py-1 text-xs font-bold text-white">
                  {activeStretchStepIndex + 1} / {selectedStretch.steps.length} 단계
                </span>
                <span className="border border-yellow-200/70 bg-yellow-300/90 px-2.5 py-1 text-xs font-bold text-blue-950">
                  {isDynamicStretchStep(activeStretchStep)
                    ? `반복: ${stretchCoaching.repeatCount ?? 0} / ${stretchCoaching.targetRepeats ?? 3}`
                    : `유지 시간: ${stretchCoaching.holdSeconds ?? 0} / 5초`}
                </span>
              </div>
            )}
          </div>

          {selectedStretch && activeStretchStep && (
            <div className="app-surface flex-1 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#C4F6E8] text-[#18755B]">
                  <Activity className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-bold text-gray-900">{selectedStretch.name}</p>
                    <span className="border border-[#18755B]/20 bg-[#C4F6E8]/55 px-2.5 py-1 text-xs font-bold text-[#18755B]">
                      {activeStretchStepIndex + 1} / {selectedStretch.steps.length} 단계
                    </span>
                    {isSelectedStretchComplete && (
                      <span className="border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700">
                        완료
                      </span>
                    )}
                  </div>
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-gray-500">
                    <input
                      type="checkbox"
                      checked={stretchBeepEnabled && isStretchBeepSupported}
                      disabled={!isStretchBeepSupported}
                      onChange={(event) => updateStretchBeepEnabled(event.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <span>소리 안내</span>
                  </label>
                  <div className="mt-3 flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#E7FFF7] text-[#18755B]">
                      {getStretchStepPictogram(activeStretchStep.checkType, "h-9 w-9")}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#18755B]">{activeStretchStep.title}</p>
                      <p className="mt-1 text-base leading-7 text-gray-800">{activeStretchStep.instruction}</p>
                    </div>
                  </div>
                  {isDynamicStretchStep(activeStretchStep) && (
                    <p className="mt-3 border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm font-bold text-yellow-800">
                      천천히, 통증 없이 가능한 범위에서만 움직이세요.
                    </p>
                  )}
                  <div className="mt-4 border border-[#18755B]/15 bg-[#E7FFF7]/45 p-4">
                    <p className="text-sm font-bold text-[#18755B]">실시간 피드백</p>
                    <p className="mt-1 text-lg font-bold leading-7 text-gray-900">{stretchCoaching.coachingMessage}</p>
                    <p className="mt-3 text-xl font-black text-[#18755B]">
                      동작 정확도: {stretchCoaching.matchPercentage ?? stretchCoaching.poseScore ?? "--"}%
                    </p>
                    {stretchCoaching.correctionMessages?.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {stretchCoaching.correctionMessages.slice(0, 2).map((message) => (
                          <span key={message} className="border border-red-200 bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
                            {message}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-600">
                      <span>점수: {stretchCoaching.poseScore ?? "--"}점</span>
                      <span>
                        {isDynamicStretchStep(activeStretchStep)
                          ? `반복: ${stretchCoaching.repeatCount ?? 0} / ${stretchCoaching.targetRepeats ?? 3}`
                          : `유지 시간: ${stretchCoaching.holdSeconds ?? 0} / 5초`}
                      </span>
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
              className={`flex-1 px-6 py-3 font-medium ${
                isStretchingMode
                  ? "bg-red-600 text-white"
                  : !activeStretchId || isSelectedStretchComplete
                    ? "cursor-not-allowed bg-gray-300 text-gray-500"
                    : "bg-blue-600 text-white"
              }`}
            >
              {isStretchingMode ? "중지" : "스트레칭 분석 시작"}
            </button>
            <button
              type="button"
              onClick={handleNextStretchStep}
              disabled={!selectedStretch || isSelectedStretchComplete}
              className="border border-blue-200 bg-white px-6 py-3 font-medium text-blue-700 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400"
            >
              다음 단계
            </button>
            <button
              type="button"
              onClick={() => (isRunning ? void stopApp() : void startApp())}
              className="border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700"
            >
              {isRunning ? "카메라 중지" : "카메라 시작"}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          {selectedStretch ? (
            <>
              <div className="app-surface flex-1 p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-2 text-xs font-bold text-blue-600">{selectedStretch.targetBodyPart}</p>
                    <h3 className="mb-1 text-xl font-bold text-gray-900">{selectedStretch.name}</h3>
                    <p className="text-sm leading-6 text-gray-600">{selectedStretch.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearStretchSelection}
                    className="shrink-0 text-sm text-gray-400"
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
                    const pictogramBoxClassName = isCurrent
                      ? "bg-[#E7FFF7] text-[#18755B]"
                      : isDone
                        ? "bg-green-50 text-green-600"
                        : "bg-transparent text-gray-300";
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => {
                          activeStretchStepIndexRef.current = index;
                          setActiveStretchStepIndex(index);
                          if (appModeRef.current === "stretching") {
                            playStretchBeep(1, `step-start:${selectedStretch.id}:${index}`);
                          }
                          resetDynamicStretchRuntime();
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
                        className={`w-full border p-3 text-left ${
                          isCurrent
                            ? "border-[#18755B]/45 bg-[#E7FFF7]"
                            : isDone
                              ? "border-green-200 bg-green-50"
                              : "border-gray-200 bg-white"
                        }`}
                      >
                        <div className="flex gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                              isDone
                                ? "bg-green-600 text-white"
                                : isCurrent
                                  ? "bg-[#18755B] text-white"
                                  : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {isDone ? <CheckCircle className="h-4 w-4" /> : index + 1}
                          </div>
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center ${pictogramBoxClassName}`}>
                            {getStretchStepPictogram(step.checkType, "h-5 w-5")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-bold text-gray-900">{step.title}</p>
                              {isCurrent && (
                                <span className="border border-[#18755B]/15 bg-[#C4F6E8]/55 px-2 py-0.5 text-xs font-bold text-[#18755B]">
                                  현재 단계
                                </span>
                              )}
                              {isDone && (
                                <span className="border border-green-200 bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
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

            </>
          ) : (
            <div className="space-y-3">
              <h3 className="font-bold text-gray-900">추천 스트레칭</h3>
              {displayedRecommendedStretches.map((stretch) => (
                <button
                  key={stretch.id}
                  type="button"
                  onClick={() => handleStretchSelection(stretch.id)}
                  className="w-full border border-gray-100 bg-white p-4 text-left"
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

  const renderHistory = () => {
    const missingScoreBadge = (
      <span className="inline-flex items-center border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-bold text-gray-500">
        측정 부족
      </span>
    );

    const renderStatCard = (
      label: string,
      value: ReactNode,
      icon: ReactNode,
      options?: { tone?: "neutral" | "warning"; badge?: ReactNode }
    ) => {
      const isWarning = options?.tone === "warning";
      return (
        <div
          className={`border px-4 py-3 ${
            isWarning ? "border-orange-200 bg-orange-50 text-orange-800" : "border-[rgba(18,100,76,0.2)] bg-white text-gray-900"
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold text-gray-500">
            <span>{label}</span>
            <span className={isWarning ? "text-orange-600" : "text-[#18755B]"}>{icon}</span>
          </div>
          <div className="flex items-end justify-between gap-2">
            <strong className="text-xl leading-none tabular-nums">{value}</strong>
            {options?.badge}
          </div>
        </div>
      );
    };

    const renderDateItem = (day: HistoryGroup, layout: "desktop" | "mobile") => {
      const isSelected = selectedHistoryGroup?.dateKey === day.dateKey;
      const hasAverage = day.averageScore !== null;
      const layoutClass =
        layout === "mobile"
          ? "min-w-[72vw] shrink-0 sm:min-w-[260px]"
          : "w-full border-l-4";

      return (
        <button
          key={`${layout}-${day.dateKey}`}
          type="button"
          onClick={() => setSelectedHistoryDateKey(day.dateKey)}
          className={`grid gap-2 border px-4 py-3 text-left text-sm transition-colors ${layoutClass} ${
            isSelected
              ? "border-[#18755B] bg-[#C4F6E8] text-[#001A12] shadow-sm"
              : "border-[rgba(18,100,76,0.2)] bg-white text-gray-700 hover:border-[#18755B]"
          }`}
        >
          <span className="font-bold leading-snug">{formatDateKey(day.dateKey)}</span>
          <span className="flex items-center justify-between gap-2 text-xs">
            <span className="text-gray-500">측정 {day.sessionCount}회</span>
            <span className="font-bold tabular-nums text-[#18755B]">평균 {day.averageScore ?? "--"}</span>
          </span>
          {!hasAverage && missingScoreBadge}
        </button>
      );
    };

    const historySessionsPerPage = 3;
    const historySessionTotalPages = selectedHistoryGroup
      ? Math.max(1, Math.ceil(selectedHistoryGroup.sessions.length / historySessionsPerPage))
      : 1;
    const currentHistorySessionPage = Math.min(historySessionPage, historySessionTotalPages - 1);
    const visibleHistorySessions = selectedHistoryGroup
      ? selectedHistoryGroup.sessions.slice(
          currentHistorySessionPage * historySessionsPerPage,
          currentHistorySessionPage * historySessionsPerPage + historySessionsPerPage
        )
      : [];
    const canGoPreviousHistoryPage = currentHistorySessionPage > 0;
    const canGoNextHistoryPage = currentHistorySessionPage < historySessionTotalPages - 1;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">기록</h1>
          <p className="mt-1 text-gray-600">자세 분석 기록을 확인하세요</p>
        </div>

        {isLoadingHistory ? (
          <div className="app-surface p-6 text-gray-600">
            기록을 불러오는 중입니다...
          </div>
        ) : historyGroups.length === 0 ? (
          <div className="app-surface border-l-4 border-l-[#18755B] p-6">
            <p className="font-bold text-gray-900">아직 기록이 없습니다</p>
            <p className="mt-1 text-sm text-gray-600">분석을 시작하면 날짜별 기록과 세션 요약이 여기에 표시됩니다.</p>
          </div>
        ) : selectedHistoryGroup ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start">
            <section className="app-surface p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-hidden">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-bold text-gray-900">날짜별 기록</h2>
                <span className="text-xs font-medium text-gray-500">{historyGroups.length}일</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 lg:hidden">
                {historyGroups.map((day) => renderDateItem(day, "mobile"))}
              </div>
              <div className="hidden gap-2 overflow-y-auto pr-1 lg:grid lg:max-h-[calc(100vh-14rem)]">
                {historyGroups.map((day) => renderDateItem(day, "desktop"))}
              </div>
            </section>

            <div className="min-w-0 space-y-4">
              <section className="app-surface p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-gray-900">{formatDateKey(selectedHistoryGroup.dateKey)}</h3>
                  <p className="text-sm text-gray-500">선택한 날짜의 자세 기록</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {renderStatCard("총 측정", `${selectedHistoryGroup.sessionCount}회`, <Activity className="h-4 w-4" />)}
                  {renderStatCard(
                    "평균",
                    selectedHistoryGroup.averageScore ?? "--",
                    <CheckCircle className="h-4 w-4" />,
                    { badge: selectedHistoryGroup.averageScore === null ? missingScoreBadge : null }
                  )}
                  {renderStatCard("사용 시간", formatMinutes(selectedHistoryGroup.totalUsageMinutes), <Clock className="h-4 w-4" />)}
                  {renderStatCard(
                    "알림",
                    `${selectedHistoryGroup.alertCount}회`,
                    <Bell className="h-4 w-4" />,
                    { tone: selectedHistoryGroup.alertCount > 0 ? "warning" : "neutral" }
                  )}
                </div>
              </section>

              <section className="app-surface p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900">데이터 관리</h2>
                    <p className="mt-1 text-sm text-gray-500">저장된 자세 분석 기록을 초기화할 수 있습니다.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsClearHistoryConfirmOpen(true)}
                    disabled={isClearingHistory}
                    className="inline-flex min-h-10 items-center justify-center gap-2 border border-red-200 px-4 py-2 text-sm font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    {isClearingHistory ? "기록 초기화 중..." : "기록 초기화"}
                  </button>
                </div>
              </section>

            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">세션 기록</h2>
                  <p className="mt-1 text-xs font-medium text-gray-500">
                    {selectedHistoryGroup.sessions.length}개 세션 · {currentHistorySessionPage + 1} / {historySessionTotalPages}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setHistorySessionPage((current) => Math.max(0, current - 1))}
                    disabled={!canGoPreviousHistoryPage}
                    className="flex h-9 w-9 items-center justify-center border border-gray-300 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="이전 세션 페이지"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistorySessionPage((current) => Math.min(historySessionTotalPages - 1, current + 1))}
                    disabled={!canGoNextHistoryPage}
                    className="flex h-9 w-9 items-center justify-center border border-gray-300 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="다음 세션 페이지"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {visibleHistorySessions.map((session) => {
                const areaScores = getHistoryAreaScores(session.postureAreaStats);
                const weakestArea = getHistoryWeakestArea(session.postureAreaStats);
                const historyReportComment = getHistoryReportComment(areaScores);
                const isImagesExpanded = expandedHistoryImageSessions.has(session.sessionId);
                const sessionAverageScore = session.averageScore;
                const hasAverage = sessionAverageScore !== null;
                const sessionDuration = formatMinutes(session.durationMinutes ?? 0);
                const sessionTitleKey = session.sessionTitleKey ?? getSessionTitleKey(session, selectedHistoryGroup.dateKey);
                const displayTitle = getHistorySessionDisplayTitle(session);
                const hasCustomTitle = Boolean(session.customTitle?.trim());
                const isEditingTitle = editingSessionTitleKey === sessionTitleKey;
                const isSavingTitle = savingSessionTitleKey === sessionTitleKey;
                const titleError = sessionTitleErrors[sessionTitleKey];

                return (
                  <article key={session.sessionId} className="app-surface p-5">
                    <div className="flex flex-col justify-between gap-3 border-b border-[rgba(18,100,76,0.16)] pb-4 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        {isEditingTitle ? (
                          <form
                            className="grid gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleSaveHistorySessionTitle(session, selectedHistoryGroup.dateKey);
                            }}
                          >
                            <input
                              value={sessionTitleDraft}
                              onChange={(event) => setSessionTitleDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  setEditingSessionTitleKey(null);
                                  setSessionTitleDraft("");
                                }
                              }}
                              maxLength={SESSION_TITLE_MAX_LENGTH}
                              autoFocus
                              className="min-h-10 w-full border border-[rgba(18,100,76,0.35)] bg-white px-3 py-2 text-base font-bold text-gray-900"
                              placeholder="제목을 입력해주세요"
                            />
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                              <span>최대 {SESSION_TITLE_MAX_LENGTH}자</span>
                              {titleError && <span className="font-bold text-red-600">{titleError}</span>}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="submit"
                                disabled={isSavingTitle}
                                className="min-h-9 border border-[#18755B] bg-[#18755B] px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60"
                              >
                                {isSavingTitle ? "저장 중..." : "저장"}
                              </button>
                              <button
                                type="button"
                                disabled={isSavingTitle}
                                onClick={() => {
                                  setEditingSessionTitleKey(null);
                                  setSessionTitleDraft("");
                                }}
                                className="min-h-9 border border-gray-300 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 disabled:opacity-60"
                              >
                                취소
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="flex min-w-0 items-start gap-2">
                              <p className={`min-w-0 truncate text-lg font-bold ${hasCustomTitle ? "text-gray-900" : "text-gray-500"}`}>
                                {displayTitle}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSessionTitleKey(sessionTitleKey);
                                  setSessionTitleDraft(session.customTitle ?? "");
                                  setSessionTitleErrors((current) => {
                                    const next = { ...current };
                                    delete next[sessionTitleKey];
                                    return next;
                                  });
                                }}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-gray-200 bg-white text-gray-600"
                                aria-label="세션 제목 수정"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {titleError && <p className="mt-1 text-xs font-bold text-red-600">{titleError}</p>}
                          </>
                        )}
                        <p className="mt-1 text-sm text-gray-500">
                          {formatTime(session.startedAt)}
                          {session.endedAt ? ` - ${formatTime(session.endedAt)}` : ""} · 사용 {sessionDuration}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 md:justify-end">
                        <div className="text-right">
                          <p className="text-xs font-bold text-gray-500">평균</p>
                          <p className="text-2xl font-bold leading-none tabular-nums text-[#18755B]">{sessionAverageScore ?? "--"}</p>
                        </div>
                        {hasAverage ? (
                          sessionAverageScore >= 80 ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-yellow-600" />
                          )
                        ) : (
                          missingScoreBadge
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2 border-b border-[rgba(18,100,76,0.16)] py-4 text-sm sm:grid-cols-4">
                      <div>
                        <span className="block text-xs font-bold text-gray-500">최고</span>
                        <strong className="tabular-nums text-gray-900">{session.bestScore ?? "--"}</strong>
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-gray-500">최저</span>
                        <strong className="tabular-nums text-gray-900">{session.worstScore ?? "--"}</strong>
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-gray-500">알림</span>
                        <strong className={session.alertCount > 0 ? "tabular-nums text-orange-700" : "tabular-nums text-gray-900"}>
                          {session.alertCount}회
                        </strong>
                      </div>
                      <div>
                        <span className="block text-xs font-bold text-gray-500">사용</span>
                        <strong className="tabular-nums text-gray-900">{sessionDuration}</strong>
                      </div>
                    </div>

                    <div className="py-4">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-bold text-gray-900">주의 부위</span>
                        {weakestArea ? (
                          <strong className="inline-flex items-center gap-1.5 text-sm tabular-nums text-[#18755B]">
                            {getPostureAreaIcon(weakestArea.area, "h-3.5 w-3.5")}
                            <span>{weakestArea.label} {weakestArea.score}</span>
                          </strong>
                        ) : (
                          missingScoreBadge
                        )}
                      </div>

                      <div className="grid gap-4 md:grid-cols-[minmax(0,230px)_minmax(0,1fr)] md:items-center">
                        <div className="grid grid-cols-2 gap-3">
                          {areaScores.map((area) => (
                            <div key={area.area} className="min-w-0">
                              <span className="mb-2 inline-flex min-w-0 items-center gap-1.5 text-sm font-bold text-gray-700">
                                <span className="inline-flex shrink-0 text-[#18755B]">
                                  {getPostureAreaIcon(area.area, "h-3.5 w-3.5")}
                                </span>
                                <span>{area.label}</span>
                              </span>
                              <div className="flex items-center gap-3">
                                <span
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-bold tabular-nums text-[#001A12]"
                                  style={getScoreIndicatorStyle(area.score)}
                                >
                                  {area.score ?? "--"}
                                </span>
                                <span className="min-w-0 text-xs font-bold text-gray-500">
                                  {area.score === null ? "측정 부족" : getStatusLabel(area.score)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-sm leading-6 text-gray-600">
                          {historyReportComment}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedHistoryImageSessions((current) => {
                          const next = new Set(current);
                          if (next.has(session.sessionId)) {
                            next.delete(session.sessionId);
                          } else {
                            next.add(session.sessionId);
                          }
                          return next;
                        })
                      }
                      className="inline-flex min-h-10 items-center justify-center gap-2 border border-[rgba(18,100,76,0.3)] bg-white px-4 py-2 text-sm font-bold text-gray-700"
                    >
                      <span>{isImagesExpanded ? "자세 이미지 닫기" : "자세 이미지 보기"}</span>
                      <ChevronRight className={`h-4 w-4 transition-transform ${isImagesExpanded ? "rotate-90" : ""}`} />
                    </button>

                    {isImagesExpanded && (
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="overflow-hidden border border-gray-200 bg-white">
                          {session.bestImageUrl ? (
                            <img src={session.bestImageUrl} alt="최고 자세" className="aspect-video w-full object-cover" />
                          ) : (
                            <div className="flex aspect-video items-center justify-center text-sm text-gray-400">
                              최고 자세 이미지 없음
                            </div>
                          )}
                          <div className="p-3 text-sm font-medium text-gray-900">최고 점수: {session.bestScore ?? "--"}</div>
                        </div>
                        <div className="overflow-hidden border border-gray-200 bg-white">
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
                    )}
                  </article>
                );
              })}
            </section>
            </div>
          </div>
        ) : (
          <div className="app-surface p-6 text-gray-600">
            기록을 불러오는 중입니다...
          </div>
        )}
      </div>
    );
  };

  const settingsStatusText =
    settingsSaveStatus === "saving"
      ? "설정 저장 중..."
      : settingsSaveStatus === "saved"
        ? "설정이 저장되었습니다."
        : settingsSaveStatus === "error"
          ? "설정 저장 실패"
          : "";
  const badPostureDurationMinutesValue = Number(badPostureDurationMinutesInput);
  const badPostureDurationError = !badPostureDurationMinutesInput.trim()
    ? "숫자를 입력해주세요"
    : !Number.isInteger(badPostureDurationMinutesValue) ||
        badPostureDurationMinutesValue < 1 ||
        badPostureDurationMinutesValue > 10
      ? "1분부터 10분까지 입력해주세요"
      : "";
  const canApplySettings = !badPostureDurationError && settingsSaveStatus !== "saving";

  const ToggleControl = ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
  }) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 border border-gray-100 bg-[rgba(196,246,232,0.26)] px-4 py-3">
      <span className="font-medium text-gray-900">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-gray-300 text-blue-600"
      />
    </label>
  );

  const renderAnalysisSettingsModal = () => {
    if (!isAnalysisSettingsOpen) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/35 px-4 py-6 sm:items-center sm:justify-center">
        <section className="flex max-h-[88vh] w-full max-w-2xl flex-col border border-[rgba(18,100,76,0.24)] bg-white">
          <div className="flex items-start justify-between gap-4 border-b border-[rgba(18,100,76,0.16)] p-5">
            <div>
              <p className="text-lg font-bold text-gray-900">분석 설정</p>
              <p className="mt-1 text-sm text-gray-600">분석 옵션과 알림 기준을 조정하세요.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAnalysisSettingsOpen(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center border border-gray-300 bg-white text-gray-700"
              aria-label="분석 설정 닫기"
            >
              X
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-5 flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={showPreviousAnalysisSettingsPanel}
                className="flex h-9 w-9 shrink-0 items-center justify-center border border-gray-300 bg-white text-gray-700"
                aria-label="이전 설정"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {currentAnalysisSettingsPanel.icon}
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-bold text-gray-900">{currentAnalysisSettingsPanel.title}</h3>
                  <p className="text-xs font-medium text-gray-500">
                    {activeAnalysisSettingsPanelIndex + 1} / {analysisSettingsPanels.length}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={showNextAnalysisSettingsPanel}
                className="flex h-9 w-9 shrink-0 items-center justify-center border border-gray-300 bg-white text-gray-700"
                aria-label="다음 설정"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {activeAnalysisSettingsPanel === "analysis-options" && (
              <div className="space-y-4">
                <ToggleControl
                  checked={settingsDraft.landmarkOverlayEnabled}
                  onChange={(checked) => updateSettingsDraft({ landmarkOverlayEnabled: checked })}
                  label="자세 랜드마크 표시 켜기/끄기"
                />
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">측면 분석 기준</span>
                  <select
                    value={settingsDraft.preferredSideMode}
                    onChange={(event) => updateSettingsDraft({ preferredSideMode: event.target.value as SideMode })}
                    className="mt-2 w-full border border-gray-300 bg-white px-3 py-2"
                  >
                    <option value="left">왼쪽 옆모습 고정</option>
                    <option value="right">오른쪽 옆모습 고정</option>
                  </select>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    선택한 방향의 귀, 어깨, 엉덩이 랜드마크만 사용해 분석합니다.
                  </p>
                </label>
              </div>
            )}

            {activeAnalysisSettingsPanel === "posture-alerts" && (
              <div className="space-y-4">
                <ToggleControl
                  checked={settingsDraft.warningAlertEnabled}
                  onChange={(checked) => updateSettingsDraft({ warningAlertEnabled: checked })}
                  label="자세 경고 알림 켜기/끄기"
                />
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">
                    {settingsDraft.warningScoreThreshold}점 이하일 때 경고
                  </span>
                  <input
                    type="range"
                    min="40"
                    max="90"
                    step="5"
                    value={settingsDraft.warningScoreThreshold}
                    onChange={(event) => updateSettingsDraft({ warningScoreThreshold: Number(event.target.value) })}
                    className="mt-3 w-full"
                  />
                </label>
                <ToggleControl
                  checked={settingsDraft.badPostureTestAlertEnabled}
                  onChange={(checked) => updateSettingsDraft({ badPostureTestAlertEnabled: checked })}
                  label="테스트 모드: 나쁜 자세가 1초 이상 지속되면 알림"
                />
                <div className="border border-gray-100 bg-[rgba(196,246,232,0.24)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Windows 알림</p>
                      <p className="mt-1 text-sm text-gray-600">
                        현재 상태:{" "}
                        {settingsDraft.notificationPermissionStatus === "granted"
                          ? "허용됨"
                          : settingsDraft.notificationPermissionStatus === "denied"
                            ? "차단됨"
                            : settingsDraft.notificationPermissionStatus === "unsupported"
                              ? "지원 안 됨"
                              : "권한 필요"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRequestNotificationPermission()}
                      disabled={
                        settingsDraft.notificationPermissionStatus === "granted" ||
                        settingsDraft.notificationPermissionStatus === "unsupported"
                      }
                      className="inline-flex min-h-10 items-center justify-center border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Windows 알림 허용
                    </button>
                  </div>
                  {settingsDraft.notificationPermissionStatus === "denied" && (
                    <p className="mt-3 text-sm leading-6 text-red-600">
                      브라우저에서 알림이 차단되어 있습니다. 주소창 왼쪽 사이트 설정에서 알림 권한을 허용해주세요.
                    </p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      나쁜 자세가 {badPostureDurationMinutesInput || "?"}분 이상 지속되면 알림
                    </span>
                    <select
                      value={badPostureDurationMinutesInput}
                      onChange={(event) => {
                        setBadPostureDurationMinutesInput(event.target.value);
                        setSettingsSaveStatus("idle");
                      }}
                      className={`mt-2 w-full border px-3 py-2 ${
                        badPostureDurationError ? "border-red-300 bg-red-50" : "border-gray-300"
                      }`}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {minutes}분
                        </option>
                      ))}
                    </select>
                    {badPostureDurationError && (
                      <p className="mt-2 text-sm font-medium text-red-600">{badPostureDurationError}</p>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">
                      실시간 자세 점수 갱신: {settingsDraft.realtimeScoreIntervalSeconds}초마다
                    </span>
                    <select
                      value={settingsDraft.realtimeScoreIntervalSeconds}
                      onChange={(event) => updateSettingsDraft({ realtimeScoreIntervalSeconds: Number(event.target.value) })}
                      className="mt-2 w-full border border-gray-300 px-3 py-2"
                    >
                      {[1, 2, 3, 4, 5].map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {seconds}초
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            )}

            {activeAnalysisSettingsPanel === "stretch-alerts" && (
              <div className="space-y-4">
                <ToggleControl
                  checked={settingsDraft.stretchReminderEnabled}
                  onChange={(checked) => updateSettingsDraft({ stretchReminderEnabled: checked })}
                  label="스트레칭 알림 켜기/끄기"
                />
                <ToggleControl
                  checked={settingsDraft.stretchReminderTestAlertEnabled}
                  onChange={(checked) => updateSettingsDraft({ stretchReminderTestAlertEnabled: checked })}
                  label="테스트 모드: 20초 이상 측정하면 Windows 스트레칭 알림"
                />
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">
                    {settingsDraft.stretchReminderIntervalMinutes}분마다 스트레칭 알림
                  </span>
                  <select
                    value={settingsDraft.stretchReminderIntervalMinutes}
                    onChange={(event) => updateSettingsDraft({ stretchReminderIntervalMinutes: Number(event.target.value) })}
                    className="mt-2 w-full border border-gray-300 px-3 py-2"
                  >
                    {[10, 20, 30, 40, 50, 60].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes}분
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-[rgba(18,100,76,0.16)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {settingsStatusText && (
                <span
                  className={`border px-3 py-1 text-xs font-medium ${
                    settingsSaveStatus === "error" ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700"
                  }`}
                >
                  {settingsStatusText}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApplySettings}
                disabled={!canApplySettings}
                className="bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                적용하기
              </button>
              <button
                type="button"
                onClick={handleResetSettings}
                className="inline-flex min-h-9 items-center justify-center gap-2 border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-700"
              >
                <RotateCcw className="h-4 w-4" />
                기본 설정으로 되돌리기
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderPendingTitlePrompt = () => {
    if (!pendingTitleSession) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/35 px-4 py-6 sm:items-center sm:justify-center">
        <section className="w-full max-w-md border border-[rgba(18,100,76,0.24)] bg-white p-5 shadow-xl">
          <div className="mb-4">
            <p className="text-lg font-bold text-gray-900">기록이 저장되었습니다</p>
            <p className="mt-1 text-sm text-gray-600">이 세션에 제목을 붙여보세요.</p>
          </div>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSavePendingSessionTitle();
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-gray-500">세션 제목</span>
              <input
                value={pendingTitleDraft}
                onChange={(event) => setPendingTitleDraft(event.target.value)}
                maxLength={SESSION_TITLE_MAX_LENGTH}
                autoFocus
                className="min-h-11 border border-[rgba(18,100,76,0.35)] px-3 py-2 text-base font-bold text-gray-900"
                placeholder="제목을 입력해주세요"
              />
              <span className="text-xs text-gray-500">최대 {SESSION_TITLE_MAX_LENGTH}자</span>
            </label>
            {pendingTitleError && <p className="text-sm font-bold text-red-600">{pendingTitleError}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={pendingTitleSaving}
                className="min-h-11 border border-[#18755B] bg-[#18755B] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {pendingTitleSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  };

  const renderClearHistoryConfirm = () => {
    if (!isClearHistoryConfirmOpen) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/35 px-4 py-6 sm:items-center sm:justify-center">
        <section className="w-full max-w-md border border-red-200 bg-white p-5 shadow-xl">
          <div className="mb-4">
            <p className="text-lg font-bold text-gray-900">기록을 정말 초기화할까요?</p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              저장된 자세 분석 기록, 세션 제목, 자세 이미지 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={isClearingHistory}
              onClick={() => setIsClearHistoryConfirmOpen(false)}
              className="min-h-11 border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-60"
            >
              취소
            </button>
            <button
              type="button"
              disabled={isClearingHistory}
              onClick={() => void handleClearHistory()}
              className="min-h-11 border border-red-600 bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {isClearingHistory ? "초기화 중..." : "초기화"}
            </button>
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="app-shell min-h-screen">
      {renderAnalysisSettingsModal()}
      {renderPendingTitlePrompt()}
      {renderClearHistoryConfirm()}
      <nav className="sticky top-0 z-50 border-b border-[#12644C]/20 bg-[#C4F6E8]">
        <div className="mx-auto max-w-[1100px] px-6">
          <div className="flex flex-col gap-1.5 py-2">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-600" />
                  <span className="text-lg font-bold text-gray-900">Posture Analyzer</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-1 py-1 text-xs font-medium ${
                    cameraTone === "good"
                      ? "text-[#18755B]"
                      : cameraTone === "danger"
                        ? "text-red-700"
                      : cameraTone === "warn"
                        ? "text-yellow-700"
                        : "text-gray-600"
                  }`}
                >
                  <span className="app-status-dot" />
                  {cameraText}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-1 py-1 text-xs font-medium ${
                    storageTone === "good"
                      ? "text-[#18755B]"
                      : storageTone === "danger"
                        ? "text-red-700"
                        : "text-yellow-700"
                  }`}
                >
                  <span className="app-status-dot" />
                  {storageText}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex max-w-full items-center gap-2 border border-gray-200 px-2 py-1 text-gray-700">
                  {authUser.photoURL ? (
                    <img
                      src={authUser.photoURL}
                      alt=""
                      className="h-7 w-7 rounded-full border border-white object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-gray-50">
                      <User className="h-4 w-4 text-gray-600" />
                    </span>
                  )}
                  <span className="max-w-[180px] truncate text-sm">{authUser.displayName ?? authUser.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex items-center gap-2 border border-transparent px-2 py-1 text-sm text-gray-700"
                >
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1100px] px-6 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-8">
        {alertMessage && (
          <section className="mb-6 border border-yellow-200 bg-yellow-50 p-5">
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
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-50 bg-white pb-[calc(0.5rem+env(safe-area-inset-bottom))]" aria-label="하단 내비게이션">
        <div className="w-full border-t border-[#12644C]/20 px-2 pt-1">
          <div className="mx-auto grid max-w-[560px] grid-cols-4">
          {[
            { id: "home" as Tab, label: "홈", icon: <House className="h-5 w-5" /> },
            { id: "analysis" as Tab, label: "자세 분석", icon: <Video className="h-5 w-5" /> },
            { id: "stretching" as Tab, label: "스트레칭 분석", icon: <Dumbbell className="h-5 w-5" /> },
            { id: "history" as Tab, label: "기록 보기", icon: <History className="h-5 w-5" /> },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 px-1 text-[10px] leading-tight sm:text-xs ${
                  isActive ? "font-bold text-[#18755B]" : "text-gray-500"
                }`}
              >
                <span className={`absolute top-0 h-0.5 w-5 ${isActive ? "bg-[#18755B]" : "bg-transparent"}`} />
                {tab.icon}
                <span className="max-w-full whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
          </div>
        </div>
      </nav>
    </div>
  );
}
