import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from "firebase/firestore";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
  type Auth,
} from "firebase/auth";
import { deleteObject, getDownloadURL, getStorage, ref, uploadString, type FirebaseStorage } from "firebase/storage";
import type {
  FirebaseConfigShape,
  FirebaseStatus,
  HistoryGroup,
  PostureAreaStat,
  PostureAreaStats,
  PostureImageAnalysis,
  PostureRecommendationArea,
  PostureScorePoint,
  RecentSummary,
  Settings,
  SerializedPoseLandmark,
  SessionSummary,
  SideMode,
} from "@/lib/types";
import { getSessionTitleKey, normalizeSessionTitle } from "@/lib/session-title";

let firebaseApp: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let authInstance: Auth | null = null;
let initializationStatus: FirebaseStatus | null = null;

type ExtremaImageKind = "best" | "worst";

function resolveConfig(): FirebaseConfigShape | null {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
  };

  const values = Object.values(config).filter(Boolean);
  const hasPlaceholder = values.some((value) => /your-|YOUR_|your_/i.test(value));

  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId || hasPlaceholder) {
    return null;
  }

  return config;
}

export function initFirebase(): FirebaseStatus {
  if (initializationStatus) {
    return initializationStatus;
  }

  const config = resolveConfig();
  if (!config) {
    initializationStatus = { enabled: false, reason: "missing-config" };
    return initializationStatus;
  }

  firebaseApp = getApps()[0] ?? initializeApp(config);
  firestoreInstance = getFirestore(firebaseApp);
  storageInstance = config.storageBucket ? getStorage(firebaseApp) : null;
  authInstance = getAuth(firebaseApp);
  initializationStatus = { enabled: Boolean(firestoreInstance && authInstance) };
  return initializationStatus;
}

function getDb() {
  const status = initFirebase();
  if (!status.enabled || !firestoreInstance) {
    return null;
  }
  return firestoreInstance;
}

function getStorageInstance() {
  initFirebase();
  return storageInstance;
}

export function getFirebaseAuth() {
  initFirebase();
  return authInstance;
}

export function subscribeToAuth(callback: (user: FirebaseUser | null) => void) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase is not configured.");
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  await upsertUserProfile(credential.user);
  return credential.user;
}

export async function signOutUser() {
  const auth = getFirebaseAuth();
  if (!auth) {
    return;
  }
  await signOut(auth);
}

export async function upsertUserProfile(user: FirebaseUser) {
  const db = getDb();
  if (!db) {
    return false;
  }

  const now = new Date().toISOString();
  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);
  await setDoc(
    userRef,
    {
      displayName: user.displayName ?? "",
      email: user.email ?? "",
      photoURL: user.photoURL ?? "",
      createdAt: existing.exists() ? existing.data().createdAt ?? now : now,
      lastLoginAt: now,
    },
    { merge: true }
  );
  return true;
}

function sessionsCollection(uid: string) {
  const db = getDb();
  return db ? collection(db, "users", uid, "sessions") : null;
}

function sessionTitlesCollection(uid: string) {
  const db = getDb();
  return db ? collection(db, "users", uid, "sessionTitles") : null;
}

function sessionDoc(uid: string, sessionId: string) {
  const db = getDb();
  return db ? doc(db, "users", uid, "sessions", sessionId) : null;
}

function sessionTitleDoc(uid: string, sessionTitleKey: string) {
  const db = getDb();
  return db ? doc(db, "users", uid, "sessionTitles", sessionTitleKey) : null;
}

const SETTINGS_DOC_ID = "app";

type FirestoreSettings = Pick<
  Settings,
  | "warningAlertEnabled"
  | "warningScoreThreshold"
  | "badPostureDurationMinutes"
  | "badPostureTestAlertEnabled"
  | "stretchReminderEnabled"
  | "stretchReminderIntervalMinutes"
  | "stretchReminderTestAlertEnabled"
  | "landmarkOverlayEnabled"
  | "smoothingEnabled"
  | "realtimeScoreIntervalSeconds"
  | "preferredSideMode"
>;

