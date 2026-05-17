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
import { getDownloadURL, getStorage, ref, uploadString, type FirebaseStorage } from "firebase/storage";
import type {
  FirebaseConfigShape,
  FirebaseStatus,
  HistoryGroup,
  PostureAreaStat,
  PostureAreaStats,
  PostureRecommendationArea,
  PostureSnapshot,
  RecentSummary,
  Settings,
  SessionSummary,
  SideMode,
} from "@/lib/types";

let firebaseApp: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let authInstance: Auth | null = null;
let initializationStatus: FirebaseStatus | null = null;

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

function sessionDoc(uid: string, sessionId: string) {
  const db = getDb();
  return db ? doc(db, "users", uid, "sessions", sessionId) : null;
}

const SETTINGS_DOC_ID = "app";

type FirestoreSettings = Pick<
  Settings,
  | "warningAlertEnabled"
  | "warningScoreThreshold"
  | "badPostureDurationMinutes"
  | "stretchReminderEnabled"
  | "stretchReminderIntervalMinutes"
  | "landmarkOverlayEnabled"
  | "smoothingEnabled"
  | "realtimeScoreIntervalSeconds"
  | "preferredSideMode"
>;

function settingsDoc(uid: string) {
  const db = getDb();
  return db ? doc(db, "users", uid, "settings", SETTINGS_DOC_ID) : null;
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
        ? raw.badPostureDurationMinutes
        : defaults.badPostureDurationMinutes,
    stretchReminderEnabled:
      typeof raw.stretchReminderEnabled === "boolean"
        ? raw.stretchReminderEnabled
        : defaults.stretchReminderEnabled,
    stretchReminderIntervalMinutes:
      typeof raw.stretchReminderIntervalMinutes === "number"
        ? raw.stretchReminderIntervalMinutes
        : defaults.stretchReminderIntervalMinutes,
    landmarkOverlayEnabled:
      typeof raw.landmarkOverlayEnabled === "boolean"
        ? raw.landmarkOverlayEnabled
        : defaults.landmarkOverlayEnabled,
    smoothingEnabled: typeof raw.smoothingEnabled === "boolean" ? raw.smoothingEnabled : defaults.smoothingEnabled,
    realtimeScoreIntervalSeconds:
      typeof raw.realtimeScoreIntervalSeconds === "number"
        ? Math.min(Math.max(Math.round(raw.realtimeScoreIntervalSeconds), 1), 5)
        : defaults.realtimeScoreIntervalSeconds,
    preferredSideMode:
      raw.preferredSideMode === "left" || raw.preferredSideMode === "right" || raw.preferredSideMode === "auto"
        ? raw.preferredSideMode
        : defaults.preferredSideMode,
  };
}

function toFirestoreSettings(settings: Settings): FirestoreSettings {
  return {
    warningAlertEnabled: settings.warningAlertEnabled,
    warningScoreThreshold: settings.warningScoreThreshold,
    badPostureDurationMinutes: settings.badPostureDurationMinutes,
    stretchReminderEnabled: settings.stretchReminderEnabled,
    stretchReminderIntervalMinutes: settings.stretchReminderIntervalMinutes,
    landmarkOverlayEnabled: settings.landmarkOverlayEnabled,
    smoothingEnabled: settings.smoothingEnabled,
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
    const snapshot = await getDocs(sessions);
    await Promise.all(
      snapshot.docs.map(async (session) => {
        const sessionRef = doc(sessions, session.id);
        await Promise.all(
          ["snapshots", "alerts", "stretchLogs"].map(async (subcollection) => {
            const childSnapshot = await getDocs(collection(sessionRef, subcollection));
            await Promise.all(childSnapshot.docs.map((child) => deleteDoc(child.ref)));
          })
        );
        await deleteDoc(sessionRef);
      })
    );
    return true;
  } catch (error) {
    console.error("Failed to clear measurement history:", error);
    return false;
  }
}

export async function createSession(
  uid: string,
  sessionId: string,
  startedAt: string,
  preferredSideMode: SideMode = "auto"
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
      worstImageUrl: null,
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
    | "worstImageUrl"
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
      worstImageUrl: summary.worstImageUrl,
      preferredSideMode: summary.preferredSideMode ?? "auto",
      ...(summary.postureAreaStats ? { postureAreaStats: summary.postureAreaStats } : {}),
    });
    return true;
  } catch (error) {
    console.error("Failed to finalize session:", error);
    return false;
  }
}

export async function uploadSnapshotImage(
  uid: string,
  sessionId: string,
  timestamp: number,
  imageDataUrl: string
) {
  const storage = getStorageInstance();
  if (!storage) {
    return null;
  }

  const path = `users/${uid}/sessions/${sessionId}/snapshots/${timestamp}.jpg`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, imageDataUrl, "data_url");
  return getDownloadURL(storageRef);
}

export async function saveSnapshot(uid: string, sessionId: string, snapshot: Omit<PostureSnapshot, "snapshotId">) {
  const db = getDb();
  if (!db) {
    return false;
  }

  try {
    const snapshotId = crypto.randomUUID();
    await setDoc(doc(db, "users", uid, "sessions", sessionId, "snapshots", snapshotId), snapshot);
    return true;
  } catch (error) {
    console.error("Failed to save snapshot:", error);
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
    worstImageUrl: typeof raw.worstImageUrl === "string" ? raw.worstImageUrl : null,
    alertCount: typeof raw.alertCount === "number" ? raw.alertCount : 0,
    durationMinutes,
    postureAreaStats: normalizePostureAreaStats(raw.postureAreaStats),
    preferredSideMode: raw.preferredSideMode ?? "auto",
    createdAt: raw.createdAt,
  };
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
    const snapshot = await getDocs(query(sessions, orderBy("startedAt", "desc"), limit(180)));
    const items = snapshot.docs.map((entry) => normalizeSession(entry.data() as Partial<SessionSummary>, entry.id));
    const groups = new Map<string, SessionSummary[]>();

    items.forEach((session) => {
      const dateKey = getDateKey(session.startedAt);
      const bucket = groups.get(dateKey) ?? [];
      bucket.push(session);
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
