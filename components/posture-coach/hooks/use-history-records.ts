import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteUserMeasurementSessions, getHistoryByDate, getRecent24hSummary, saveSessionTitle } from "@/lib/repositories/history-repository";
import { deleteScorePointsForNonTodaySessions as cleanupScorePoints, getScorePointsForSessions as loadScorePoints } from "@/lib/repositories/posture-session-repository";
import type { HistoryGroup, RecentSummary, SessionSummary } from "@/lib/types";
import { getSessionTitleKey, normalizeSessionTitle } from "@/lib/session-title";
import { createTodaySavedScorePoints, getKoreaDateKey, getMonthKey, shiftMonthKey, type ScorePoint } from "@/components/posture-coach/history-utils";

export type PendingTitleSession = { sessionId: string; sessionTitleKey: string; dateKey: string; startedAt: string };
type DeleteScope = "sessions" | "date";
type DeleteStep = "scope" | "session-select" | "confirm";

export function useHistoryRecords(uid: string | null, onClearLiveScores: () => void) {
  const uidRef = useRef(uid);
  const cleanupUidRef = useRef<string | null>(null);
  const [recentSummary, setRecentSummary] = useState<RecentSummary | null>(null);
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [todaySavedScorePoints, setTodaySavedScorePoints] = useState<ScorePoint[]>([]);
  const [selectedHistoryDateKey, setSelectedHistoryDateKey] = useState<string | null>(null);
  const [visibleHistoryMonthKey, setVisibleHistoryMonthKey] = useState(() => getMonthKey(getKoreaDateKey()));
  const [historySessionPage, setHistorySessionPage] = useState(0);
  const [selectedHistorySessionKey, setSelectedHistorySessionKey] = useState<string | null>(null);
  const [expandedHistoryImageSessions, setExpandedHistoryImageSessions] = useState<Set<string>>(() => new Set());
  const [editingSessionTitleKey, setEditingSessionTitleKey] = useState<string | null>(null);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [savingSessionTitleKey, setSavingSessionTitleKey] = useState<string | null>(null);
  const [sessionTitleErrors, setSessionTitleErrors] = useState<Record<string, string>>({});
  const [pendingTitleSession, setPendingTitleSession] = useState<PendingTitleSession | null>(null);
  const [pendingTitleDraft, setPendingTitleDraft] = useState("");
  const [pendingTitleSaving, setPendingTitleSaving] = useState(false);
  const [pendingTitleError, setPendingTitleError] = useState<string | null>(null);
  const [isHistoryDeleteModalOpen, setIsHistoryDeleteModalOpen] = useState(false);
  const [historyDeleteScope, setHistoryDeleteScope] = useState<DeleteScope | null>(null);
  const [historyDeleteStep, setHistoryDeleteStep] = useState<DeleteStep>("scope");
  const [historyDeleteSessionKeys, setHistoryDeleteSessionKeys] = useState<string[]>([]);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [historyDeleteError, setHistoryDeleteError] = useState<string | null>(null);

  useEffect(() => { uidRef.current = uid; }, [uid]);

  const refreshHistory = useCallback(async (targetUid: string | null = uidRef.current) => {
    if (!targetUid) {
      setRecentSummary(null); setHistoryGroups([]); setTodaySavedScorePoints([]); onClearLiveScores(); cleanupUidRef.current = null; return;
    }
    setIsLoadingHistory(true);
    try {
      const [summary, history] = await Promise.all([getRecent24hSummary(targetUid), getHistoryByDate(targetUid)]);
      const items = history ?? [];
      const loadedSessions = items.flatMap((group) => group.sessions);
      const todaySessions = items.find((group) => group.dateKey === getKoreaDateKey())?.sessions ?? [];
      const scorePoints = await loadScorePoints(targetUid, todaySessions);
      setRecentSummary(summary); setHistoryGroups(items); setTodaySavedScorePoints(createTodaySavedScorePoints(items, scorePoints));
      if (cleanupUidRef.current !== targetUid) { cleanupUidRef.current = targetUid; void cleanupScorePoints(targetUid, loadedSessions); }
    } finally { setIsLoadingHistory(false); }
  }, [onClearLiveScores]);

  const updateLocalTitle = useCallback((key: string, title: string | null) => {
    setHistoryGroups((groups) => groups.map((group) => ({ ...group, sessions: group.sessions.map((session) => (session.sessionTitleKey ?? getSessionTitleKey(session, group.dateKey)) === key ? { ...session, sessionTitleKey: key, customTitle: title } : session) })));
  }, []);

  const saveHistoryTitle = useCallback(async (session: SessionSummary, dateKey: string) => {
    const currentUid = uidRef.current;
    const key = session.sessionTitleKey ?? getSessionTitleKey(session, dateKey);
    const title = normalizeSessionTitle(sessionTitleDraft);
    if (!currentUid || savingSessionTitleKey) return;
    if (!title) { setSessionTitleErrors((current) => ({ ...current, [key]: "제목을 입력해주세요." })); return; }
    setSavingSessionTitleKey(key); setSessionTitleErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    const saved = await saveSessionTitle(currentUid, key, title, dateKey, session.sessionId); setSavingSessionTitleKey(null);
    if (!saved) { setSessionTitleErrors((current) => ({ ...current, [key]: "제목을 저장하지 못했습니다." })); return; }
    updateLocalTitle(key, title); setEditingSessionTitleKey(null); setSessionTitleDraft("");
  }, [savingSessionTitleKey, sessionTitleDraft, updateLocalTitle]);

  const savePendingTitle = useCallback(async () => {
    const currentUid = uidRef.current;
    if (!currentUid || !pendingTitleSession || pendingTitleSaving) return;
    const title = normalizeSessionTitle(pendingTitleDraft);
    if (!title) { setPendingTitleError("제목을 입력해주세요."); return; }
    setPendingTitleSaving(true); setPendingTitleError(null);
    const saved = await saveSessionTitle(currentUid, pendingTitleSession.sessionTitleKey, title, pendingTitleSession.dateKey, pendingTitleSession.sessionId);
    setPendingTitleSaving(false);
    if (!saved) { setPendingTitleError("제목을 저장하지 못했습니다."); return; }
    updateLocalTitle(pendingTitleSession.sessionTitleKey, title); setPendingTitleSession(null); setPendingTitleDraft(""); setPendingTitleError(null);
  }, [pendingTitleDraft, pendingTitleSaving, pendingTitleSession, updateLocalTitle]);

  const openPendingTitle = useCallback((session: PendingTitleSession) => { setPendingTitleSession(session); setPendingTitleDraft(""); setPendingTitleError(null); }, []);
  const openDelete = useCallback(() => { setHistoryDeleteScope(null); setHistoryDeleteStep("scope"); setHistoryDeleteSessionKeys([]); setHistoryDeleteError(null); setIsHistoryDeleteModalOpen(true); }, []);
  const openDeleteForSession = useCallback((sessionTitleKey: string) => {
    if (isDeletingHistory) return;
    setHistoryDeleteScope("sessions");
    setHistoryDeleteStep("confirm");
    setHistoryDeleteSessionKeys([sessionTitleKey]);
    setHistoryDeleteError(null);
    setIsHistoryDeleteModalOpen(true);
  }, [isDeletingHistory]);
  const closeDelete = useCallback(() => { if (isDeletingHistory) return; setIsHistoryDeleteModalOpen(false); setHistoryDeleteScope(null); setHistoryDeleteStep("scope"); setHistoryDeleteSessionKeys([]); setHistoryDeleteError(null); }, [isDeletingHistory]);
  const selectedHistoryGroup = useMemo(() => historyGroups.find((group) => group.dateKey === selectedHistoryDateKey) ?? historyGroups[0] ?? null, [historyGroups, selectedHistoryDateKey]);

  const deleteRecords = useCallback(async () => {
    const currentUid = uidRef.current;
    if (!currentUid || isDeletingHistory || !selectedHistoryGroup || !historyDeleteScope) return;
    const selected = new Set(historyDeleteSessionKeys);
    const sessions = historyDeleteScope === "sessions" ? selectedHistoryGroup.sessions.filter((session) => selected.has(session.sessionTitleKey ?? getSessionTitleKey(session, selectedHistoryGroup.dateKey))) : selectedHistoryGroup.sessions;
    if (!sessions.length) { setHistoryDeleteError("삭제할 기록을 찾지 못했습니다."); return; }
    setIsDeletingHistory(true); setHistoryDeleteError(null);
    try {
      const deleted = await deleteUserMeasurementSessions(currentUid, sessions.map((session) => ({ sessionId: session.sessionId, sessionTitleKey: session.sessionTitleKey, startedAt: session.startedAt, dateKey: selectedHistoryGroup.dateKey })));
      if (!deleted) { setHistoryDeleteError("기록을 삭제하지 못했습니다."); return; }
      setIsHistoryDeleteModalOpen(false); setHistoryDeleteScope(null); setHistoryDeleteStep("scope"); setHistoryDeleteSessionKeys([]); setSelectedHistorySessionKey(null); setHistorySessionPage(0); setExpandedHistoryImageSessions(new Set()); setEditingSessionTitleKey(null); setSessionTitleDraft(""); setSavingSessionTitleKey(null); setSessionTitleErrors({}); await refreshHistory(currentUid);
    } finally { setIsDeletingHistory(false); }
  }, [historyDeleteScope, historyDeleteSessionKeys, isDeletingHistory, refreshHistory, selectedHistoryGroup]);

  useEffect(() => { if (!historyGroups.length) { if (selectedHistoryDateKey !== null) setSelectedHistoryDateKey(null); return; } if (!selectedHistoryDateKey || !historyGroups.some((group) => group.dateKey === selectedHistoryDateKey)) setSelectedHistoryDateKey(historyGroups[0].dateKey); }, [historyGroups, selectedHistoryDateKey]);
  useEffect(() => { setHistorySessionPage(0); setSelectedHistorySessionKey(null); }, [selectedHistoryDateKey]);
  useEffect(() => { if (selectedHistoryDateKey) setVisibleHistoryMonthKey(getMonthKey(selectedHistoryDateKey)); else if (historyGroups[0]) setVisibleHistoryMonthKey(getMonthKey(historyGroups[0].dateKey)); }, [historyGroups, selectedHistoryDateKey]);

  return {
    recentSummary, historyGroups, isLoadingHistory, todaySavedScorePoints, selectedHistoryGroup,
    selectedHistoryDateKey, visibleHistoryMonthKey, historySessionPage, selectedHistorySessionKey,
    expandedHistoryImageSessions, editingSessionTitleKey, sessionTitleDraft, savingSessionTitleKey,
    sessionTitleErrors, pendingTitleSession, pendingTitleDraft, pendingTitleSaving, pendingTitleError,
    isHistoryDeleteModalOpen, historyDeleteScope, historyDeleteStep, historyDeleteSessionKeys,
    isDeletingHistory, historyDeleteError, refreshHistory, openPendingTitle, saveHistoryTitle,
    savePendingTitle, openDelete, openDeleteForSession, closeDelete, deleteRecords, setSelectedHistoryDateKey,
    setVisibleHistoryMonthKey, setHistorySessionPage, setSelectedHistorySessionKey,
    setExpandedHistoryImageSessions, setEditingSessionTitleKey, setSessionTitleDraft,
    setSessionTitleErrors, setPendingTitleDraft, setHistoryDeleteScope, setHistoryDeleteStep,
    setHistoryDeleteSessionKeys, setHistoryDeleteError,
  };
}