function settingsDoc(uid: string) {
  const db = getDb();
  return db ? doc(db, "users", uid, "settings", SETTINGS_DOC_ID) : null;
}

function normalizeSideMode(value: unknown, fallback: SideMode = "left"): SideMode {
  if (value === "left" || value === "right") {
    return value;
  }
  return fallback;
}

function normalizeSettings(raw: Partial<Settings>, defaults: Settings): Settings {
  return {
    ...defaults,
    warningAlertEnabled:
      typeof raw.warningAlertEnabled === "boolean" ? raw.warningAlertEnabled : defaults.warningAlertEnabled,
    warningScoreThreshold:
      typeof raw.warningScoreThreshold === "number" ? raw.warningScoreThreshold : defaults.warningScoreThreshold,
    badPostureDurationMinutes:
      typeof raw.badPostureDurationMinutes === "number"
        ? Math.min(Math.max(Math.round(raw.badPostureDurationMinutes), 1), 10)
        : defaults.badPostureDurationMinutes,
    badPostureTestAlertEnabled:
      typeof raw.badPostureTestAlertEnabled === "boolean"
        ? raw.badPostureTestAlertEnabled
        : defaults.badPostureTestAlertEnabled,
    stretchReminderEnabled:
      typeof raw.stretchReminderEnabled === "boolean"
        ? raw.stretchReminderEnabled
        : defaults.stretchReminderEnabled,
    stretchReminderIntervalMinutes:
      typeof raw.stretchReminderIntervalMinutes === "number"
        ? raw.stretchReminderIntervalMinutes
        : defaults.stretchReminderIntervalMinutes,
    stretchReminderTestAlertEnabled:
      typeof raw.stretchReminderTestAlertEnabled === "boolean"
        ? raw.stretchReminderTestAlertEnabled
        : defaults.stretchReminderTestAlertEnabled,
    landmarkOverlayEnabled:
      typeof raw.landmarkOverlayEnabled === "boolean"
        ? raw.landmarkOverlayEnabled
        : defaults.landmarkOverlayEnabled,
    smoothingEnabled: true,
    realtimeScoreIntervalSeconds:
      typeof raw.realtimeScoreIntervalSeconds === "number"
        ? Math.min(Math.max(Math.round(raw.realtimeScoreIntervalSeconds), 1), 5)
        : defaults.realtimeScoreIntervalSeconds,
    preferredSideMode: normalizeSideMode(raw.preferredSideMode, defaults.preferredSideMode),
  };
}

function toFirestoreSettings(settings: Settings): FirestoreSettings {
  return {
    warningAlertEnabled: settings.warningAlertEnabled,
    warningScoreThreshold: settings.warningScoreThreshold,
    badPostureDurationMinutes: settings.badPostureDurationMinutes,
    badPostureTestAlertEnabled: settings.badPostureTestAlertEnabled,
    stretchReminderEnabled: settings.stretchReminderEnabled,
    stretchReminderIntervalMinutes: settings.stretchReminderIntervalMinutes,
    stretchReminderTestAlertEnabled: settings.stretchReminderTestAlertEnabled,
    landmarkOverlayEnabled: settings.landmarkOverlayEnabled,
    smoothingEnabled: true,
    realtimeScoreIntervalSeconds: settings.realtimeScoreIntervalSeconds,
    preferredSideMode: settings.preferredSideMode,
  };
}

export async function getUserSettings(uid: string, defaults: Settings): Promise<Settings | null> {
  const ref = settingsDoc(uid);
  if (!ref) {
    return null;
  }

  try {
    const snapshot = await getDoc(ref);
    return snapshot.exists() ? normalizeSettings(snapshot.data() as Partial<Settings>, defaults) : null;
  } catch (error) {
    console.error("Failed to load settings:", error);
    return null;
  }
}

export async function saveUserSettings(uid: string, settings: Settings) {
  const ref = settingsDoc(uid);
  if (!ref) {
    return false;
  }

  try {
    await setDoc(ref, toFirestoreSettings(settings), { merge: true });
    return true;
  } catch (error) {
    console.error("Failed to save settings:", error);
    return false;
  }
}

