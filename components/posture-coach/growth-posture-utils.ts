import type { HistoryGroup } from "@/lib/types";

export type GrowthPostureDayStatus =
  | "good"
  | "warning"
  | "danger"
  | "insufficient"
  | "unmeasured";

export type GrowthPostureDay = {
  dateKey: string;
  dayLabel: string;
  dateLabel: string;
  score: number | null;
  status: GrowthPostureDayStatus;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getKoreaDateKey(date: Date) {
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

function getDateLabels(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00+09:00`);
  return {
    dayLabel: new Intl.DateTimeFormat("ko-KR", {
      weekday: "short",
      timeZone: "Asia/Seoul",
    }).format(date),
    dateLabel: `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}`,
  };
}

export function getGrowthPostureDayStatus(
  score: number | null | undefined,
  hasRecord: boolean
): GrowthPostureDayStatus {
  if (!hasRecord) return "unmeasured";
  if (typeof score !== "number" || !Number.isFinite(score)) return "insufficient";
  if (score >= 80) return "good";
  if (score >= 60) return "warning";
  return "danger";
}

export function createGrowthPostureWeek(
  historyGroups: HistoryGroup[],
  now = new Date()
): GrowthPostureDay[] {
  const todayKey = getKoreaDateKey(now);
  const todayNoon = new Date(`${todayKey}T12:00:00+09:00`).getTime();
  const groupByDate = new Map(historyGroups.map((group) => [group.dateKey, group]));

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayNoon - (6 - index) * DAY_MS);
    const dateKey = getKoreaDateKey(date);
    const group = groupByDate.get(dateKey);
    const labels = getDateLabels(dateKey);
    return {
      dateKey,
      ...labels,
      score: typeof group?.averageScore === "number" ? group.averageScore : null,
      status: getGrowthPostureDayStatus(group?.averageScore, Boolean(group)),
    };
  });
}

export function getGrowthPostureHistoryMessage(score: number | null | undefined) {
  const status = getGrowthPostureDayStatus(score, true);
  if (status === "good") return "좋은 자세 습관을 유지했어요.";
  if (status === "warning") return "조금 더 편안하고 바른 자세를 만들어 보세요.";
  if (status === "danger") {
    return "혹시 자세를 포기하셨나요? ㅠ 다음 분석에서는 몸을 바로 펴봐요!";
  }
  return "측정 시간이 부족해 자세 상태를 판단하기 어려워요.";
}
