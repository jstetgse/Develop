import { Activity, Calendar, CheckCircle, Video } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PostureRecommendationArea, RecentSummary } from "@/lib/types";
import type { Tab } from "@/components/posture-coach/types";
import { formatMinutes, getHomeScoreTone } from "@/components/posture-coach/display-utils";
import { formatTime } from "@/components/posture-coach/history-utils";
import { getPostureAreaIcon } from "@/components/posture-coach/posture-icons";

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
  onNavigate: (tab: Tab) => void;
};

export function HomeView({ homePostureSummary, homeAttentionTone, homeScoreInsight, recentSummary, combinedScorePoints, onNavigate }: HomeViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">다시 오신 것을 환영합니다</h1>
      </div>

      <section className="app-surface border-l-4 border-l-[#18755B] p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-center">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center bg-[#C4F6E8] text-[#18755B]">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">오늘의 자세 요약</h2>
              </div>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-[minmax(260px,0.8fr)_minmax(300px,1fr)] sm:items-start">
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
                        className="grid grid-cols-[max-content_max-content] gap-x-3 gap-y-1 leading-5 sm:grid-cols-[76px_72px_minmax(140px,220px)] sm:items-center"
                      >
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-gray-500">
                          {getPostureAreaIcon(area.area, "h-3.5 w-3.5")}
                          {area.label}
                        </span>
                        <strong className="whitespace-nowrap tabular-nums text-gray-900">{areaValue}</strong>
                        <div className={`col-span-2 h-1.5 w-full max-w-[220px] ${areaTone.trackClass} sm:col-span-1`}>
                          <div
                            className={`block h-full ${areaTone.barClass}`}
                            style={{ width: `${area.score ?? 0}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => onNavigate("analysis")}
              className="app-action-tile p-5"
            >
              <div className="flex items-center justify-center gap-3">
                <Video className="h-5 w-5" />
                <span className="text-lg font-medium">자세 분석 시작</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => onNavigate("history")}
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

      <div className="grid items-stretch gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="app-surface flex h-full flex-col p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center bg-[#C4F6E8] text-[#18755B]">
            <CheckCircle className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">최근 변화</h2>
            <p className="text-sm text-gray-500">지난 24시간</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-4">
          <div className="grid gap-3 border-y border-gray-200 py-3 text-sm sm:grid-cols-3">
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
          <div className="grid gap-3 border-t border-gray-200 pt-3 text-xs sm:grid-cols-3">
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

      <div className="app-surface p-5">
        <h2 className="mb-3 text-lg font-bold text-gray-900">오늘의 자세 점수 흐름</h2>
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
          <div className="flex h-[200px] flex-col items-center justify-center border border-dashed border-gray-200 bg-[rgba(196,246,232,0.28)] px-4 text-center text-sm font-medium text-gray-500">
            <span>오늘 분석 기록이 아직 없습니다</span>
            <span className="mt-1 text-xs text-gray-500">자세 분석을 시작하면 점수 변화가 여기에 표시됩니다</span>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