export async function ensureUserSettings(uid: string, defaults: Settings): Promise<Settings | null> {
  const existing = await getUserSettings(uid, defaults);
  if (existing) {
    return existing;
  }

  const saved = await saveUserSettings(uid, defaults);
  return saved ? defaults : null;
}

export async function clearUserMeasurementHistory(uid: string) {
  const sessions = sessionsCollection(uid);
  if (!sessions) {
    return false;
  }

  try {
    const titles = sessionTitlesCollection(uid);
    const [snapshot, titleSnapshot] = await Promise.all([
      getDocs(sessions),
      titles ? getDocs(titles) : Promise.resolve(null),
    ]);
    await Promise.all(
      snapshot.docs.map(async (session) => {
        const sessionRef = doc(sessions, session.id);
        await deleteSessionExtremaImages(uid, session.id);
        await Promise.all(
          ["snapshots", "alerts", "stretchLogs", "scorePoints"].map(async (subcollection) => {
            const childSnapshot = await getDocs(collection(sessionRef, subcollection));
            await Promise.all(childSnapshot.docs.map((child) => deleteDoc(child.ref)));
          })
        );
        await deleteDoc(sessionRef);
      })
    );
    if (titleSnapshot) {
      await Promise.all(titleSnapshot.docs.map((title) => deleteDoc(title.ref)));
    }
    return true;
  } catch (error) {
    console.error("Failed to clear measurement history:", error);
    return false;
  }
}

async function deleteSessionExtremaImages(uid: string, sessionId: string) {
  const storage = getStorageInstance();
  if (!storage) {
    return;
  }

  await Promise.all(
    (["best", "worst"] as const).map(async (kind) => {
      const imagePath = `users/${uid}/sessions/${sessionId}/${kind}.jpg`;
      try {
        await deleteObject(ref(storage, imagePath));
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        if (code !== "storage/object-not-found") {
          console.error(`Failed to delete ${kind} posture image:`, error);
        }
      }
    })
  );
}

async function deleteSessionDocumentWithChildren(uid: string, sessionId: string) {
  const ref = sessionDoc(uid, sessionId);
  if (!ref) {
    return;
  }

  await deleteSessionExtremaImages(uid, sessionId);
  await Promise.all(
    ["snapshots", "alerts", "stretchLogs", "scorePoints"].map(async (subcollection) => {
      const childSnapshot = await getDocs(collection(ref, subcollection));
      await Promise.all(childSnapshot.docs.map((child) => deleteDoc(child.ref)));
    })
  );
  await deleteDoc(ref);
}

export async function deleteUserMeasurementSessions(
  uid: string,
  sessions: Array<Pick<SessionSummary, "sessionId" | "sessionTitleKey" | "startedAt"> & { dateKey: string }>
) {
  if (!sessions.length) {
    return false;
  }

  try {
    await Promise.all(
      sessions.map(async (session) => {
        const sessionTitleKey = session.sessionTitleKey ?? getSessionTitleKey(session, session.dateKey);
        const titleRef = sessionTitleDoc(uid, sessionTitleKey);
        await Promise.all([
          deleteSessionDocumentWithChildren(uid, session.sessionId),
          titleRef ? deleteDoc(titleRef) : Promise.resolve(),
        ]);
      })
    );
    return true;
  } catch (error) {
    console.error("Failed to delete measurement sessions:", error);
    return false;
  }
}

