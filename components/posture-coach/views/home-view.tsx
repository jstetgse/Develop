import { Activity, Calendar, CheckCircle, Ruler, Video } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PostureRecommendationArea, RecentSummary, Settings } from "@/lib/types";
import type { Tab } from "@/components/posture-coach/types";
import { formatMinutes, getHomeScoreTone } from "@/components/posture-coach/display-utils";
import { formatTime } from "@/components/posture-coach/history-utils";
import { getPostureAreaIcon } from "@/components/posture-coach/posture-icons";
import { GrowthPostureWeekStrip } from "@/components/posture-coach/growth-posture-week-strip";
import type { GrowthPostureDay } from "@/components/posture-coach/growth-posture-utils";
import {
  calculateFinalHeightPrediction,
  formatGrowthPercentile,
  formatHeightCm,
} from "@/lib/growth-posture";

type HomeViewProps = {
  homePostureSummary: {
    weakestArea: PostureRecommendationArea | null;
    attentionText: string;
    statusText: string;
  };
  homeAttentionTone: { badgeClass: string };
  homeScoreInsight: {
    trend: number | null;
    bestScore: number | null;
    worstScore: number | null;
    latestMeasuredAt: string | null;
    areaScores: Array<{ area: PostureRecommendationArea; label: string; score: number | null }>;
  };
  recentSummary: RecentSummary | null;
  combinedScorePoints: Array<{ id: string; time: string; timestamp: number; score: number }>;
  settings: Settings;
  growthPostureWeek: GrowthPostureDay[];
  isLoadingHistory: boolean;
  onOpenGrowthSettings: () => void;
  onNavigate: (tab: Tab) => void;
};

