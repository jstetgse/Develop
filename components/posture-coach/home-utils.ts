import type { HistoryGroup, PostureRecommendationArea, RecentSummary } from "@/lib/types";
import { getPostureAreaLabel, getPostureAreaThreshold } from "@/components/posture-coach/display-utils";

export function createHomeScoreInsight(historyGroups: HistoryGroup[], recentSummary: RecentSummary | null, now = Date.now()) {
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentSevenDaySessions = historyGroups
      .flatMap((group) => group.sessions)
      .filter((session) => {
        const startedAt = new Date(session.startedAt).getTime();
        return Number.isFinite(startedAt) && startedAt >= sevenDaysAgo && startedAt <= now;
      });
    const scoredSevenDaySessions = recentSevenDaySessions.filter((session) => typeof session.averageScore === "number");
    const sevenDayAverage = scoredSevenDaySessions.length
      ? Math.round(
          scoredSevenDaySessions.reduce((sum, session) => sum + (session.averageScore ?? 0), 0) /
            scoredSevenDaySessions.length
        )
      : null;
    const currentAverage =
      typeof recentSummary?.averageScore === "number" ? recentSummary.averageScore : null;
    const trend = currentAverage !== null && sevenDayAverage !== null ? currentAverage - sevenDayAverage : null;
    const bestScores = recentSevenDaySessions
      .map((session) => session.bestScore)
      .filter((score): score is number => typeof score === "number");
    const worstScores = recentSevenDaySessions
      .map((session) => session.worstScore)
      .filter((score): score is number => typeof score === "number");
    const mostRecentSession = recentSevenDaySessions
      .filter((session) => Number.isFinite(new Date(session.startedAt).getTime()))
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime())[0];
    const areaTotals: Record<PostureRecommendationArea, { totalScore: number; totalCount: number }> = {
      neck: { totalScore: 0, totalCount: 0 },
      torso: { totalScore: 0, totalCount: 0 },
      stability: { totalScore: 0, totalCount: 0 },
    };

    for (const session of recentSevenDaySessions) {
      if (!session.postureAreaStats) {
        continue;
      }
      for (const area of Object.keys(areaTotals) as PostureRecommendationArea[]) {
        const stat = session.postureAreaStats[area];
        if (!stat || typeof stat.averageScore !== "number" || stat.totalCount <= 0) {
          continue;
        }
        areaTotals[area].totalScore += stat.averageScore * stat.totalCount;
        areaTotals[area].totalCount += stat.totalCount;
      }
    }

    const areaScores = (Object.keys(areaTotals) as PostureRecommendationArea[]).map((area) => {
      const total = areaTotals[area];
      return {
        area,
        label: getPostureAreaLabel(area),
        score: total.totalCount > 0 ? Math.round(total.totalScore / total.totalCount) : null,
      };
    });
    const weakestArea = areaScores
      .filter((item): item is { area: PostureRecommendationArea; label: string; score: number } => item.score !== null)
      .sort((left, right) => left.score - right.score)[0];

    return {
      trend,
      sevenDayAverage,
      weakestAreaLabel: weakestArea?.label ?? null,
      weakestArea: weakestArea?.area ?? null,
      weakestAreaScore: weakestArea?.score ?? null,
      areaScores,
      bestScore: bestScores.length ? Math.max(...bestScores) : null,
      worstScore: worstScores.length ? Math.min(...worstScores) : null,
      latestMeasuredAt: mostRecentSession?.startedAt ?? null,
    };
}

export function createHomePostureSummary(homeScoreInsight: ReturnType<typeof createHomeScoreInsight>) {
    const validAreaScores = homeScoreInsight.areaScores.filter(
      (item): item is { area: PostureRecommendationArea; label: string; score: number } => item.score !== null
    );
    const isStable =
      validAreaScores.length > 0 &&
      validAreaScores.every((item) => item.score >= getPostureAreaThreshold(item.area));

    if (validAreaScores.length === 0 || !homeScoreInsight.weakestAreaLabel) {
      return {
        attentionText: "분석 전",
        statusText: "분석을 시작하면 자세 요약이 표시됩니다",
        weakestArea: null,
      };
    }

    if (isStable) {
      return {
        attentionText: "없음",
        statusText: "최근 자세 흐름이 안정적입니다",
        weakestArea: null,
      };
    }

    const statusText =
      homeScoreInsight.weakestArea === "neck"
        ? "목 정렬을 먼저 확인해보세요"
        : homeScoreInsight.weakestArea === "torso"
          ? "허리 균형을 먼저 확인해보세요"
          : "자세 안정성을 먼저 확인해보세요";

    return {
      attentionText: `${homeScoreInsight.weakestAreaLabel} ${homeScoreInsight.weakestAreaScore ?? "--"}`,
      statusText,
      weakestArea: homeScoreInsight.weakestArea,
    };
}