export async function saveSessionTitle(
  uid: string,
  sessionTitleKey: string,
  title: string,
  dateKey: string,
  sessionId?: string | null
) {
  const ref = sessionTitleDoc(uid, sessionTitleKey);
  if (!ref) {
    return false;
  }

  const normalizedTitle = normalizeSessionTitle(title);

  try {
    if (!normalizedTitle) {
      return false;
    }

    await setDoc(
      ref,
      {
        sessionId: sessionId ?? sessionTitleKey,
        sessionTitleKey,
        title: normalizedTitle,
        dateKey,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error("Failed to save session title:", error);
    return false;
  }
}

export async function createSession(
  uid: string,
  sessionId: string,
  startedAt: string,
  preferredSideMode: SideMode = "left"
) {
  const ref = sessionDoc(uid, sessionId);
  if (!ref) {
    return false;
  }

  try {
    await setDoc(ref, {
      startedAt,
      endedAt: null,
      averageScore: null,
      bestScore: null,
      worstScore: null,
      bestImageUrl: null,
      bestImagePath: null,
      bestImageScore: null,
      bestImageCapturedAt: null,
      bestImageAnalysis: null,
      bestImageLandmarks: null,
      worstImageUrl: null,
      worstImagePath: null,
      worstImageScore: null,
      worstImageCapturedAt: null,
      worstImageAnalysis: null,
      worstImageLandmarks: null,
      alertCount: 0,
      preferredSideMode,
      createdAt: startedAt,
    });
    return true;
  } catch (error) {
    console.error("Failed to create session:", error);
    return false;
  }
}

export async function finalizeSessionSummary(
  uid: string,
  sessionId: string,
  summary: Pick<
    SessionSummary,
    | "endedAt"
    | "averageScore"
    | "durationMinutes"
    | "alertCount"
    | "bestScore"
    | "worstScore"
    | "bestImageUrl"
    | "bestImagePath"
    | "bestImageScore"
    | "bestImageCapturedAt"
    | "bestImageAnalysis"
    | "bestImageLandmarks"
    | "worstImageUrl"
    | "worstImagePath"
    | "worstImageScore"
    | "worstImageCapturedAt"
    | "worstImageAnalysis"
    | "worstImageLandmarks"
    | "preferredSideMode"
    | "postureAreaStats"
  >
) {
  const ref = sessionDoc(uid, sessionId);
  if (!ref) {
    return false;
  }

  try {
    await updateDoc(ref, {
      endedAt: summary.endedAt,
      averageScore: summary.averageScore,
      durationMinutes: summary.durationMinutes ?? 0,
      alertCount: summary.alertCount,
      bestScore: summary.bestScore,
      worstScore: summary.worstScore,
      bestImageUrl: summary.bestImageUrl,
      bestImagePath: summary.bestImagePath ?? null,
      bestImageScore: summary.bestImageScore ?? null,
      bestImageCapturedAt: summary.bestImageCapturedAt ?? null,
      bestImageAnalysis: summary.bestImageAnalysis ?? null,
      bestImageLandmarks: summary.bestImageLandmarks ?? null,
      worstImageUrl: summary.worstImageUrl,
      worstImagePath: summary.worstImagePath ?? null,
      worstImageScore: summary.worstImageScore ?? null,
      worstImageCapturedAt: summary.worstImageCapturedAt ?? null,
      worstImageAnalysis: summary.worstImageAnalysis ?? null,
      worstImageLandmarks: summary.worstImageLandmarks ?? null,
      preferredSideMode: normalizeSideMode(summary.preferredSideMode),
      ...(summary.postureAreaStats ? { postureAreaStats: summary.postureAreaStats } : {}),
    });
    return true;
  } catch (error) {
    console.error("Failed to finalize session:", error);
    return false;
  }
}

export async function uploadSessionExtremaImage(
  uid: string,
  sessionId: string,
  kind: ExtremaImageKind,
  imageDataUrl: string
) {
  const storage = getStorageInstance();
  if (!storage) {
    return null;
  }

  const imagePath = `users/${uid}/sessions/${sessionId}/${kind}.jpg`;
  const storageRef = ref(storage, imagePath);
  await uploadString(storageRef, imageDataUrl, "data_url");
  const imageUrl = await getDownloadURL(storageRef);
  return { imageUrl, imagePath };
}

function normalizeScorePoint(raw: Partial<PostureScorePoint>, id: string, sessionId: string): PostureScorePoint | null {
  const timestamp =
    typeof raw.timestamp === "number"
      ? raw.timestamp
      : typeof raw.capturedAt === "string"
        ? new Date(raw.capturedAt).getTime()
        : NaN;
  if (!Number.isFinite(timestamp) || typeof raw.score !== "number") {
    return null;
  }

  const capturedAt =
    typeof raw.capturedAt === "string" && Number.isFinite(new Date(raw.capturedAt).getTime())
      ? raw.capturedAt
      : new Date(timestamp).toISOString();

  return {
    id,
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : sessionId,
    capturedAt,
    timestamp,
    score: Math.min(Math.max(Math.round(raw.score), 0), 100),
  };
}

export async function saveScorePoint(
  uid: string,
  sessionId: string,
  point: Omit<PostureScorePoint, "id">
) {
  const db = getDb();
  if (!db) {
    return false;
  }

  try {
    const pointId = `${point.timestamp}-${crypto.randomUUID()}`;
    await setDoc(doc(db, "users", uid, "sessions", sessionId, "scorePoints", pointId), point);
    return true;
  } catch (error) {
    console.error("Failed to save score point:", error);
    return false;
  }
}

export async function getScorePointsForSessions(uid: string, sessions: SessionSummary[]) {
  const db = getDb();
  const pointsBySession = new Map<string, PostureScorePoint[]>();
  if (!db || sessions.length === 0) {
    return pointsBySession;
  }

  await Promise.all(
    sessions.map(async (session) => {
      try {
        const snapshot = await getDocs(collection(db, "users", uid, "sessions", session.sessionId, "scorePoints"));
        const points = snapshot.docs
          .map((entry) => normalizeScorePoint(entry.data() as Partial<PostureScorePoint>, entry.id, session.sessionId))
          .filter((point): point is PostureScorePoint => Boolean(point))
          .sort((left, right) => left.timestamp - right.timestamp);
        if (points.length > 0) {
          pointsBySession.set(session.sessionId, points);
        }
      } catch (error) {
        console.error(`Failed to load score points for session ${session.sessionId}:`, error);
      }
    })
  );

  return pointsBySession;
}

export async function deleteScorePointsForNonTodaySessions(uid: string, sessions: SessionSummary[]) {
  const db = getDb();
  if (sessions.length === 0) {
    return true;
  }
  if (!db) {
    return false;
  }

  const today = getDateKey(new Date().toISOString());
  const staleSessions = sessions.filter((session) => getDateKey(session.startedAt) !== today);
  if (staleSessions.length === 0) {
    return true;
  }

  try {
    await Promise.all(
      staleSessions.map(async (session) => {
        const pointsSnapshot = await getDocs(collection(db, "users", uid, "sessions", session.sessionId, "scorePoints"));
        if (pointsSnapshot.empty) {
          return;
        }
        await Promise.all(pointsSnapshot.docs.map((point) => deleteDoc(point.ref)));
      })
    );
    return true;
  } catch (error) {
    console.error("Failed to delete old score points:", error);
    return false;
  }
}

export async function saveAlertLog(uid: string, sessionId: string, payload: Record<string, unknown>) {
  const db = getDb();
  if (!db) {
    return false;
  }

  try {
    await setDoc(doc(db, "users", uid, "sessions", sessionId, "alerts", crypto.randomUUID()), payload);
    return true;
  } catch (error) {
    console.error("Failed to save alert:", error);
    return false;
  }
}

export async function saveStretchLog(uid: string, sessionId: string, payload: Record<string, unknown>) {
  const db = getDb();
  if (!db) {
    return false;
  }

  try {
    await setDoc(doc(db, "users", uid, "sessions", sessionId, "stretchLogs", crypto.randomUUID()), payload);
    return true;
  } catch (error) {
    console.error("Failed to save stretch log:", error);
    return false;
  }
}

function getDateKey(timestamp: string) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

function normalizePostureAreaStat(raw: unknown): PostureAreaStat | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Partial<PostureAreaStat>;
  const totalCount = typeof value.totalCount === "number" ? value.totalCount : 0;
  return {
    lowCount: typeof value.lowCount === "number" ? value.lowCount : 0,
    totalCount,
    averageScore: typeof value.averageScore === "number" ? value.averageScore : null,
  };
}

function normalizePostureAreaStats(raw: unknown): PostureAreaStats | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const value = raw as Partial<Record<PostureRecommendationArea, unknown>>;
  const stats = {
    neck: normalizePostureAreaStat(value.neck),
    torso: normalizePostureAreaStat(value.torso),
    stability: normalizePostureAreaStat(value.stability),
  };

  if (!stats.neck || !stats.torso || !stats.stability) {
    return undefined;
  }

  return stats as PostureAreaStats;
}

