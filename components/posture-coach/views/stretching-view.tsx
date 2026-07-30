import type { RefObject } from "react";
import { CheckCircle, ChevronRight, Clock, SlidersHorizontal, VideoOff } from "lucide-react";
import type { StretchCoachingResult, StretchDefinition, StretchStep } from "@/lib/types";
import { calculateStretchRecommendations } from "@/lib/stretch-recommendation";
import { getStretchById, isDynamicStretchStep } from "@/lib/stretch-analysis";
import type { Tab } from "@/components/posture-coach/types";
import { getRecommendationPriorityClass } from "@/components/posture-coach/history-utils";
import { StretchStepIconTile } from "@/components/posture-coach/stretch-step-icon";

type StretchingViewProps = {
  activeStretchId: string | null;
  activeStretchStep: StretchStep | null;
  activeStretchStepIndex: number;
  allStretchOptions: StretchDefinition[];
  canvasRef: RefObject<HTMLCanvasElement | null>;
  completedStretchSteps: number[];
  displayedRecommendedStretches: StretchDefinition[];
  hasCurrentSessionPostureData: boolean;
  hasPersonalizedStretchChoices: boolean;
  isLoadingHistory: boolean;
  isRunning: boolean;
  isSelectedStretchComplete: boolean;
  isStretchBeepSupported: boolean;
  isStretchDropdownOpen: boolean;
  isStretchingMode: boolean;
  isStretchTtsSupported: boolean;
  nextStretchStep: StretchStep | null;
  personalizedStretchRecommendations: ReturnType<typeof calculateStretchRecommendations>;
  selectedStretch: StretchDefinition | null;
  showAllStretchOptions: boolean;
  stretchAccuracyScore: number | null;
  stretchAccuracyTone: { border: string; bg: string; text: string };
  stretchBeepEnabled: boolean;
  stretchCoaching: StretchCoachingResult;
  stretchTtsEnabled: boolean;
  stretchTtsVoiceOptions: SpeechSynthesisVoice[];
  stretchTtsVoiceUri: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  onClearSelection: () => void;
  onCloseDropdown: () => void;
  onNavigate: (tab: Tab) => void;
  onNextStep: () => void;
  onOpenSettings: () => void;
  onSelectStep: (stepIndex: number) => void;
  onSelectStretch: (stretchId: string) => void;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onToggleBeep: (enabled: boolean) => void;
  onToggleDropdown: () => void;
  onToggleShowAll: () => void;
  onToggleTts: (enabled: boolean) => void;
  onVoiceChange: (voiceUri: string) => void;
};

