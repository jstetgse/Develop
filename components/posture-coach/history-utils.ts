import type { HistoryGroup, PostureAreaStats, PostureRecommendationArea, PostureResult, PostureScorePoint, SessionSummary } from "@/lib/types";
import type { StretchRecommendation } from "@/lib/stretch-recommendation";
import { getPostureAreaLabel, getPostureAreaThreshold } from "@/components/posture-coach/display-utils";

export type ScorePoint = {
  id: string;
  time: string;
  timestamp: number;
  score: number;
};

type HistoryScorePoint = ScorePoint & { dateKey: string };

const HISTORY_REPORT_AREAS: PostureRecommendationArea[] = ["neck", "torso"];
const SCORE_INDICATOR_BORDER_WIDTH = 3;

export function getHistoryAreaScores(postureAreaStats?: PostureAreaStats) {
  return HISTORY_REPORT_AREAS.map((area) => {
    const score = postureAreaStats?.[area]?.averageScore;
    return {
      area,
      label: getPostureAreaLabel(area),
      score: typeof score === "number" ? score : null,
    };
  });
}

export function getHistoryWeakestArea(postureAreaStats?: PostureAreaStats) {
  return getHistoryAreaScores(postureAreaStats)
    .filter((item): item is { area: PostureRecommendationArea; label: string; score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score)[0] ?? null;
}

export function getHistoryReportComment(areaScores: ReturnType<typeof getHistoryAreaScores>) {
  const validScores = areaScores
    .filter((item): item is { area: PostureRecommendationArea; label: string; score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score);
  const weakest = validScores[0];

  if (!weakest) {
    return "측정 시간이 짧아 부위별 점수를 계산하지 못했어요.";
  }

  if (weakest.score < 60) {
    return `${weakest.label} 점수가 낮아 먼저 확인이 필요합니다.`;
  }

  if (weakest.score < 75) {
    return `${weakest.label} 정렬을 조금 더 확인하세요.`;
  }

  return "목과 허리 균형이 안정적으로 기록되었습니다.";
}

export function getHistorySessionDisplayTitle(session: SessionSummary) {
  if (session.customTitle?.trim()) {
    return session.customTitle;
  }

  return "제목을 입력해주세요";
}

export function getScoreIndicatorStyle(score: number | null) {
  if (score === null) {
    return {
      background: "#ffffff",
      borderColor: "rgba(18, 100, 76, 0.22)",
      outline: `${SCORE_INDICATOR_BORDER_WIDTH}px solid rgba(107, 114, 128, 0.34)`,
      outlineOffset: "0px",
    };
  }

  const normalizedScore = Math.min(Math.max(score, 0), 100);
  const fill = Math.round(normalizedScore * 3.6);
  const color = score >= 80 ? "#39AF8E" : score >= 60 ? "#EAB308" : "#DC2626";
  const emptyColor = score >= 80 ? "#D6F3EB" : score >= 60 ? "#FEF3C7" : "#FEE2E2";
  const outlineColor =
    score >= 80 ? "rgba(57, 175, 142, 0.72)" : score >= 60 ? "rgba(234, 179, 8, 0.72)" : "rgba(220, 38, 38, 0.72)";

  if (fill >= 360) {
    return {
      background: color,
      borderColor: "rgba(18, 100, 76, 0.22)",
      outline: `${SCORE_INDICATOR_BORDER_WIDTH}px solid ${outlineColor}`,
      outlineOffset: "0px",
    };
  }

  return {
    background: `conic-gradient(${color} 0deg ${fill}deg, ${emptyColor} ${fill}deg 360deg)`,
    borderColor: "rgba(18, 100, 76, 0.22)",
    outline: `${SCORE_INDICATOR_BORDER_WIDTH}px solid ${outlineColor}`,
    outlineOffset: "0px",
  };
}

export function getHistoryCalendarToneClass(score: number | null) {
  if (score === null) {
    return {
      border: "border-gray-300",
      bg: "bg-gray-50",
      text: "text-gray-500",
      ring: "ring-gray-300",
    };
  }
  if (score >= 80) {
    return {
      border: "border-[#39AF8E]",
      bg: "bg-[#E7FFF7]",
      text: "text-[#12644C]",
      ring: "ring-[#39AF8E]",
    };
  }
  if (score >= 60) {
    return {
      border: "border-yellow-400",
      bg: "bg-yellow-50",
      text: "text-yellow-900",
      ring: "ring-yellow-400",
    };
  }
  return {
    border: "border-red-300",
    bg: "bg-red-50",
    text: "text-red-700",
    ring: "ring-red-300",
  };
}

export function getHistoryAverageReferenceTone(score: number) {
  if (score >= 80) {
    return {
      stroke: "#003D2B",
      label: "#003D2B",
    };
  }

  if (score >= 60) {
    return {
      stroke: "#D97706",
      label: "#92400E",
    };
  }

  return {
    stroke: "#DC2626",
    label: "#991B1B",
  };
}

export function getScoreToneClass(score: number | null | undefined) {
  if (typeof score !== "number") {
    return {
      border: "border-gray-200",
      bg: "bg-gray-50",
      text: "text-gray-500",
    };
  }

  if (score >= 80) {
    return {
      border: "border-[#39AF8E]/35",
      bg: "bg-[#D6F3EB]",
      text: "text-[#18755B]",
    };
  }

  if (score >= 60) {
    return {
      border: "border-yellow-200",
      bg: "bg-yellow-50",
      text: "text-yellow-800",
    };
  }

  return {
    border: "border-red-200",
    bg: "bg-red-50",
    text: "text-red-700",
  };
}

export function recordPostureAreaStats(stats: PostureAreaStats, posture: PostureResult) {
  if (!posture.isTracking || !posture.metrics) {
    return;
  }

  const scores: Record<PostureRecommendationArea, number> = {
    neck: posture.metrics.neckScore,
    torso: posture.metrics.trunkScore,
    stability: posture.metrics.stabilityScore,
  };

  for (const area of Object.keys(scores) as PostureRecommendationArea[]) {
    const current = stats[area];
    const nextTotalCount = current.totalCount + 1;
    const previousTotalScore = (current.averageScore ?? 0) * current.totalCount;
    const score = scores[area];
    current.totalCount = nextTotalCount;
    current.lowCount += score < getPostureAreaThreshold(area) ? 1 : 0;
    current.averageScore = Math.round((previousTotalScore + score) / nextTotalCount);
  }
}

export function hasPostureAreaStats(stats: PostureAreaStats) {
  return Object.values(stats).some((stat) => stat.totalCount > 0);
}

export function getRecommendationPriorityClass(priorityLabel: StretchRecommendation["priorityLabel"]) {
  if (priorityLabel === "높음") {
    return "bg-red-100 text-red-700";
  }
  if (priorityLabel === "보통") {
    return "bg-yellow-100 text-yellow-800";
  }
  return "bg-green-100 text-green-700";
}

export function formatDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function getMonthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export function formatHistoryMonthLabel(monthKey: string) {
  const date = new Date(`${monthKey}-01T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
  }).format(date);
}

export function shiftMonthKey(monthKey: string, offset: number) {
  const date = new Date(`${monthKey}-01T00:00:00+09:00`);
  date.setMonth(date.getMonth() + offset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getCalendarDays(monthKey: string) {
  const firstDay = new Date(`${monthKey}-01T00:00:00+09:00`);
  const year = firstDay.getFullYear();
  const month = firstDay.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingEmptyDays = firstDay.getDay();
  const cells: Array<string | null> = [];

  for (let index = 0; index < leadingEmptyDays; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, "0")}`);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

export function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(timestamp));
}

export function getKoreaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

export function createTodaySavedScorePoints(
  historyGroups: HistoryGroup[],
  scorePointsBySession = new Map<string, PostureScorePoint[]>()
): ScorePoint[] {
  const today = getKoreaDateKey();
  const todayGroup = historyGroups.find((group) => group.dateKey === today);
  if (!todayGroup) {
    return [];
  }

  return todayGroup.sessions.flatMap((session) => {
    const scorePoints = scorePointsBySession.get(session.sessionId) ?? [];
    if (scorePoints.length > 0) {
      return scorePoints
        .filter((point) => Number.isFinite(point.timestamp))
        .sort((left, right) => left.timestamp - right.timestamp)
        .map((point) => ({
          id: `score-point-${session.sessionId}-${point.id ?? point.timestamp}`,
          time: formatTime(point.capturedAt),
          timestamp: point.timestamp,
          score: point.score,
        }));
    }

    if (typeof session.averageScore !== "number") {
      return [];
    }

    const timestamp = new Date(session.startedAt).getTime();
    return [
      {
        id: `saved-${session.sessionId}`,
        time: formatTime(session.startedAt),
        timestamp,
        score: session.averageScore ?? 0,
      },
    ];
  })
    .sort((left, right) => left.timestamp - right.timestamp);
}

export function createHistoryScoreYAxisDomain(points: Array<{ score: number }>): [number, number] {
  const scores = points.map((point) => point.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  let minDomain = Math.max(0, Math.floor((minScore - 5) / 5) * 5);
  let maxDomain = Math.min(100, Math.ceil((maxScore + 5) / 5) * 5);

  if (maxDomain - minDomain < 10) {
    const midpoint = (minScore + maxScore) / 2;
    minDomain = Math.max(0, Math.floor((midpoint - 5) / 5) * 5);
    maxDomain = Math.min(100, Math.ceil((midpoint + 5) / 5) * 5);
  }

  if (maxDomain - minDomain < 10) {
    if (minDomain === 0) {
      maxDomain = Math.min(100, minDomain + 10);
    } else if (maxDomain === 100) {
      minDomain = Math.max(0, maxDomain - 10);
    } else {
      maxDomain = Math.min(100, minDomain + 10);
    }
  }

  return [minDomain, maxDomain];
}

export function createHistoryScoreYAxisTicks(domain: [number, number]) {
  const [minDomain, maxDomain] = domain;
  const tickStep = maxDomain - minDomain <= 20 ? 5 : 10;
  const firstTick = Math.ceil(minDomain / tickStep) * tickStep;
  const ticks: number[] = [];

  for (let value = firstTick; value <= maxDomain; value += tickStep) {
    ticks.push(value);
  }

  return ticks.length > 0 ? ticks : [minDomain, maxDomain];
}

export function formatHistoryScorePointLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function createSessionTrendSummary(historyGroups: HistoryGroup[], dateKey: string) {
  const points: HistoryScorePoint[] = historyGroups
    .filter((group) => group.dateKey <= dateKey && typeof group.averageScore === "number")
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
    .slice(0, 5)
    .reverse()
    .map((group) => ({
      id: `history-day-${group.dateKey}`,
      dateKey: group.dateKey,
      time: formatHistoryScorePointLabel(group.dateKey),
      timestamp: new Date(`${group.dateKey}T00:00:00+09:00`).getTime(),
      score: group.averageScore ?? 0,
    }));
  const selectedGroup = historyGroups.find((group) => group.dateKey === dateKey) ?? null;
  const selectedAverageScore =
    typeof selectedGroup?.averageScore === "number" ? selectedGroup.averageScore : null;
  const currentPoint = points.find((point) => point.dateKey === dateKey) ?? null;
  const yDomainPoints =
    selectedAverageScore !== null ? [...points, { score: selectedAverageScore }] : points;
  const yDomain: [number, number] = yDomainPoints.length > 0 ? createHistoryScoreYAxisDomain(yDomainPoints) : [0, 100];
  const yTicks = createHistoryScoreYAxisTicks(yDomain);

  if (selectedAverageScore === null) {
    return {
      points,
      currentPoint,
      selectedAverageScore,
      yDomain,
      yTicks,
      caption: "선택 날짜 평균은 측정 부족이에요.",
    };
  }

  const comparisonPoints = points.filter((point) => point.dateKey !== dateKey);
  if (comparisonPoints.length === 0) {
    return {
      points,
      currentPoint,
      selectedAverageScore,
      yDomain,
      yTicks,
      caption: "최근 점수 흐름을 보려면 기록이 조금 더 필요해요.",
    };
  }

  const comparisonAverage = Math.round(
    comparisonPoints.reduce((sum, point) => sum + point.score, 0) / comparisonPoints.length
  );
  const difference = selectedAverageScore - comparisonAverage;
  const absoluteDifference = Math.abs(difference);

  if (absoluteDifference <= 3) {
    return {
      points,
      currentPoint,
      selectedAverageScore,
      yDomain,
      yTicks,
      caption: "최근 기록일 평균과 비슷해요.",
    };
  }

  return {
    points,
    currentPoint,
    selectedAverageScore,
    yDomain,
    yTicks,
    caption:
      difference > 0
        ? `최근 기록일 평균보다 ${absoluteDifference}점 높아요.`
        : `최근 기록일 평균보다 ${absoluteDifference}점 낮아요.`,
  };
}