function normalizePostureImageAnalysis(raw: unknown): PostureImageAnalysis | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const value = raw as Partial<PostureImageAnalysis>;
  if (typeof value.score !== "number") {
    return null;
  }

  const mainIssue =
    value.mainIssue === "neck" ||
    value.mainIssue === "torso" ||
    value.mainIssue === "stability" ||
    value.mainIssue === "balanced" ||
    value.mainIssue === "tracking"
      ? value.mainIssue
      : "tracking";
  const analysisSide = value.analysisSide === "left" || value.analysisSide === "right" ? value.analysisSide : null;

  return {
    score: value.score,
    neckScore: typeof value.neckScore === "number" ? value.neckScore : null,
    trunkScore: typeof value.trunkScore === "number" ? value.trunkScore : null,
    neckAngleDegrees: typeof value.neckAngleDegrees === "number" ? value.neckAngleDegrees : null,
    trunkLeanDegrees: typeof value.trunkLeanDegrees === "number" ? value.trunkLeanDegrees : null,
    neckForwardOffset: typeof value.neckForwardOffset === "number" ? value.neckForwardOffset : null,
    mainIssue,
    analysisSide,
  };
}

function normalizePoseLandmarks(raw: unknown): SerializedPoseLandmark[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  const landmarks = raw.flatMap((entry): SerializedPoseLandmark[] => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const value = entry as Partial<SerializedPoseLandmark>;
    if (typeof value.x !== "number" || typeof value.y !== "number") {
      return [];
    }

    const landmark: SerializedPoseLandmark = {
      x: value.x,
      y: value.y,
    };
    if (typeof value.z === "number") {
      landmark.z = value.z;
    }
    if (typeof value.visibility === "number") {
      landmark.visibility = value.visibility;
    }
    return [landmark];
  });

  return landmarks.length ? landmarks : null;
}

