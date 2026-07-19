import type { ReactNode } from "react";
import { Activity, AlertTriangle, Bell, CheckCircle, ChevronLeft, ChevronRight, Clock, Pencil, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryGroup, SessionSummary } from "@/lib/types";
import { SESSION_TITLE_MAX_LENGTH, getSessionTitleKey } from "@/lib/session-title";
import { formatMinutes, getStatusLabel } from "@/components/posture-coach/display-utils";
import { createSessionTrendSummary, formatDateKey, formatHistoryMonthLabel, formatTime, getCalendarDays, getHistoryAreaScores, getHistoryAverageReferenceTone, getHistoryCalendarToneClass, getHistoryReportComment, getHistorySessionDisplayTitle, getHistoryWeakestArea, getKoreaDateKey, getMonthKey, getScoreIndicatorStyle, shiftMonthKey } from "@/components/posture-coach/history-utils";
import { getPostureAreaIcon } from "@/components/posture-coach/posture-icons";

type HistoryViewProps = {
  historyGroups: HistoryGroup[];
  isLoadingHistory: boolean;
  selectedHistoryGroup: HistoryGroup | null;
  selectedHistorySessionKey: string | null;
  historySessionPage: number;
  visibleHistoryMonthKey: string;
  editingSessionTitleKey: string | null;
  sessionTitleDraft: string;
  savingSessionTitleKey: string | null;
  sessionTitleErrors: Record<string, string>;
  expandedHistoryImageSessions: Set<string>;
  onSelectSession: (sessionTitleKey: string, index: number, pageSize: number) => void;
  onOpenDelete: () => void;
  onShiftMonth: (offset: number) => void;
  onSelectDate: (dateKey: string) => void;
  onCloseSession: () => void;
  onChangePage: (offset: number) => void;
  onTitleDraftChange: (value: string) => void;
  onCancelTitleEdit: () => void;
  onBeginTitleEdit: (sessionTitleKey: string, title: string) => void;
  onToggleImages: (sessionId: string) => void;
  onSaveTitle: (session: SessionSummary, dateKey: string) => void;
};

function appendImageVersion(imageUrl: string, version: number | string | null | undefined) {
  if (version === null || version === undefined || version === "") {
    return imageUrl;
  }

  try {
    const url = new URL(imageUrl);
    url.searchParams.set("v", String(version));
    return url.toString();
  } catch {
    return imageUrl;
  }
}