export function HomeView({ homePostureSummary, homeAttentionTone, homeScoreInsight, recentSummary, combinedScorePoints, settings, growthPostureWeek, isLoadingHistory, onOpenGrowthSettings, onNavigate }: HomeViewProps) {
  const heightPrediction = calculateFinalHeightPrediction(
    settings.growthSex,
    settings.currentAgeYears,
    settings.currentHeightCm
  );

  return (
    <div className="space-y-3">
      <section className="app-surface border-l-4 border-l-[#18755B] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.65fr)] lg:items-stretch">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center bg-[#C4F6E8] text-[#18755B]">
                  <Ruler className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-bold text-gray-900">내 키 예측</h2>
                <span className="group relative inline-flex">
                  <button
                    type="button"
                    aria-label="키 예측 안내"
                    aria-describedby="height-prediction-note"
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-[#18755B] text-xs font-black leading-none text-[#18755B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18755B]"
                  >
                    !
                  </button>
                  <span
                    id="height-prediction-note"
                    role="tooltip"
                    className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-[min(280px,calc(100vw-3rem))] -translate-x-1/2 border border-gray-200 bg-gray-900 px-3 py-2 text-left text-xs font-medium leading-5 text-white shadow-lg group-hover:block group-focus-within:block"
                  >
                    현재 성장 위치가 유지된다는 가정의 교육용 통계 추정이며, 의학적 최종 키 예측이 아닙니다.
                  </span>
                </span>
              </div>
              {heightPrediction && (
                <span className="border border-[#70E5C4] bg-[#C4F6E8] px-2.5 py-1 text-xs font-bold text-[#12644C]">
                  {formatGrowthPercentile(heightPrediction.percentile)}
                </span>
              )}
            </div>

            {heightPrediction ? (
              <>
                <div className="flex min-h-[118px] flex-col items-center justify-center border border-blue-100 bg-blue-50/50 p-3 text-center">
                  <span className="mb-3 text-xs font-bold text-gray-500">
                    {settings.growthSex === "male" ? "남자" : "여자"} · 만 {settings.currentAgeYears}세
                  </span>
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                    <div className="min-w-0">
                      <span className="block text-sm text-gray-500">현재 키</span>
                      <strong className="mt-1 block text-xl text-gray-900 sm:text-2xl">
                        {formatHeightCm(heightPrediction.currentHeightCm)}
                      </strong>
                    </div>
                    <span className="text-xl font-bold text-[#18755B]" aria-hidden="true">
                      →
                    </span>
                    <div className="min-w-0 text-[#12644C]">
                      <span className="block text-xs font-bold sm:text-sm">만 18세 예상 키</span>
                      <strong className="mt-1 block text-xl sm:text-2xl">
                        {formatHeightCm(heightPrediction.predictedFinalHeightCm)}
                      </strong>
                    </div>
                  </div>
                </div>
                {heightPrediction.isOutsideChartRange && (
                  <p className="mt-3 border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs font-bold leading-5 text-yellow-900">
                    현재 키가 성장도표의 -3SD~+3SD 범위를 벗어나 경계값으로 계산했어요. 실제 결과와 차이가 클 수 있습니다.
                  </p>
                )}
              </>
            ) : (
              <div className="flex h-full min-h-[118px] flex-col items-center justify-center border border-blue-100 bg-blue-50/50 p-4 text-center">
                <p className="text-sm font-bold text-gray-900">성별, 만 나이, 현재 키를 설정해 보세요.</p>
                <button
                  type="button"
                  onClick={onOpenGrowthSettings}
                  className="mt-3 border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700"
                >
                  키 예측 설정하기
                </button>
              </div>
            )}
          </div>

          <div className="min-w-0 border border-[rgba(18,100,76,0.12)] bg-white/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-gray-900">최근 7일 자세</h3>
            </div>
            <GrowthPostureWeekStrip days={growthPostureWeek} isLoading={isLoadingHistory} />
            {!isLoadingHistory && growthPostureWeek.every((day) => day.status === "unmeasured") && (
              <p className="mt-2 text-xs text-gray-500">분석을 시작하면 자세 습관이 기록돼요.</p>
            )}
          </div>
        </div>
      </section>

      <section className="app-surface border-l-4 border-l-[#18755B] p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-center">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center bg-[#C4F6E8] text-[#18755B]">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">오늘의 자세 요약</h2>
              </div>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-[minmax(260px,0.8fr)_minmax(300px,1fr)] sm:items-start">
              <div className="grid max-w-[360px] gap-2">
                <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2 leading-5">
                  <span className="shrink-0 text-gray-500">주의 부위</span>
                  <strong className="inline-flex items-center gap-1.5 font-bold tabular-nums text-[#18755B]">
                    {homePostureSummary.weakestArea ? getPostureAreaIcon(homePostureSummary.weakestArea, "h-3.5 w-3.5") : null}
                    <span className={`${homeAttentionTone.badgeClass} px-1.5 py-0.5`}>{homePostureSummary.attentionText}</span>
                  </strong>
                </div>
                <p className="text-sm font-medium leading-6 text-gray-600">{homePostureSummary.statusText}</p>
              </div>
              <div className="grid max-w-[560px] gap-2">
                {homeScoreInsight.areaScores.map((area) => (
                  (() => {
                    const areaTone = getHomeScoreTone(area.score);
                    const areaValue = area.score === null ? "분석 전" : `${area.score}점`;
                    return (
                      <div
                        key={area.area}
                        className="grid grid-cols-[76px_minmax(0,260px)] items-center gap-x-3 gap-y-1 leading-5"
                      >
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500">
                          {getPostureAreaIcon(area.area, "h-3.5 w-3.5")}
                          {area.label}
                        </span>
                        <div className="flex min-w-0 flex-wrap items-center gap-4">
                          <strong className="whitespace-nowrap tabular-nums text-gray-900">{areaValue}</strong>
                          <div className={`h-1.5 w-[170px] max-w-full ${areaTone.trackClass}`}>
                            <div
                              className={`block h-full ${areaTone.barClass}`}
                              style={{ width: `${area.score ?? 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => onNavigate("analysis")}
              className="app-action-tile p-4"
            >
              <div className="flex items-center justify-center gap-3">
                <Video className="h-5 w-5" />
                <span className="text-lg font-medium">자세 분석 시작</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onNavigate("history")}
              className="app-action-tile-secondary p-3"
            >
              <div className="flex items-center justify-center gap-3">
                <Calendar className="h-5 w-5" />
                <span className="text-base font-medium">기록 보기</span>
              </div>
            </button>
          </div>
        </div>
      </section>

      <div className="grid items-stretch gap-3 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="app-surface flex h-full flex-col p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center bg-[#C4F6E8] text-[#18755B]">
            <CheckCircle className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">최근 변화</h2>
            <p className="text-sm text-gray-500">지난 24시간</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-3">
          <div className="grid gap-3 border-y border-gray-200 py-2.5 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <span className="block text-xs font-bold text-gray-500">평균 점수</span>
              <strong className="mt-1 block truncate tabular-nums text-gray-900">
                {recentSummary?.averageScore === null || recentSummary?.averageScore === undefined ? "기록 없음" : recentSummary.averageScore}
                {recentSummary?.averageScore !== null && recentSummary?.averageScore !== undefined && (
                  <span className="ml-1 text-xs font-bold text-gray-500">/100</span>
                )}
              </strong>
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-gray-500">7일 비교</span>
              <strong
                className={`mt-1 block truncate tabular-nums ${
                  homeScoreInsight.trend === null
                    ? "text-gray-700"
                    : homeScoreInsight.trend >= 0
                      ? "text-[#18755B]"
                      : "text-yellow-800"
                }`}
              >
                {homeScoreInsight.trend === null ? "기록 없음" : `${homeScoreInsight.trend >= 0 ? "+" : ""}${homeScoreInsight.trend}`}
              </strong>
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-bold text-gray-500">최고 / 최저</span>
              <strong className="mt-1 block truncate tabular-nums text-gray-900">
                {homeScoreInsight.bestScore !== null || homeScoreInsight.worstScore !== null
                  ? `${homeScoreInsight.bestScore ?? "--"} / ${homeScoreInsight.worstScore ?? "--"}`
                  : "기록 없음"}
              </strong>
            </div>
          </div>
          <div className="grid gap-3 border-t border-gray-200 pt-2.5 text-xs sm:grid-cols-3">
            <div className="min-w-0">
              <span className="block font-bold text-gray-500">최근 측정</span>
              <strong className="mt-1 block truncate tabular-nums text-gray-700">
                {homeScoreInsight.latestMeasuredAt ? formatTime(homeScoreInsight.latestMeasuredAt) : "아직 없음"}
              </strong>
            </div>
            <div className="min-w-0">
              <span className="block font-bold text-gray-500">사용 시간</span>
              <strong className="mt-1 block truncate tabular-nums text-gray-700">
                {formatMinutes(recentSummary?.totalUsageMinutes ?? 0)}
              </strong>
            </div>
            <div className="min-w-0">
              <span className="block font-bold text-gray-500">알림</span>
              <strong className="mt-1 block truncate tabular-nums text-gray-700">{recentSummary?.alertCount ?? 0}회</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="app-surface p-4">
        <h2 className="mb-2 text-lg font-bold text-gray-900">오늘의 자세 점수 흐름</h2>
        {combinedScorePoints.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={combinedScorePoints}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="time" stroke="#9ca3af" fontSize={12} />
              <YAxis domain={[0, 100]} stroke="#9ca3af" fontSize={12} />
              <Tooltip />
              <Line type="linear" dataKey="score" stroke="#18755B" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[180px] flex-col items-center justify-center border border-dashed border-gray-200 bg-[rgba(196,246,232,0.28)] px-4 text-center text-sm font-medium text-gray-500">
            <span>오늘 분석 기록이 아직 없습니다</span>
            <span className="mt-1 text-xs text-gray-500">자세 분석을 시작하면 점수 변화가 여기에 표시됩니다</span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

