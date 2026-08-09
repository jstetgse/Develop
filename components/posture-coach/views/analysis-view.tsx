import { useState, type RefObject } from "react";
import { SlidersHorizontal, VideoOff } from "lucide-react";
import type { PostureResult, Settings } from "@/lib/types";
import type { AppMode } from "@/components/posture-coach/types";
import { PostureScreenEffectOverlay } from "@/components/posture-coach/posture-screen-effect-overlay";
import type { PostureScreenEffectLevel } from "@/lib/posture/posture-screen-effect";
import { getAnalysisSideLabel, getFeedbackSeverityClass, getFeedbackSeverityLabel, getStatusLabel, getWeightMessage } from "@/components/posture-coach/display-utils";
import {
  calculateHeightGoal,
  formatHeightCm,
  getGrowthPostureState,
  type PostureScoreStatus,
} from "@/lib/growth-posture";

type AnalysisViewProps = {
  cameraTone: "good" | "warn" | "danger" | "neutral";
  cameraText: string;
  modeLabel: string;
  modeMessage: string | null;
  latestPosture: PostureResult;
  settings: Settings;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  isRunning: boolean;
  postureStatus: PostureScoreStatus;
  appMode: AppMode;
  screenEffectLevel: PostureScreenEffectLevel;
  sessionAverageScore: number | null;
  onOpenSettings: () => void;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
};

