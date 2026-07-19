import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Bell, ChevronLeft, ChevronRight, Clock, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { HistoryGroup, Settings, SideMode } from "@/lib/types";
import { SESSION_TITLE_MAX_LENGTH, getSessionTitleKey } from "@/lib/session-title";
import { formatMinutes } from "@/components/posture-coach/display-utils";
import { formatTime, getHistorySessionDisplayTitle } from "@/components/posture-coach/history-utils";
import { getStretchVoiceLabel } from "@/components/posture-coach/stretch-utils";

type AnalysisSettingsPanel = "analysis-options" | "posture-alerts" | "stretch-alerts";
type SettingsSaveStatus = "idle" | "saving" | "saved" | "error";
type HistoryDeleteScope = "sessions" | "date";
type HistoryDeleteStep = "scope" | "session-select" | "confirm";
type StretchSettingsDraft = { beepEnabled: boolean; ttsEnabled: boolean; ttsVoiceUri: string };
type PendingTitleSession = { sessionId: string; sessionTitleKey: string; dateKey: string; startedAt: string };

type PostureCoachDialogsProps = {
  activeAnalysisSettingsPanel: AnalysisSettingsPanel;
  badPostureDurationMinutesInput: string;
  historyDeleteError: string | null;
  historyDeleteScope: HistoryDeleteScope | null;
  historyDeleteSessionKeys: string[];
  historyDeleteStep: HistoryDeleteStep;
  isAnalysisSettingsOpen: boolean;
  isDeletingHistory: boolean;
  isHistoryDeleteModalOpen: boolean;
  isStretchBeepSupported: boolean;
  isStretchCompleteModalOpen: boolean;
  isStretchSettingsOpen: boolean;
  isStretchTtsSupported: boolean;
  pendingTitleDraft: string;
  pendingTitleError: string | null;
  pendingTitleSaving: boolean;
  pendingTitleSession: PendingTitleSession | null;
  selectedHistoryGroup: HistoryGroup | null;
  selectedHistorySessionKey: string | null;
  settingsDraft: Settings;
  settingsSaveStatus: SettingsSaveStatus;
  stretchSettingsDraft: StretchSettingsDraft;
  stretchSettingsSaveStatus: SettingsSaveStatus;
  stretchTtsVoiceOptions: SpeechSynthesisVoice[];
  onAnalysisPanelChange: Dispatch<SetStateAction<AnalysisSettingsPanel>>;
  onBadPostureDurationChange: (value: string) => void;
  onHistoryDeleteErrorChange: (value: string | null) => void;
  onHistoryDeleteScopeChange: (value: HistoryDeleteScope | null) => void;
  onHistoryDeleteSessionKeysChange: Dispatch<SetStateAction<string[]>>;
  onHistoryDeleteStepChange: (value: HistoryDeleteStep) => void;
  onAnalysisSettingsOpenChange: (open: boolean) => void;
  onPendingTitleDraftChange: (value: string) => void;
  onSettingsSaveStatusChange: (value: SettingsSaveStatus) => void;
  onCloseHistoryDelete: () => void;
  onCloseStretchSettings: () => void;
  onUpdateSettingsDraft: (changes: Partial<Settings>) => void;
  onUpdateStretchSettingsDraft: (changes: Partial<StretchSettingsDraft>) => void;
  onApplySettings: () => void;
  onApplyStretchSettings: () => void;
  onCloseStretchComplete: () => void;
  onDeleteHistoryRecords: () => Promise<void>;
  onDoAnotherStretch: () => void;
  onRequestNotificationPermission: () => Promise<void>;
  onResetSettings: () => void;
  onResetStretchSettings: () => void;
  onReturnToAnalysis: () => void;
  onSavePendingTitle: () => Promise<void>;
};