function normalizeSession(raw: Partial<SessionSummary>, sessionId: string): SessionSummary {
  const startedAt = raw.startedAt ?? raw.createdAt ?? new Date(0).toISOString();
  const endedAt = raw.endedAt ?? null;
  const durationMinutes =
    typeof raw.durationMinutes === "number"
      ? raw.durationMinutes
      : endedAt
        ? Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000))
        : 0;

  return {
    sessionId,
    startedAt,
    endedAt,
    averageScore: typeof raw.averageScore === "number" ? raw.averageScore : null,
    bestScore: typeof raw.bestScore === "number" ? raw.bestScore : null,
    worstScore: typeof raw.worstScore === "number" ? raw.worstScore : null,
    bestImageUrl: typeof raw.bestImageUrl === "string" ? raw.bestImageUrl : null,
    bestImagePath: typeof raw.bestImagePath === "string" ? raw.bestImagePath : null,
    bestImageScore: typeof raw.bestImageScore === "number" ? raw.bestImageScore : null,
    bestImageCapturedAt: typeof raw.bestImageCapturedAt === "number" ? raw.bestImageCapturedAt : null,
    bestImageAnalysis: normalizePostureImageAnalysis(raw.bestImageAnalysis),
    bestImageLandmarks: normalizePoseLandmarks(raw.bestImageLandmarks),
    worstImageUrl: typeof raw.worstImageUrl === "string" ? raw.worstImageUrl : null,
    worstImagePath: typeof raw.worstImagePath === "string" ? raw.worstImagePath : null,
    worstImageScore: typeof raw.worstImageScore === "number" ? raw.worstImageScore : null,
    worstImageCapturedAt: typeof raw.worstImageCapturedAt === "number" ? raw.worstImageCapturedAt : null,
    worstImageAnalysis: normalizePostureImageAnalysis(raw.worstImageAnalysis),
    worstImageLandmarks: normalizePoseLandmarks(raw.worstImageLandmarks),
    alertCount: typeof raw.alertCount === "number" ? raw.alertCount : 0,
    durationMinutes,
    postureAreaStats: normalizePostureAreaStats(raw.postureAreaStats),
    preferredSideMode: normalizeSideMode(raw.preferredSideMode),
    createdAt: raw.createdAt,
    customTitle: typeof raw.customTitle === "string" ? raw.customTitle : null,
    sessionTitleKey: typeof raw.sessionTitleKey === "string" ? raw.sessionTitleKey : undefined,
  };
}

