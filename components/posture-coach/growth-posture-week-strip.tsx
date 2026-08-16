import type { GrowthPostureDay, GrowthPostureDayStatus } from "@/components/posture-coach/growth-posture-utils";

type GrowthPostureWeekStripProps = {
  days: GrowthPostureDay[];
  isLoading?: boolean;
  selectedDateKey?: string | null;
  onSelectDate?: (dateKey: string) => void;
};

const STATUS_PRESENTATION: Record<
  GrowthPostureDayStatus,
  { label: string; className: string }
> = {
  good: {
    label: "좋음",
    className: "border-[#70E5C4] bg-[#D6F3EB] text-[#12644C]",
  },
  warning: {
    label: "주의",
    className: "border-yellow-300 bg-yellow-50 text-yellow-800",
  },
  danger: {
    label: "위험",
    className: "border-red-300 bg-red-50 text-red-700",
  },
  insufficient: {
    label: "측정 부족",
    className: "border-gray-300 bg-gray-50 text-gray-600",
  },
  unmeasured: {
    label: "미측정",
    className: "border-gray-200 bg-white text-gray-400",
  },
};

export function GrowthPostureWeekStrip({
  days,
  isLoading = false,
  selectedDateKey = null,
  onSelectDate,
}: GrowthPostureWeekStripProps) {
  if (isLoading) {
    return (
      <div className="border border-dashed border-gray-200 bg-white px-4 py-5 text-center text-sm text-gray-500">
        최근 성장 자세 기록을 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="grid grid-cols-7 gap-1.5" aria-label="최근 7일 성장 자세 상태">
      {days.map((day) => {
        const presentation = STATUS_PRESENTATION[day.status];
        const canSelect = Boolean(onSelectDate && day.status !== "unmeasured");
        const isSelected = selectedDateKey === day.dateKey;
        const content = (
          <>
            <span className="text-xs font-bold opacity-70">{day.dayLabel}</span>
            <span className="text-xs tabular-nums opacity-70">{day.dateLabel}</span>
            <strong className="mt-1 break-keep text-xs leading-tight">
              {presentation.label}
            </strong>
            {day.score !== null && (
              <span className="mt-0.5 text-xs font-bold tabular-nums">
                {Math.round(day.score)}점
              </span>
            )}
          </>
        );
        const className = `flex min-h-[82px] min-w-0 flex-col items-center justify-center border px-1 py-2 text-center ${presentation.className} ${
          isSelected ? "ring-2 ring-[#18755B] ring-offset-1" : ""
        }`;

        return canSelect ? (
          <button
            key={day.dateKey}
            type="button"
            onClick={() => onSelectDate?.(day.dateKey)}
            className={`${className} transition-transform hover:-translate-y-0.5`}
            aria-label={`${day.dateLabel} ${presentation.label}${day.score === null ? "" : ` ${Math.round(day.score)}점`}`}
            aria-pressed={isSelected}
          >
            {content}
          </button>
        ) : (
          <div key={day.dateKey} className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