export function HistoryView(props: HistoryViewProps) {
  const { historyGroups, isLoadingHistory, selectedHistoryGroup, selectedHistorySessionKey, historySessionPage, visibleHistoryMonthKey, editingSessionTitleKey, sessionTitleDraft, savingSessionTitleKey, sessionTitleErrors, expandedHistoryImageSessions, onSelectSession, onOpenDelete, onShiftMonth, onSelectDate, onCloseSession, onChangePage, onTitleDraftChange, onCancelTitleEdit, onBeginTitleEdit, onToggleImages, onSaveTitle } = props;
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

    const historyGroupByDate = new Map(historyGroups.map((group) => [group.dateKey, group]));
    const calendarDays = getCalendarDays(visibleHistoryMonthKey);
    const todayDateKey = getKoreaDateKey();
    const currentHistoryMonthKey = getMonthKey(todayDateKey);
    const canGoNextHistoryMonth = visibleHistoryMonthKey < currentHistoryMonthKey;

    const historySessionsPerPage = 3;
    const selectedHistorySessions = selectedHistoryGroup
      ? [...selectedHistoryGroup.sessions].sort((left, right) => {
          const rightTime = new Date(right.startedAt).getTime();
          const leftTime = new Date(left.startedAt).getTime();
          return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
        })
      : [];
    const renderSelectedHistorySessionItem = (session: SessionSummary, index: number) => {
      if (!selectedHistoryGroup) {
        return null;
      }

      const sessionTitleKey = session.sessionTitleKey ?? getSessionTitleKey(session, selectedHistoryGroup.dateKey);
      const isSelected = selectedHistorySessionKey === sessionTitleKey;
      const sessionDuration = formatMinutes(session.durationMinutes ?? 0);
      const averageText = session.averageScore === null ? "측정 부족" : `평균 ${session.averageScore}`;

      return (
        <button
          key={sessionTitleKey}
          type="button"
          onClick={() => onSelectSession(sessionTitleKey, index, historySessionsPerPage)}
          className={`w-full border px-3 py-2.5 text-left transition-colors ${
            isSelected
              ? "border-[#18755B] bg-[#C4F6E8] text-[#001A12]"
              : "border-[rgba(18,100,76,0.18)] bg-white text-gray-700 hover:border-[#18755B]"
          }`}
        >
          <span className="block truncate text-sm font-bold">{getHistorySessionDisplayTitle(session)}</span>
          <span className="mt-1 block truncate text-xs text-gray-500">
            {formatTime(session.startedAt)}
            {session.endedAt ? ` - ${formatTime(session.endedAt)}` : ""} · 사용 {sessionDuration}
          </span>
          <span className={`mt-1 block text-xs font-bold ${session.averageScore === null ? "text-gray-500" : "text-[#18755B]"}`}>
            {averageText}
          </span>
        </button>
      );
    };
    const historySessionTotalPages = selectedHistoryGroup
      ? Math.max(1, Math.ceil(selectedHistorySessions.length / historySessionsPerPage))
      : 1;
    const currentHistorySessionPage = Math.min(historySessionPage, historySessionTotalPages - 1);
    const focusedHistorySession = selectedHistorySessionKey
      ? selectedHistorySessions.find((session) => {
          const sessionTitleKey = session.sessionTitleKey ?? getSessionTitleKey(session, selectedHistoryGroup?.dateKey ?? "");
          return sessionTitleKey === selectedHistorySessionKey;
        }) ?? null
      : null;
    const visibleHistorySessions = focusedHistorySession ? [focusedHistorySession] : [];
    const canGoPreviousHistoryPage = !focusedHistorySession && currentHistorySessionPage > 0;
    const canGoNextHistoryPage = !focusedHistorySession && currentHistorySessionPage < historySessionTotalPages - 1;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">기록</h1>
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
            <section className="app-surface p-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">기록 달력</h2>
                  <p className="mt-1 text-xs font-medium text-gray-500">{historyGroups.length}일 기록</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onOpenDelete}
                    disabled={selectedHistorySessions.length === 0}
                    className="flex h-8 items-center justify-center gap-1.5 border border-red-200 bg-white px-2.5 text-xs font-bold text-red-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-300"
                    aria-label="기록 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>기록 삭제</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onShiftMonth(-1)}
                    className="flex h-8 w-8 items-center justify-center border border-[rgba(18,100,76,0.2)] bg-white text-[#18755B]"
                    aria-label="이전 달"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onShiftMonth(1)}
                    disabled={!canGoNextHistoryMonth}
                    className={`flex h-8 w-8 items-center justify-center border border-[rgba(18,100,76,0.2)] ${
                      canGoNextHistoryMonth
                        ? "bg-white text-[#18755B]"
                        : "cursor-not-allowed bg-gray-100 text-gray-300"
                    }`}
                    aria-label="다음 달"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mb-3 text-center text-sm font-bold text-gray-900">
                {formatHistoryMonthLabel(visibleHistoryMonthKey)}
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-gray-500">
                {["일", "월", "화", "수", "목", "금", "토"].map((dayName) => (
                  <span key={dayName} className="py-1">
                    {dayName}
                  </span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {calendarDays.map((dateKey, index) => {
                  const dayGroup = dateKey ? historyGroupByDate.get(dateKey) : null;
                  const isSelected = Boolean(dateKey && selectedHistoryGroup?.dateKey === dateKey);
                  const isToday = dateKey === todayDateKey;
                  const dayNumber = dateKey ? Number(dateKey.slice(-2)) : null;
                  const calendarTone = dayGroup ? getHistoryCalendarToneClass(dayGroup.averageScore) : null;

                  if (!dateKey) {
                    return <span key={`empty-${index}`} className="aspect-square" />;
                  }

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      disabled={!dayGroup}
                      onClick={() => dayGroup && onSelectDate(dateKey)}
                      className={`relative flex aspect-square min-h-9 items-center justify-center border text-sm font-bold transition-colors ${
                        isSelected
                          ? isToday
                            ? "border-[#003D2B] bg-[#003D2B] text-white ring-2 ring-[#001A12]"
                            : `${calendarTone?.border ?? "border-[#18755B]"} ${calendarTone?.bg ?? "bg-[#E7FFF7]"} ${
                                calendarTone?.text ?? "text-[#12644C]"
                              } ring-2 ${calendarTone?.ring ?? "ring-[#39AF8E]"}`
                          : isToday
                            ? "border-[#003D2B] bg-[#003D2B] text-white ring-2 ring-[#001A12]"
                            : dayGroup
                            ? `${calendarTone?.border} ${calendarTone?.bg} ${calendarTone?.text} hover:border-[#18755B]`
                            : "border-transparent bg-transparent text-gray-300"
                      }`}
                    >
                      {dayNumber}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 border-t border-[rgba(18,100,76,0.14)] pb-2 pt-4 lg:pr-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-gray-900">선택한 날짜의 세션</h3>
                  <span className="text-xs font-medium text-gray-500">{selectedHistorySessions.length}개</span>
                </div>
                {selectedHistorySessions.length > 0 ? (
                  <div className="grid gap-2">
                    {selectedHistorySessions.map(renderSelectedHistorySessionItem)}
                  </div>
                ) : (
                  <p className="border border-dashed border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
                    선택한 날짜의 세션이 없습니다.
                  </p>
                )}
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

            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">세션 기록</h2>
                  <p className="mt-1 text-xs font-medium text-gray-500">
                    {focusedHistorySession
                      ? "선택한 세션 보기"
                      : "왼쪽에서 세션을 선택하면 상세가 표시됩니다"}
                  </p>
                </div>
                {focusedHistorySession && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onCloseSession}
                      className="min-h-9 border border-[rgba(18,100,76,0.24)] bg-white px-3 py-1.5 text-sm font-bold text-[#18755B]"
                    >
                      닫기
                    </button>
                  <button
                    type="button"
                    onClick={() => onChangePage(-1)}
                    disabled={!canGoPreviousHistoryPage}
                    className="flex h-9 w-9 items-center justify-center border border-gray-300 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="이전 세션 페이지"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangePage(1)}
                    disabled={!canGoNextHistoryPage}
                    className="flex h-9 w-9 items-center justify-center border border-gray-300 bg-white text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="다음 세션 페이지"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                )}
              </div>

              {!focusedHistorySession && (
                <div className="app-surface border border-dashed border-[rgba(18,100,76,0.24)] bg-white p-6 text-sm font-bold text-gray-500">
                  선택한 날짜의 세션을 왼쪽 목록에서 선택해주세요.
                </div>
              )}

              {visibleHistorySessions.map((session) => {
                const areaScores = getHistoryAreaScores(session.postureAreaStats);
                const weakestArea = getHistoryWeakestArea(session.postureAreaStats);
                const historyReportComment = getHistoryReportComment(areaScores);
                const isImagesExpanded = expandedHistoryImageSessions.has(session.sessionId);
                const sessionAverageScore = session.averageScore;
                const hasAverage = sessionAverageScore !== null;
                const sessionDuration = formatMinutes(session.durationMinutes ?? 0);
                const sessionTitleKey = session.sessionTitleKey ?? getSessionTitleKey(session, selectedHistoryGroup.dateKey);
                const sessionTrendSummary = createSessionTrendSummary(historyGroups, selectedHistoryGroup.dateKey);
                const selectedAverageReferenceTone =
                  typeof sessionTrendSummary.selectedAverageScore === "number"
                    ? getHistoryAverageReferenceTone(sessionTrendSummary.selectedAverageScore)
                    : null;
                const canShowSessionTrendChart =
                  sessionTrendSummary.points.length >= 2 ||
                  typeof sessionTrendSummary.selectedAverageScore === "number";
                const displayTitle = getHistorySessionDisplayTitle(session);
                const hasCustomTitle = Boolean(session.customTitle?.trim());
                const isEditingTitle = editingSessionTitleKey === sessionTitleKey;
                const isSavingTitle = savingSessionTitleKey === sessionTitleKey;
                const titleError = sessionTitleErrors[sessionTitleKey];
                const isSelectedHistorySession = selectedHistorySessionKey === sessionTitleKey;

                return (
                  <article
                    key={session.sessionId}
                    className={`app-surface p-5 transition-colors ${
                      isSelectedHistorySession ? "border-[#18755B] bg-[#F0FBF7]" : ""
                    }`}
                  >
                    <div className="flex flex-col justify-between gap-3 border-b border-[rgba(18,100,76,0.16)] pb-4 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        {isEditingTitle ? (
                          <form
                            className="grid gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void onSaveTitle(session, selectedHistoryGroup.dateKey);
                            }}
                          >
                            <input
                              value={sessionTitleDraft}
                              onChange={(event) => onTitleDraftChange(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  onCancelTitleEdit();
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
                                  onCancelTitleEdit();
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
                                onClick={() => onBeginTitleEdit(sessionTitleKey, session.customTitle ?? "")}
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
                        <div className="min-w-0">
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-bold text-gray-900">최근 5개 기록일 점수</h4>
                              <p className="mt-0.5 text-xs font-medium text-gray-500">기록일 평균과 선택 날짜 평균 비교</p>
                            </div>
                            {sessionTrendSummary.currentPoint && (
                              <span className="shrink-0 text-xs font-bold tabular-nums text-[#18755B]">
                                현재 {sessionTrendSummary.currentPoint.score}
                              </span>
                            )}
                          </div>
                          {canShowSessionTrendChart ? (
                            <div className="h-[132px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={sessionTrendSummary.points} margin={{ top: 12, right: 16, bottom: 0, left: 4 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} tickLine={false} axisLine={false} />
                                  <YAxis
                                    domain={sessionTrendSummary.yDomain}
                                    ticks={sessionTrendSummary.yTicks}
                                    allowDecimals={false}
                                    tickMargin={6}
                                    stroke="#9ca3af"
                                    fontSize={10}
                                    tickLine={false}
                                    axisLine={false}
                                    width={44}
                                  />
                                  <Tooltip />
                                  {typeof sessionTrendSummary.selectedAverageScore === "number" && (
                                    <ReferenceLine
                                      y={sessionTrendSummary.selectedAverageScore}
                                      stroke={selectedAverageReferenceTone?.stroke}
                                      strokeWidth={3}
                                      strokeDasharray="5 4"
                                      ifOverflow="extendDomain"
                                      label={{
                                        value: `해당 세션 ${sessionTrendSummary.selectedAverageScore}점`,
                                        position: "insideTopRight",
                                        fill: selectedAverageReferenceTone?.label,
                                        fontSize: 10,
                                        fontWeight: 700,
                                      }}
                                    />
                                  )}
                                  <Line type="linear" dataKey="score" stroke="#18755B" strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                                  {sessionTrendSummary.currentPoint && (
                                    <ReferenceDot
                                      x={sessionTrendSummary.currentPoint.time}
                                      y={sessionTrendSummary.currentPoint.score}
                                      r={5}
                                      fill="#001A12"
                                      stroke="#C4F6E8"
                                      strokeWidth={2}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="flex h-[132px] items-center justify-center border border-dashed border-gray-200 bg-white px-4 text-center text-xs font-bold text-gray-500">
                              최근 점수 흐름을 보려면 기록이 조금 더 필요해요.
                            </div>
                          )}
                          <div className="mt-2 space-y-1 text-xs leading-5 text-gray-500">
                            <p className="truncate font-bold text-gray-700">{sessionTrendSummary.caption}</p>
                            <p className="truncate">{historyReportComment}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleImages(session.sessionId)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 border border-[rgba(18,100,76,0.3)] bg-white px-4 py-2 text-sm font-bold text-gray-700"
                    >
                      <span>{isImagesExpanded ? "자세 이미지 닫기" : "자세 이미지 보기"}</span>
                      <ChevronRight className={`h-4 w-4 transition-transform ${isImagesExpanded ? "rotate-90" : ""}`} />
                    </button>

                    {isImagesExpanded && (
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="overflow-hidden border border-gray-200 bg-white">
                          {session.bestImageUrl ? (
                            <img
                              src={appendImageVersion(session.bestImageUrl, session.bestImageCapturedAt ?? session.bestImageScore)}
                              alt="최고 자세"
                              className="aspect-video w-full object-cover"
                            />
                          ) : (
                            <div className="flex aspect-video items-center justify-center text-sm text-gray-400">
                              최고 자세 이미지 없음
                            </div>
                          )}
                          <div className="p-3 text-sm font-medium text-gray-900">최고 점수: {session.bestScore ?? "--"}</div>
                        </div>
                        <div className="overflow-hidden border border-gray-200 bg-white">
                          {session.worstImageUrl ? (
                            <img
                              src={appendImageVersion(session.worstImageUrl, session.worstImageCapturedAt ?? session.worstImageScore)}
                              alt="최저 자세"
                              className="aspect-video w-full object-cover"
                            />
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