export function PostureCoachDialogs(props: PostureCoachDialogsProps) {
  const {
    activeAnalysisSettingsPanel, badPostureDurationMinutesInput, historyDeleteError,
    historyDeleteScope, historyDeleteSessionKeys, historyDeleteStep, isAnalysisSettingsOpen,
    isDeletingHistory, isHistoryDeleteModalOpen, isStretchBeepSupported,
    isStretchCompleteModalOpen, isStretchSettingsOpen, isStretchTtsSupported,
    pendingTitleDraft, pendingTitleError, pendingTitleSaving, pendingTitleSession,
    selectedHistoryGroup, selectedHistorySessionKey, settingsDraft, settingsSaveStatus,
    stretchSettingsDraft, stretchSettingsSaveStatus, stretchTtsVoiceOptions,
    onAnalysisPanelChange, onBadPostureDurationChange, onHistoryDeleteErrorChange,
    onHistoryDeleteScopeChange, onHistoryDeleteSessionKeysChange, onHistoryDeleteStepChange,
    onAnalysisSettingsOpenChange, onPendingTitleDraftChange, onSettingsSaveStatusChange,
    onCloseHistoryDelete, onCloseStretchSettings, onUpdateSettingsDraft,
    onUpdateStretchSettingsDraft, onApplySettings, onApplyStretchSettings,
    onCloseStretchComplete, onDeleteHistoryRecords, onDoAnotherStretch,
    onRequestNotificationPermission, onResetSettings, onResetStretchSettings,
    onReturnToAnalysis, onSavePendingTitle,
  } = props;
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
    onAnalysisPanelChange((current) => {
      const currentIndex = analysisSettingsPanels.findIndex((panel) => panel.id === current);
      const nextIndex = (currentIndex - 1 + analysisSettingsPanels.length) % analysisSettingsPanels.length;
      return analysisSettingsPanels[nextIndex].id;
    });
  };
  const showNextAnalysisSettingsPanel = () => {
    onAnalysisPanelChange((current) => {
      const currentIndex = analysisSettingsPanels.findIndex((panel) => panel.id === current);
      const nextIndex = (currentIndex + 1) % analysisSettingsPanels.length;
      return analysisSettingsPanels[nextIndex].id;
    });
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

  const renderStretchSettingsModal = () => {
    if (!isStretchSettingsOpen) {
      return null;
    }

    const stretchSettingsStatusText =
      stretchSettingsSaveStatus === "saved"
        ? "스트레칭 설정이 적용되었습니다."
        : stretchSettingsSaveStatus === "error"
          ? "스트레칭 설정 적용 실패"
          : "";
    const isVoiceSelectDisabled =
      !isStretchTtsSupported || !stretchSettingsDraft.ttsEnabled || stretchTtsVoiceOptions.length === 0;

    return (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/35 px-4 py-6 sm:items-center sm:justify-center">
        <section className="flex max-h-[88vh] w-full max-w-xl flex-col border border-[rgba(18,100,76,0.24)] bg-white">
          <div className="flex items-start justify-between gap-4 border-b border-[rgba(18,100,76,0.16)] p-5">
            <div>
              <p className="text-lg font-bold text-gray-900">스트레칭 설정</p>
              <p className="mt-1 text-sm text-gray-600">알림음과 음성 코치 방식을 조정하세요.</p>
            </div>
            <button
              type="button"
              onClick={onCloseStretchSettings}
              className="flex h-8 w-8 shrink-0 items-center justify-center border border-gray-300 bg-white text-gray-700"
              aria-label="스트레칭 설정 닫기"
            >
              X
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            <ToggleControl
              checked={stretchSettingsDraft.beepEnabled && isStretchBeepSupported}
              onChange={(checked) => onUpdateStretchSettingsDraft({ beepEnabled: checked })}
              label="단계 알림음 켜기/끄기"
            />
            {!isStretchBeepSupported && (
              <p className="text-sm leading-6 text-gray-500">이 브라우저에서는 단계 알림음을 지원하지 않습니다.</p>
            )}

            <ToggleControl
              checked={stretchSettingsDraft.ttsEnabled && isStretchTtsSupported}
              onChange={(checked) => onUpdateStretchSettingsDraft({ ttsEnabled: checked })}
              label="음성 코치 켜기/끄기"
            />

            <label className="block border border-gray-100 bg-[rgba(196,246,232,0.18)] p-4">
              <span className="text-sm font-medium text-gray-700">음성 코치 성우</span>
              <select
                value={stretchSettingsDraft.ttsVoiceUri}
                disabled={isVoiceSelectDisabled}
                onChange={(event) => onUpdateStretchSettingsDraft({ ttsVoiceUri: event.target.value })}
                className="mt-2 w-full border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                aria-label="음성 코치 성우 선택"
              >
                <option value="">기본 성우</option>
                {stretchTtsVoiceOptions.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {getStretchVoiceLabel(voice)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {!isStretchTtsSupported
                  ? "이 브라우저에서는 음성 코치를 지원하지 않습니다."
                  : !stretchSettingsDraft.ttsEnabled
                    ? "음성 코치를 켜면 성우를 선택할 수 있습니다."
                    : stretchTtsVoiceOptions.length === 0
                      ? "사용 가능한 브라우저 음성을 불러오는 중입니다."
                      : "브라우저와 운영체제에 설치된 음성 목록을 사용합니다."}
              </p>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-[rgba(18,100,76,0.16)] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {stretchSettingsStatusText && (
                <span className="border bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {stretchSettingsStatusText}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onApplyStretchSettings}
                className="bg-blue-600 px-4 py-2 text-sm font-bold text-white"
              >
                적용하기
              </button>
              <button
                type="button"
                onClick={onResetStretchSettings}
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
              onClick={() => onAnalysisSettingsOpenChange(false)}
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
                  onChange={(checked) => onUpdateSettingsDraft({ landmarkOverlayEnabled: checked })}
                  label="자세 랜드마크 표시 켜기/끄기"
                />
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">측면 분석 기준</span>
                  <select
                    value={settingsDraft.preferredSideMode}
                    onChange={(event) => onUpdateSettingsDraft({ preferredSideMode: event.target.value as SideMode })}
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
                  onChange={(checked) => onUpdateSettingsDraft({ warningAlertEnabled: checked })}
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
                    onChange={(event) => onUpdateSettingsDraft({ warningScoreThreshold: Number(event.target.value) })}
                    className="mt-3 w-full"
                  />
                </label>
                <ToggleControl
                  checked={settingsDraft.badPostureTestAlertEnabled}
                  onChange={(checked) => onUpdateSettingsDraft({ badPostureTestAlertEnabled: checked })}
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
                      onClick={() => void onRequestNotificationPermission()}
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
                        onBadPostureDurationChange(event.target.value);
                        onSettingsSaveStatusChange("idle");
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
                      onChange={(event) => onUpdateSettingsDraft({ realtimeScoreIntervalSeconds: Number(event.target.value) })}
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
                  onChange={(checked) => onUpdateSettingsDraft({ stretchReminderEnabled: checked })}
                  label="스트레칭 알림 켜기/끄기"
                />
                <ToggleControl
                  checked={settingsDraft.stretchReminderTestAlertEnabled}
                  onChange={(checked) => onUpdateSettingsDraft({ stretchReminderTestAlertEnabled: checked })}
                  label="테스트 모드: 20초 이상 측정하면 Windows 스트레칭 알림"
                />
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">
                    {settingsDraft.stretchReminderIntervalMinutes}분마다 스트레칭 알림
                  </span>
                  <select
                    value={settingsDraft.stretchReminderIntervalMinutes}
                    onChange={(event) => onUpdateSettingsDraft({ stretchReminderIntervalMinutes: Number(event.target.value) })}
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
                onClick={onApplySettings}
                disabled={!canApplySettings}
                className="bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                적용하기
              </button>
              <button
                type="button"
                onClick={onResetSettings}
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
              void onSavePendingTitle();
            }}
          >
            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-gray-500">세션 제목</span>
              <input
                value={pendingTitleDraft}
                onChange={(event) => onPendingTitleDraftChange(event.target.value)}
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

  const renderStretchCompleteModal = () => {
    if (!isStretchCompleteModalOpen) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/35 px-4 py-6 sm:items-center sm:justify-center">
        <section className="w-full max-w-md border border-[rgba(18,100,76,0.24)] bg-white p-5 shadow-xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-gray-900">스트레칭이 끝났습니다</p>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                몸 상태를 다시 확인하거나 다른 스트레칭을 이어서 진행할 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseStretchComplete}
              className="flex h-8 w-8 shrink-0 items-center justify-center border border-gray-300 bg-white text-sm font-bold text-gray-700 hover:border-[#18755B] hover:text-[#18755B]"
              aria-label="스트레칭 완료 창 닫기"
            >
              X
            </button>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onDoAnotherStretch}
              className="min-h-11 border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:border-[#18755B] hover:text-[#18755B]"
            >
              다른 스트레칭 더 하기
            </button>
            <button
              type="button"
              onClick={onReturnToAnalysis}
              className="min-h-11 border border-[#18755B] bg-[#18755B] px-4 py-2 text-sm font-bold text-white hover:bg-[#12644C]"
            >
              자세 분석으로 돌아가기
            </button>
          </div>
        </section>
      </div>
    );
  };

  const renderHistoryDeleteModal = () => {
    if (!isHistoryDeleteModalOpen) {
      return null;
    }

    const hasDateSessions = Boolean(selectedHistoryGroup && selectedHistoryGroup.sessions.length > 0);
    const modalSessions = selectedHistoryGroup
      ? [...selectedHistoryGroup.sessions].sort((left, right) => {
          const rightTime = new Date(right.startedAt).getTime();
          const leftTime = new Date(left.startedAt).getTime();
          return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
        })
      : [];
    const selectedDeleteKeySet = new Set(historyDeleteSessionKeys);
    const selectedDeleteCount =
      historyDeleteScope === "date" ? selectedHistoryGroup?.sessions.length ?? 0 : historyDeleteSessionKeys.length;
    const confirmDescription =
      historyDeleteScope === "sessions"
        ? `선택한 ${selectedDeleteCount}개 세션과 연결된 이미지/알림/점수 기록이 삭제됩니다.`
        : "이 날짜의 모든 세션과 연결된 이미지/알림/점수 기록이 삭제됩니다.";
    const toggleDeleteSessionKey = (sessionTitleKey: string) => {
      onHistoryDeleteSessionKeysChange((current) =>
        current.includes(sessionTitleKey)
          ? current.filter((key) => key !== sessionTitleKey)
          : [...current, sessionTitleKey]
      );
    };

    return (
      <div className="fixed inset-0 z-[70] flex items-end bg-black/35 px-4 py-6 sm:items-center sm:justify-center">
        <section className="w-full max-w-md border border-red-200 bg-white p-5 shadow-xl">
          {historyDeleteStep === "scope" ? (
            <>
              <div className="mb-4">
                <p className="text-lg font-bold text-gray-900">삭제할 기록을 선택하세요</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">삭제할 범위를 고른 뒤 한 번 더 확인합니다.</p>
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={!hasDateSessions}
                  onClick={() => {
                    onHistoryDeleteErrorChange(null);
                    onHistoryDeleteScopeChange("sessions");
                    onHistoryDeleteStepChange("session-select");
                    onHistoryDeleteSessionKeysChange(selectedHistorySessionKey ? [selectedHistorySessionKey] : []);
                  }}
                  className="border border-[rgba(18,100,76,0.2)] bg-white p-4 text-left disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50"
                >
                  <span className="block text-sm font-bold text-gray-900">선택한 세션만 삭제</span>
                  <span className="mt-1 block text-sm text-gray-500">현재 날짜에서 삭제할 세션을 직접 선택합니다.</span>
                </button>
                <button
                  type="button"
                  disabled={!hasDateSessions}
                  onClick={() => {
                    onHistoryDeleteErrorChange(null);
                    onHistoryDeleteScopeChange("date");
                    onHistoryDeleteStepChange("confirm");
                    onHistoryDeleteSessionKeysChange([]);
                  }}
                  className="border border-[rgba(18,100,76,0.2)] bg-white p-4 text-left disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50"
                >
                  <span className="block text-sm font-bold text-gray-900">이 날짜의 전체 세션 삭제</span>
                  <span className="mt-1 block text-sm text-gray-500">선택한 날짜의 모든 세션을 삭제합니다.</span>
                </button>
              </div>
              {historyDeleteError && <p className="mt-3 text-sm font-bold text-red-600">{historyDeleteError}</p>}
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onCloseHistoryDelete}
                  className="min-h-11 border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
                >
                  취소
                </button>
              </div>
            </>
          ) : historyDeleteStep === "session-select" ? (
            <>
              <div className="mb-4">
                <p className="text-lg font-bold text-gray-900">삭제할 세션을 선택하세요</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">선택한 날짜의 세션 중 삭제할 항목을 체크하세요.</p>
              </div>
              <div className="max-h-72 overflow-y-auto border border-[rgba(18,100,76,0.16)]">
                {modalSessions.map((session) => {
                  const sessionTitleKey = session.sessionTitleKey ?? getSessionTitleKey(session, selectedHistoryGroup?.dateKey ?? "");
                  const isChecked = selectedDeleteKeySet.has(sessionTitleKey);
                  const sessionDuration = formatMinutes(session.durationMinutes ?? 0);
                  return (
                    <label
                      key={sessionTitleKey}
                      className="flex cursor-pointer items-start gap-3 border-b border-gray-100 bg-white px-3 py-3 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDeleteSessionKey(sessionTitleKey)}
                        className="mt-1 h-4 w-4 accent-red-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-gray-900">{getHistorySessionDisplayTitle(session)}</span>
                        <span className="mt-1 block truncate text-xs text-gray-500">
                          {formatTime(session.startedAt)}
                          {session.endedAt ? ` - ${formatTime(session.endedAt)}` : ""} · 사용 {sessionDuration}
                        </span>
                        <span className={`mt-1 block text-xs font-bold ${session.averageScore === null ? "text-gray-500" : "text-[#18755B]"}`}>
                          {session.averageScore === null ? "측정 부족" : `평균 ${session.averageScore}`}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {historyDeleteError && <p className="mt-3 text-sm font-bold text-red-600">{historyDeleteError}</p>}
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    onHistoryDeleteStepChange("scope");
                    onHistoryDeleteScopeChange(null);
                    onHistoryDeleteSessionKeysChange([]);
                    onHistoryDeleteErrorChange(null);
                  }}
                  className="min-h-11 border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700"
                >
                  이전
                </button>
                <button
                  type="button"
                  disabled={historyDeleteSessionKeys.length === 0}
                  onClick={() => onHistoryDeleteStepChange("confirm")}
                  className="min-h-11 border border-red-600 bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  다음
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-4">
                <p className="text-lg font-bold text-gray-900">정말 삭제할까요?</p>
                <p className="mt-2 text-sm leading-6 text-gray-600">{confirmDescription}</p>
                <p className="mt-1 text-sm font-bold text-red-600">삭제된 기록은 복구할 수 없습니다.</p>
              </div>
              {historyDeleteError && <p className="mb-3 text-sm font-bold text-red-600">{historyDeleteError}</p>}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={isDeletingHistory}
                  onClick={onCloseHistoryDelete}
                  className="min-h-11 border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={isDeletingHistory}
                  onClick={() => void onDeleteHistoryRecords()}
                  className="min-h-11 border border-red-600 bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {isDeletingHistory ? "삭제 중..." : "삭제"}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    );
  };

  return (
    <>
      {renderAnalysisSettingsModal()}
      {renderStretchSettingsModal()}
      {renderPendingTitlePrompt()}
      {renderStretchCompleteModal()}
      {renderHistoryDeleteModal()}
    </>
  );
}