export function AnalysisView(props: AnalysisViewProps) {
  const { cameraTone, cameraText, modeLabel, modeMessage, latestPosture, settings, videoRef, canvasRef, isRunning, postureStatus, appMode, screenEffectLevel, sessionAverageScore, onOpenSettings, onStart, onStop } = props;
  const [showDetailedMetrics, setShowDetailedMetrics] = useState(false);
  const heightGoal = calculateHeightGoal(settings.currentHeightCm, settings.targetHeightCm);
  const growthPostureState = getGrowthPostureState({
    isRunning,
    isTracking: latestPosture.isTracking,
    postureStatus,
  });
  return (
    <div
      className={`posture-effect-stage posture-effect-stage--${screenEffectLevel} grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]`}
      data-posture-effect={screenEffectLevel}
    >
      <section className="app-surface flex h-full flex-col p-4">
        <div className="mb-2 flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-600">카메라 분석</p>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">측면 자세 분석</h2>
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex h-8 items-center justify-center gap-1.5 border border-[rgba(18,100,76,0.24)] bg-white px-2.5 text-sm font-bold text-[#18755B]"
                aria-label="분석 설정 열기"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>설정</span>
              </button>
            </div>
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
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-gray-200 py-2 text-sm">
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
                <span>카메라 대기 중</span>
              </div>
              <p className="absolute bottom-5 left-1/2 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 text-center text-sm font-medium leading-6 text-[#D6F3EB]/82">
                분석을 시작하면 실시간 자세 오버레이와 1초 평균 점수가 표시됩니다.
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => (isRunning ? void onStop() : void onStart())}
            className={`min-h-11 flex-1 px-6 py-2.5 font-bold text-white ${
              isRunning ? "bg-red-600" : "bg-blue-600"
            }`}
          >
            {isRunning ? "분석 중지" : "분석 시작"}
          </button>
        </div>

      </section>

      <div className="flex h-full flex-col gap-2">
        <section className="app-surface flex-none p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
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

          <div className="my-2 flex flex-wrap items-end gap-3 font-bold text-gray-900">
            <span className="text-7xl leading-none">{latestPosture.score ?? "--"}</span>
            <span className="mb-2 text-lg text-gray-500">/100</span>
            {appMode === "stretching" && (
              <span className="mb-3 border border-yellow-200 bg-yellow-100 px-3 py-1 text-sm font-bold text-yellow-800">
                일시중지됨
              </span>
            )}
          </div>

          <p className="border-l-4 border-l-[#18755B] bg-blue-50 px-3 py-2 text-sm font-bold leading-6 text-blue-950">
            현재 분석 평균 점수: {sessionAverageScore ?? "--"}점
          </p>
          <p className="mt-2 text-sm leading-6 text-gray-700">{getWeightMessage(latestPosture)}</p>
          {latestPosture.feedbackItems.length > 0 && (
            <div className="mt-2 space-y-2">
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
          
        </section>

        <section className="app-surface flex min-h-[210px] flex-1 flex-col p-4">
          {showDetailedMetrics ? (
            <>
              <h3 className="mb-2 text-lg font-bold text-gray-900">분석 지표</h3>
              <div className="grid flex-1 grid-rows-3 gap-2">
                <div className="flex min-h-0 flex-col justify-center border-t border-gray-100 pt-2 first:border-t-0 first:pt-0">
                  <span className="text-sm font-medium text-gray-600">목 점수 / 각도 / 하중</span>
                  <strong className="mt-1 break-keep text-right text-xl leading-tight text-gray-900">
                    {latestPosture.metrics
                      ? `${Math.round(latestPosture.metrics.neckScore)}점 · ${latestPosture.metrics.neckAngleDegrees.toFixed(1)}° · ${latestPosture.metrics.estimatedNeckLoadKg.toFixed(1)}kg`
                      : "--"}
                  </strong>
                </div>
                <div className="flex min-h-0 flex-col justify-center border-t border-gray-100 pt-2">
                  <span className="text-sm font-medium text-gray-600">허리 점수 / 기울기</span>
                  <strong className="mt-1 break-keep text-right text-xl leading-tight text-gray-900">
                    {latestPosture.metrics
                      ? `${Math.round(latestPosture.metrics.trunkScore)}점 · ${latestPosture.metrics.trunkLeanDegrees.toFixed(1)}°`
                      : "--"}
                  </strong>
                </div>
                <div className="flex min-h-0 flex-col justify-center border-t border-gray-100 pt-2">
                  <span className="text-sm font-medium text-gray-600">안정성 점수</span>
                  <strong className="mt-1 break-keep text-right text-xl leading-tight text-gray-900">
                    {latestPosture.metrics ? `${Math.round(latestPosture.metrics.stabilityScore)}점` : "--"}
                  </strong>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailedMetrics(false)}
                className="mt-3 w-full border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700"
              >
                성장 자세로 돌아가기
              </button>
            </>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-bold text-gray-900">내 성장 자세</h3>
                {heightGoal && (
                  <span className="border border-[#70E5C4] bg-[#C4F6E8] px-2.5 py-1 text-xs font-bold text-[#12644C]">
                    {heightGoal.status === "remaining"
                      ? `목표까지 ${formatHeightCm(heightGoal.remainingCm)}`
                      : "목표 달성"}
                  </span>
                )}
              </div>

              {heightGoal && settings.currentHeightCm !== null && settings.targetHeightCm !== null ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="border border-white bg-white/80 p-3">
                    <span className="text-gray-500">현재 키</span>
                    <strong className="mt-1 block text-lg text-gray-900">
                      {formatHeightCm(settings.currentHeightCm)}
                    </strong>
                  </div>
                  <div className="border border-[#70E5C4] bg-[#C4F6E8] p-3 text-[#12644C]">
                    <span>목표 키</span>
                    <strong className="mt-1 block text-lg">
                      {formatHeightCm(settings.targetHeightCm)}
                    </strong>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="w-full border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700"
                >
                  설정에서 현재 키와 목표 키를 입력해 주세요
                </button>
              )}

              <div
                className={`mt-3 border p-3 text-sm leading-6 ${
                  growthPostureState === "danger"
                    ? "border-red-200 bg-red-50 text-red-950"
                    : growthPostureState === "warning"
                      ? "border-yellow-200 bg-yellow-50 text-yellow-950"
                      : growthPostureState === "good"
                        ? "border-[#70E5C4] bg-white text-[#12644C]"
                        : "border-gray-200 bg-white text-gray-700"
                }`}
              >
                {growthPostureState === "idle" && <p>분석을 시작해 보세요.</p>}
                {growthPostureState === "tracking-lost" && (
                  <p>측면이 보이도록 위치를 조정해 주세요.</p>
                )}
                {growthPostureState === "good" && (
                  <p>
                    <strong>좋음</strong> · 좋아요! 지금 자세를 유지해요.
                  </p>
                )}
                {growthPostureState === "warning" && (
                  <p>
                    <strong>주의</strong> · 자세를 고쳐보세요. 목표 키까지 도달해야죠!
                  </p>
                )}
                {growthPostureState === "danger" && (
                  <p>
                    <strong>위험</strong> · 혹시 자세를 포기하셨나요? ㅠ 지금 바로 몸을 펴 주세요!
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowDetailedMetrics(true)}
                className="mt-3 w-full border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700"
              >
                자세히 보기
              </button>
            </>
          )}
        </section>
      </div>
      <PostureScreenEffectOverlay level={screenEffectLevel} />
    </div>
  );
}