export function StretchingView(props: StretchingViewProps) {
  const {
    activeStretchId,
    activeStretchStep,
    activeStretchStepIndex,
    allStretchOptions,
    canvasRef,
    completedStretchSteps,
    displayedRecommendedStretches,
    hasCurrentSessionPostureData,
    hasPersonalizedStretchChoices,
    isLoadingHistory,
    isRunning,
    isSelectedStretchComplete,
    isStretchDropdownOpen,
    isStretchingMode,
    nextStretchStep,
    personalizedStretchRecommendations,
    selectedStretch,
    showAllStretchOptions,
    stretchAccuracyScore,
    stretchAccuracyTone,
    stretchCoaching,
    videoRef,
    onClearSelection: handleClearStretchSelection,
    onCloseDropdown,
    onNextStep: handleNextStretchStep,
    onOpenSettings: openStretchSettings,
    onSelectStep,
    onSelectStretch: handleStretchSelection,
    onStart: handleStartStretchingMode,
    onStop: handleStopStretchingMode,
    onToggleDropdown,
    onToggleShowAll,
  } = props;

  const statusLabel = isStretchingMode ? "스트레칭 분석 중" : selectedStretch ? "스트레칭 준비" : "대기 중";
  const statusClassName = isStretchingMode
    ? "border-[#70E5C4] bg-[#C4F6E8] text-[#18755B]"
    : selectedStretch
      ? "border-yellow-200 bg-yellow-100 text-yellow-800"
      : "border-gray-200 bg-gray-100 text-gray-600";
  const stepCountText = selectedStretch
    ? `${completedStretchSteps.length} / ${selectedStretch.steps.length} 단계 완료`
    : "선택 전";

  const renderStepCard = (step: StretchStep, index: number, compact = false) => {
    const isCurrent = index === activeStretchStepIndex;
    const isDone = completedStretchSteps.includes(index);
    const iconState = isCurrent ? "active" : isDone ? "completed" : "inactive";

    return (
      <button
        key={step.id}
        type="button"
        onClick={() => onSelectStep(index)}
        className={`w-full border p-3 text-left ${
          isCurrent
            ? "border-[#18755B]/45 bg-[#E7FFF7]"
            : isDone
              ? "border-green-200 bg-green-50"
              : "border-gray-200 bg-white"
        }`}
      >
        <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 gap-y-2">
          <StretchStepIconTile checkType={step.checkType} stepNumber={index + 1} state={iconState} />
          <div className="min-w-0 self-center">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-keep text-base font-bold leading-snug text-gray-900">{step.title}</p>
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
          </div>
          {!compact && <p className="col-start-2 text-sm leading-6 text-gray-600">{step.instruction}</p>}
        </div>
      </button>
    );
  };

  return (
    <div className="-mt-4 space-y-4">
      {hasCurrentSessionPostureData && !activeStretchId && (
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
                if (!stretch) return null;

                return (
                  <button
                    key={recommendation.stretchId}
                    type="button"
                    onClick={() => handleStretchSelection(recommendation.stretchId)}
                    className={`group flex h-full flex-col border p-4 text-left ${
                      activeStretchId === recommendation.stretchId
                        ? "border-[#18755B] bg-[#E7FFF7]"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="mb-1 text-xs font-bold text-blue-600">{stretch.targetBodyPart}</p>
                        <h3 className="font-bold text-gray-900">{stretch.name}</h3>
                      </div>
                      <span
                        className={`shrink-0 border px-2.5 py-1 text-xs font-bold ${getRecommendationPriorityClass(
                          recommendation.priorityLabel,
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
                          : "border-[#18755B]/25 bg-white text-[#18755B]"
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
              onClick={onToggleShowAll}
              className="inline-flex min-h-10 items-center justify-center gap-2 border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700"
            >
              {showAllStretchOptions ? "다른 스트레칭 목록 닫기" : "다른 스트레칭 선택하기"}
              <ChevronRight className="h-4 w-4" />
            </button>
            {showAllStretchOptions && (
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {allStretchOptions.map((stretch) => (
                  <button
                    key={stretch.id}
                    type="button"
                    onClick={() => handleStretchSelection(stretch.id)}
                    className={`group flex h-full flex-col border p-4 text-left ${
                      activeStretchId === stretch.id ? "border-[#18755B] bg-[#E7FFF7]" : "border-gray-200 bg-gray-50"
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
                        <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                      )}
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
      )}

      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(380px,0.9fr)]">
        <section className="app-surface flex h-full flex-col p-4">
          <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">카메라 분석</p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900">스트레칭 분석</h2>
                <button
                  type="button"
                  onClick={openStretchSettings}
                  className="flex h-8 items-center justify-center gap-1.5 border border-[rgba(18,100,76,0.24)] bg-white px-2.5 text-sm font-bold text-[#18755B]"
                  aria-label="스트레칭 설정 열기"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span>설정</span>
                </button>
              </div>
            </div>
            <span className={`inline-flex min-h-9 items-center justify-center gap-2 border px-3 py-1 text-sm font-bold ${statusClassName}`}>
              <span className="app-status-dot" />
              {statusLabel}
            </span>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-gray-200 py-2 text-sm">
            <span className="inline-flex items-center gap-2 font-bold text-blue-700">
              <span className="app-status-dot" />
              {selectedStretch?.name ?? "스트레칭을 선택하세요"}
            </span>
            <span className="font-bold text-gray-700">{stepCountText}</span>
          </div>

          <div className="app-camera-frame relative mt-2 aspect-video overflow-hidden">
            <video ref={videoRef} className="absolute inset-0 h-full w-full scale-x-[-1] object-cover" playsInline muted />
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            {!isRunning && (
              <div className="app-camera-standby absolute inset-0 p-4">
                <div aria-hidden="true">
                  <span className="app-camera-standby-corner left-4 top-4 border-l border-t" />
                  <span className="app-camera-standby-corner right-4 top-4 border-r border-t" />
                  <span className="app-camera-standby-corner bottom-4 left-4 border-b border-l" />
                  <span className="app-camera-standby-corner bottom-4 right-4 border-b border-r" />
                </div>
                <div className="absolute left-5 top-5 inline-flex items-center gap-2 border border-[#70E5C4]/45 bg-[#001A12]/72 px-3 py-1.5 text-sm font-bold text-[#D6F3EB]">
                  <VideoOff className="h-4 w-4" />
                  <span>스트레칭 분석 대기</span>
                </div>
                <p className="absolute bottom-5 left-1/2 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 text-center text-sm font-medium leading-6 text-[#D6F3EB]/82">
                  스트레칭 분석 시작을 누르면 카메라가 켜집니다.
                </p>
              </div>
            )}
            {selectedStretch && activeStretchStep && (
              <div className="absolute right-4 top-4 flex max-w-[75%] flex-wrap justify-end gap-1.5">
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

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => (isStretchingMode ? void handleStopStretchingMode() : void handleStartStretchingMode())}
              disabled={!activeStretchId || isSelectedStretchComplete}
              className={`min-h-11 flex-1 px-6 py-2.5 font-bold text-white disabled:cursor-not-allowed ${
                !activeStretchId || isSelectedStretchComplete ? "bg-gray-400" : isStretchingMode ? "bg-red-600" : "bg-blue-600"
              }`}
            >
              {!activeStretchId ? "스트레칭을 선택해주세요" : isStretchingMode ? "스트레칭 중지" : "스트레칭 분석 시작"}
            </button>
            
          </div>
        </section>

        <div className="flex h-full flex-col gap-2">
          <section className="app-surface flex-none p-4">
            {selectedStretch ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">{selectedStretch.targetBodyPart}</p>
                    <h3 className="text-xl font-bold text-gray-900">{selectedStretch.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">{stepCountText}</p>
                  </div>
                  <button type="button" onClick={handleClearStretchSelection} className="shrink-0 text-sm font-bold text-gray-400">
                    변경
                  </button>
                </div>

                {isStretchingMode && activeStretchStep ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <StretchStepIconTile
                        checkType={activeStretchStep.checkType}
                        stepNumber={activeStretchStepIndex + 1}
                        state="active"
                        size="large"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-[#18755B]">{activeStretchStep.title}</p>
                          <span className="border border-[#18755B]/20 bg-[#E7FFF7] px-2 py-0.5 text-xs font-bold text-[#18755B]">
                            {activeStretchStepIndex + 1} / {selectedStretch.steps.length} 단계
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-gray-700">{activeStretchStep.instruction}</p>
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <div className={`border px-3 py-2 ${stretchAccuracyTone.border} ${stretchAccuracyTone.bg}`}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className={`text-xs font-bold ${stretchAccuracyTone.text}`}>동작 정확도</span>
                          <strong className={`text-2xl leading-none ${stretchAccuracyTone.text}`}>
                            {stretchAccuracyScore ?? "--"}%
                          </strong>
                        </div>
                      </div>
                      <div className="border border-[#18755B]/15 bg-white px-3 py-2">
                        <p className="text-xs font-bold text-[#18755B]">실시간 피드백</p>
                        <p className="mt-1 text-sm font-bold leading-6 text-gray-900">{stretchCoaching.coachingMessage}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {selectedStretch.steps.map((step, index) => renderStepCard(step, index))}
                  </div>
                )}
              </>
            ) : hasPersonalizedStretchChoices ? (
              <div>
                <p className="text-sm font-bold text-gray-900">맞춤 추천에서 선택하세요</p>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  위 맞춤 추천 카드에서 스트레칭을 선택하면 단계별 분석을 시작할 수 있습니다.
                </p>
              </div>
            ) : (
              <div>
                <label htmlFor="stretch-select" className="block text-sm font-bold text-gray-900">
                  스트레칭 선택
                </label>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  맞춤 추천이 없을 때는 목록에서 바로 선택해 분석을 시작할 수 있습니다.
                </p>
                <div className="relative mt-4">
                  <button
                    id="stretch-select"
                    type="button"
                    onClick={onToggleDropdown}
                    className="flex min-h-11 w-full items-center justify-between gap-3 border border-[#18755B]/30 bg-white px-3 py-2 text-left text-sm font-bold text-gray-900 focus:border-[#18755B] focus:outline-none"
                    aria-haspopup="listbox"
                    aria-expanded={isStretchDropdownOpen}
                  >
                    <span>스트레칭을 선택하세요</span>
                    <ChevronRight className={`h-5 w-5 shrink-0 text-[#18755B] ${isStretchDropdownOpen ? "rotate-90" : ""}`} />
                  </button>
                  {isStretchDropdownOpen && (
                    <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto border border-[#18755B]/25 bg-white" role="listbox">
                      {displayedRecommendedStretches.map((stretch) => (
                        <button
                          key={stretch.id}
                          type="button"
                          onClick={() => {
                            handleStretchSelection(stretch.id);
                            onCloseDropdown();
                          }}
                          className="flex w-full items-start justify-between gap-3 border-b border-gray-100 px-3 py-3 text-left last:border-b-0"
                          role="option"
                          aria-selected={activeStretchId === stretch.id}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-bold text-gray-900">{stretch.name}</span>
                            <span className="mt-1 block text-xs text-gray-500">
                              {stretch.targetBodyPart} · {stretch.durationSec}초 · {stretch.steps.length}단계
                            </span>
                          </span>
                          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#18755B]" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {isStretchingMode && selectedStretch && (
            <section className="app-surface flex min-h-[170px] flex-1 flex-col p-4">
              <h3 className="mb-2 text-lg font-bold text-gray-900">{nextStretchStep ? "다음 단계" : "마무리"}</h3>
              {nextStretchStep ? (
                <button
                  type="button"
                  onClick={handleNextStretchStep}
                  className="flex w-full flex-1 flex-col border border-gray-200 bg-white p-3 text-left"
                >
                  <div className="flex items-start gap-3">
                    <StretchStepIconTile
                      checkType={nextStretchStep.checkType}
                      stepNumber={activeStretchStepIndex + 2}
                      state="inactive"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900">{nextStretchStep.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-gray-600">{nextStretchStep.instruction}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-sm font-bold text-[#18755B]">
                    <span>다음 단계로 넘어가기</span>
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  </div>
                </button>
              ) : (
                <div className="flex flex-1 flex-col justify-between gap-3 border border-[#18755B]/15 bg-[#E7FFF7]/45 p-3">
                  <div>
                    <p className="text-sm font-bold text-[#18755B]">마지막 단계입니다. 현재 안내에 맞춰 마무리하세요.</p>
                    <p className="mt-2 text-sm leading-5 text-gray-600">완료하면 결과 창에서 다음 행동을 선택할 수 있습니다.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleNextStretchStep}
                    className="min-h-10 w-full bg-[#18755B] px-4 py-2 text-sm font-bold text-white"
                  >
                    스트레칭 끝내기
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
