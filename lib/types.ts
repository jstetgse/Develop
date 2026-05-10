export type TabId = "home" | "analysis" | "stretch" | "history" | "settings";

export type Tone = "neutral" | "good" | "warn" | "danger";

export type SideMode = "auto" | "left" | "right";

export type SelectedSide = "left" | "right";

export type NotificationPermissionStatus = "unsupported" | "default" | "granted" | "denied";

export interface Settings {
  warningAlertEnabled: boolean;
  warningScoreThreshold: number;
  badPostureDurationMinutes: number;
  stretchReminderEnabled: boolean;
  stretchReminderIntervalMinutes: number;
  landmarkOverlayEnabled: boolean;
  smoothingEnabled: boolean;
  realtimeScoreIntervalSeconds: number;
  preferredSideMode: SideMode;
  notificationPermissionStatus: NotificationPermissionStatus;
}

export interface PostureMetrics {
  neckForwardOffset: number;
  torsoTiltDegrees: number;
  stabilityAverage: number;
  neckAngleDegrees: number;
  estimatedNeckLoadKg: number;
  trunkLeanDegrees: number;
  neckScore: number;
  trunkScore: number;
  stabilityScore: number;
  selectedSide: SelectedSide;
}

export interface PostureResult {
  score: number | null;
  neckStatus: string;
  torsoStatus: string;
  stabilityStatus: string;
  feedbackMessage: string;
  isBadPosture: boolean;
  isTracking: boolean;
  mainIssue: "neck" | "torso" | "stability" | "balanced" | "tracking";
  metrics: PostureMetrics | null;
}

export interface StretchDefinition {
  id: string;
  name: string;
  targetIssue: "neck" | "torso" | "stability" | "long-sitting";
  targetBodyPart: string;
  description: string;
  shortDescription: string;
  durationSec: number;
  recommendedFor: string[];
  steps: StretchStep[];
}

export interface StretchStep {
  id: string;
  title: string;
  instruction: string;
  checkType:
    | "neck-side-pull"
    | "neck-forward-pull"
    | "neck-back-tilt"
    | "neck-circle"
    | "shoulder-roll"
    | "shoulder-cross"
    | "shoulder-overhead"
    | "shoulder-chest-open"
    | "wrist-roll"
    | "wrist-back-press"
    | "wrist-open-close"
    | "wrist-pull"
    | "back-side"
    | "back-forward-reach"
    | "back-twist"
    | "back-hip-circle"
    | "leg-forward-fold"
    | "leg-knee-pull"
    | "leg-quad-pull"
    | "leg-calf-stretch";
}

export type StretchBodyPart = "neck" | "leftArm" | "rightArm" | "torso" | "leftLeg" | "rightLeg";

export interface StretchCoachingResult {
  stretchId: string | null;
  stepIndex: number;
  isPoseValid: boolean;
  poseScore: number | null;
  matchPercentage?: number | null;
  incorrectParts?: StretchBodyPart[];
  correctionMessages?: string[];
  coachingMessage: string;
  holdSeconds?: number;
  isStepCompleted?: boolean;
}

export interface LowScoreCaptureEvent {
  id: string;
  sessionId: string;
  capturedAt: string;
  score: number;
  summaryMessage: string;
  neckAngleDegrees: number | null;
  estimatedNeckLoadKg: number | null;
  trunkLeanDegrees: number | null;
  imageStoragePath?: string | null;
  thumbnailDataUrl?: string | null;
  uploadStatus: "disabled" | "uploaded" | "failed";
}

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  averageScore: number | null;
  durationMinutes?: number;
  alertCount: number;
  detectedPostureIssues?: string[];
  recommendedStretchIds?: string[];
  preferredSideMode?: SideMode;
  bestScore: number | null;
  worstScore: number | null;
  bestImageUrl: string | null;
  worstImageUrl: string | null;
  createdAt?: string;
}

export interface PostureSnapshot {
  snapshotId: string;
  capturedAt: string;
  score: number;
  imageUrl: string;
  feedback: string;
}

export interface HistoryGroup {
  dateKey: string;
  averageScore: number | null;
  totalUsageMinutes: number;
  alertCount: number;
  sessionCount: number;
  sessions: SessionSummary[];
  captures?: LowScoreCaptureEvent[];
}

export interface RecentSummary {
  averageScore: number | null;
  totalUsageMinutes: number;
  alertCount: number;
}

export interface FirebaseStatus {
  enabled: boolean;
  reason?: string;
}

export interface FirebaseConfigShape {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
}