async function loadSessionTitleMap(uid: string) {
  const titles = sessionTitlesCollection(uid);
  const titleMap = new Map<string, string>();
  if (!titles) {
    return titleMap;
  }

  const snapshot = await getDocs(titles);
  snapshot.docs.forEach((entry) => {
    const data = entry.data() as { title?: unknown; sessionTitleKey?: unknown };
    const title = typeof data.title === "string" ? normalizeSessionTitle(data.title) : "";
    if (!title) {
      return;
    }
    const key = typeof data.sessionTitleKey === "string" ? data.sessionTitleKey : entry.id;
    titleMap.set(key, title);
  });
  return titleMap;
}

export async function getRecent24hSummary(uid: string): Promise<RecentSummary | null> {
  const sessions = sessionsCollection(uid);
  if (!sessions) {
    return null;
  }

  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const snapshot = await getDocs(
      query(sessions, where("startedAt", ">=", since), orderBy("startedAt", "desc"), limit(120))
    );
    const items = snapshot.docs.map((entry) => normalizeSession(entry.data() as Partial<SessionSummary>, entry.id));
    const scored = items.filter(
      (session): session is SessionSummary & { averageScore: number } =>
        typeof session.averageScore === "number"
    );

    return {
      averageScore: scored.length
        ? Math.round(scored.reduce((sum, session) => sum + session.averageScore, 0) / scored.length)
        : null,
      totalUsageMinutes: items.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0),
      alertCount: items.reduce((sum, session) => sum + session.alertCount, 0),
    };
  } catch (error) {
    console.error("Failed to load 24-hour summary:", error);
    return null;
  }
}

export async function getHistoryByDate(uid: string): Promise<HistoryGroup[] | null> {
  const sessions = sessionsCollection(uid);
  if (!sessions) {
    return null;
  }

  try {
    const [snapshot, titleMap] = await Promise.all([
      getDocs(query(sessions, orderBy("startedAt", "desc"), limit(180))),
      loadSessionTitleMap(uid),
    ]);
    const items = snapshot.docs.map((entry) => normalizeSession(entry.data() as Partial<SessionSummary>, entry.id));
    const groups = new Map<string, SessionSummary[]>();

    items.forEach((session) => {
      const dateKey = getDateKey(session.startedAt);
      const sessionTitleKey = getSessionTitleKey(session, dateKey);
      const titledSession = {
        ...session,
        sessionTitleKey,
        customTitle: titleMap.get(sessionTitleKey) ?? null,
      };
      const bucket = groups.get(dateKey) ?? [];
      bucket.push(titledSession);
      groups.set(dateKey, bucket);
    });

    return [...groups.entries()]
      .map(([dateKey, sessions]) => {
        const scored = sessions.filter(
          (session): session is SessionSummary & { averageScore: number } =>
            typeof session.averageScore === "number"
        );

        return {
          dateKey,
          averageScore: scored.length
            ? Math.round(scored.reduce((sum, session) => sum + session.averageScore, 0) / scored.length)
            : null,
          totalUsageMinutes: sessions.reduce((sum, session) => sum + (session.durationMinutes ?? 0), 0),
          alertCount: sessions.reduce((sum, session) => sum + session.alertCount, 0),
          sessionCount: sessions.length,
          sessions,
        };
      })
      .sort((left, right) => right.dateKey.localeCompare(left.dateKey));
  } catch (error) {
    console.error("Failed to load grouped history:", error);
    return null;
  }
}
