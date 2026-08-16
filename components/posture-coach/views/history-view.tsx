import { useEffect, useRef, useState, type ReactNode } from "react";
import { Activity, AlertTriangle, Bell, CheckCircle, ChevronLeft, ChevronRight, Clock, HelpCircle, Pencil, Trash2 } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HistoryGroup, PostureImageAnalysis, SerializedPoseLandmark, SessionSummary } from "@/lib/types";
import { SESSION_TITLE_MAX_LENGTH, getSessionTitleKey } from "@/lib/session-title";
import { formatMinutes, getStatusLabel } from "@/components/posture-coach/display-utils";
import { createSessionTrendSummary, formatDateKey, formatHistoryMonthLabel, formatTime, getCalendarDays, getHistoryAreaScores, getHistoryAverageReferenceTone, getHistoryCalendarToneClass, getHistoryGraphDotColor, getHistoryReportComment, getHistorySessionDisplayTitle, getHistoryWeakestArea, getKoreaDateKey, getMonthKey, getScoreIndicatorStyle, shiftMonthKey } from "@/components/posture-coach/history-utils";
import { getPostureAreaIcon } from "@/components/posture-coach/posture-icons";
import { GrowthPostureWeekStrip } from "@/components/posture-coach/growth-posture-week-strip";
import { getGrowthPostureHistoryMessage, type GrowthPostureDay } from "@/components/posture-coach/growth-posture-utils";

type HistoryViewProps = {
  historyGroups: HistoryGroup[];
  growthPostureWeek: GrowthPostureDay[];
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
  onOpenDeleteSession: (sessionTitleKey: string) => void;
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

type HistoryTrendDotProps = {
  cx?: number;
  cy?: number;
  payload?: {
    score?: number | null;
  };
};

function renderHistoryTrendDot(props: HistoryTrendDotProps) {
  const { cx, cy, payload } = props;
  if (typeof cx !== "number" || typeof cy !== "number") {
    return null;
  }

  const color = getHistoryGraphDotColor(payload?.score);
  return <circle cx={cx} cy={cy} r={2.5} fill={color} stroke={color} strokeWidth={1} />;
}

function renderHistoryTrendActiveDot(props: HistoryTrendDotProps) {
  const { cx, cy, payload } = props;
  if (typeof cx !== "number" || typeof cy !== "number") {
    return null;
  }

  const color = getHistoryGraphDotColor(payload?.score);
  return <circle cx={cx} cy={cy} r={4} fill={color} stroke="#ffffff" strokeWidth={1.5} />;
}

type ExtremaImageKind = "best" | "worst";

const POSE_PIPELINE_CONNECTIONS: Array<[number, number]> = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];

const POSE_PIPELINE_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

function getExplanationStatus(score: number | null | undefined) {
  if (typeof score !== "number") {
    return {
      label: "측정 부족",
      className: "border-gray-200 bg-gray-50 text-gray-500",
    };
  }

  if (score >= 80) {
    return {
      label: "양호",
      className: "border-[#39AF8E]/35 bg-[#D6F3EB] text-[#18755B]",
    };
  }

  if (score >= 60) {
    return {
      label: "주의",
      className: "border-yellow-200 bg-yellow-50 text-yellow-800",
    };
  }

  return {
    label: "개선 필요",
    className: "border-red-200 bg-red-50 text-red-700",
  };
}

function getImageScore(session: SessionSummary, kind: ExtremaImageKind) {
  return kind === "best"
    ? session.bestImageScore ?? session.bestScore
    : session.worstImageScore ?? session.worstScore;
}

function getImageAnalysis(session: SessionSummary, kind: ExtremaImageKind) {
  return kind === "best" ? session.bestImageAnalysis : session.worstImageAnalysis;
}

function createNeckExplanation(score: number | null, isBest: boolean) {
  if (typeof score !== "number") {
    return "사진별 자세 세부 정보가 적어서 점수 중심으로 설명했어요. 정확한 원인 분석은 새로 측정한 기록에서 더 잘 표시돼요.";
  }
  if (score >= 85) {
    return isBest
      ? "목이 앞으로 많이 나오지 않고 안정적으로 유지됐어요. 이 자세처럼 화면을 볼 때 고개가 앞으로 쏠리지 않게 유지하면 좋아요."
      : "이 장면에서도 목 정렬은 비교적 잘 유지됐어요. 목보다는 다른 자세 요소를 함께 확인하면 좋아요.";
  }
  if (score >= 70) {
    return "목이 살짝 앞으로 나온 모습이 점수에 반영됐어요. 턱을 살짝 당기고 화면을 눈높이에 맞추면 더 좋아요.";
  }
  return "머리가 앞으로 많이 나와 목 자세를 고치면 좋아요. 화면 쪽으로 고개를 내밀지 않도록 의자에 몸을 조금 더 붙여보세요.";
}

function createTrunkExplanation(score: number | null, isBest: boolean) {
  if (typeof score !== "number") {
    return "사진별 자세 세부 정보가 적어서 점수 중심으로 설명했어요. 정확한 원인 분석은 새로 측정한 기록에서 더 잘 표시돼요.";
  }
  if (score >= 85) {
    return isBest
      ? "상체가 비교적 바르게 유지됐어요. 어깨와 허리가 한쪽으로 쏠리지 않은 점이 좋게 평가됐어요."
      : "이 장면에서도 상체 정렬은 비교적 잘 유지됐어요. 허리나 어깨가 무너지지 않았는지 함께 확인하면 좋아요.";
  }
  if (score >= 70) {
    return "상체가 조금 기울어진 모습이 점수에 반영됐어요. 허리와 어깨가 한쪽으로 쏠리지 않게 등받이에 기대어 앉아보세요.";
  }
  return "허리와 상체가 많이 기울어 자세를 고치면 좋아요. 몸을 책상 쪽으로 너무 숙이지 말고 골반을 의자 안쪽에 붙여보세요.";
}

function createOtherFactorsExplanation(
  imageScore: number,
  neckScore?: number | null,
  trunkScore?: number | null
) {
  const hasStableAreaScores =
    typeof neckScore === "number" &&
    typeof trunkScore === "number" &&
    neckScore >= 85 &&
    trunkScore >= 85;

  if (hasStableAreaScores && imageScore < 85) {
    return "목과 상체 정렬은 안정적으로 기록됐어요. 이 사진만으로는 낮은 점수의 원인을 특정 부위로 단정하지 않아요.";
  }

  if (hasStableAreaScores || imageScore >= 85) {
    return "목과 상체 정렬은 안정적으로 기록됐어요. 이 자세를 유지하면서 화면 높이와 앉는 위치를 함께 맞추면 좋아요.";
  }

  return "이 사진만으로는 점수의 이유를 충분히 설명하기 어려워요. 측정 시간이 짧으면 최고/최저 장면은 참고용으로 보는 것이 좋아요.";
}

function createLegacyAnalysisExplanation(imageScore: number) {
  if (imageScore >= 85) {
    return "사진별 자세 세부 정보가 적어서 점수 중심으로 설명했어요. 정확한 원인 분석은 새로 측정한 기록에서 더 잘 표시돼요.";
  }
  if (imageScore >= 70) {
    return "사진별 자세 세부 정보가 적어서 특정 부위를 원인으로 단정하지 않아요. 이 장면은 기록 점수 중심으로 참고하면 좋아요.";
  }
  return "사진별 자세 세부 정보가 적어서 낮은 점수의 이유를 충분히 설명하기 어려워요. 새로 측정한 기록에서는 최고/최저 장면을 더 정확히 비교할 수 있어요.";
}

function createDeductionExplanation(
  imageScore: number | null,
  neckScore: number | null,
  trunkScore: number | null,
  analysis: PostureImageAnalysis | null | undefined
) {
  if (typeof imageScore !== "number") {
    return "측정 시간이 짧아 자세를 충분히 분석하지 못했어요. 조금 더 길게 측정하면 최고/최저 장면을 더 정확히 비교할 수 있어요.";
  }

  const hasNeck = typeof neckScore === "number";
  const hasTrunk = typeof trunkScore === "number";
  if (hasNeck && hasTrunk) {
    if (neckScore >= 85 && trunkScore >= 85) {
      return createOtherFactorsExplanation(imageScore, neckScore, trunkScore);
    }

    const scoreGap = Math.abs(neckScore - trunkScore);
    const bothLow = neckScore < 70 && trunkScore < 70;
    const bothCaution = neckScore >= 70 && neckScore < 85 && trunkScore >= 70 && trunkScore < 85;

    if (bothLow && scoreGap < 8) {
      return "목과 상체 모두 자세를 확인하면 좋아요. 앉는 위치를 다시 잡고 화면 높이도 함께 맞춰보세요.";
    }

    if (bothCaution && scoreGap < 8) {
      return "목과 상체가 모두 조금씩 점수에 반영됐어요. 확인할 때는 고개와 허리 위치를 함께 보면 좋아요.";
    }

    if (neckScore < 70 && trunkScore >= 70) {
      return "이 장면에서는 목 정렬이 점수에 더 크게 반영됐어요. 고개가 앞으로 나오는 습관을 먼저 확인하면 좋아요.";
    }

    if (trunkScore < 70 && neckScore >= 70) {
      return "이 장면에서는 상체 정렬이 점수에 더 크게 반영됐어요. 허리와 어깨가 한쪽으로 기울지 않았는지 먼저 확인하면 좋아요.";
    }

    if (scoreGap >= 8) {
      return neckScore < trunkScore
        ? "이 장면에서는 목 정렬이 점수에 더 크게 반영됐어요. 고개가 앞으로 나오는 습관을 먼저 확인하면 좋아요."
        : "이 장면에서는 상체 정렬이 점수에 더 크게 반영됐어요. 허리와 어깨가 한쪽으로 기울지 않았는지 먼저 확인하면 좋아요.";
    }

    if (analysis?.mainIssue === "neck" && neckScore < 85) {
      return "이 장면에서는 목 정렬이 점수에 더 크게 반영됐어요. 고개가 앞으로 나오는 습관을 먼저 확인하면 좋아요.";
    }

    if (analysis?.mainIssue === "torso" && trunkScore < 85) {
      return "이 장면에서는 상체 정렬이 점수에 더 크게 반영됐어요. 허리와 어깨가 한쪽으로 기울지 않았는지 먼저 확인하면 좋아요.";
    }

    return createOtherFactorsExplanation(imageScore, neckScore, trunkScore);
  }

  return createLegacyAnalysisExplanation(imageScore);
}

function createFinalExplanation(score: number | null, isBest: boolean) {
  if (typeof score !== "number") {
    return "측정 시간이 짧아 자세를 충분히 분석하지 못했어요. 조금 더 길게 측정하면 최고/최저 장면을 더 정확히 비교할 수 있어요.";
  }

  if (isBest) {
    return "이 세션에서 가장 자세가 좋았던 순간이에요. 이 자세를 기준으로 화면 높이와 앉는 위치를 유지하면 좋아요.";
  }
  if (score >= 85) {
    return "이 세션은 전체적으로 안정적이었고, 이 장면은 그중 상대적으로 점수가 낮았던 순간이에요. 나쁜 자세라기보다는 비교용 장면으로 보면 좋아요.";
  }
  if (score >= 70) {
    return "이 순간은 자세를 조금 더 확인하면 좋은 장면이에요. 점수에 더 크게 반영된 부분을 먼저 확인하면 좋아요.";
  }
  return "이 순간은 자세 보정이 필요한 장면이에요. 목과 상체가 함께 무너지지 않도록 앉는 위치부터 다시 잡아보세요.";
}

function createPhotoScoreExplanation(session: SessionSummary, kind: ExtremaImageKind) {
  const isBest = kind === "best";
  const analysis = getImageAnalysis(session, kind);
  const neckScore = typeof analysis?.neckScore === "number" ? analysis.neckScore : null;
  const trunkScore = typeof analysis?.trunkScore === "number" ? analysis.trunkScore : null;
  const score = getImageScore(session, kind);
  const finalStatus = getExplanationStatus(score);

  return [
    {
      label: "목 정렬",
      score: neckScore,
      message: createNeckExplanation(neckScore, isBest),
    },
    {
      label: "상체 정렬",
      score: trunkScore,
      message: createTrunkExplanation(trunkScore, isBest),
    },
    {
      label: "점수에 영향 준 부분",
      score,
      message: createDeductionExplanation(score, neckScore, trunkScore, analysis),
      showStatus: false,
      showScore: false,
    },
    {
      label: "요약",
      score,
      message: createFinalExplanation(score, isBest),
      overrideStatus: finalStatus,
    },
  ];
}

export function HistoryView(props: HistoryViewProps) {
  const { historyGroups, growthPostureWeek, isLoadingHistory, selectedHistoryGroup, selectedHistorySessionKey, historySessionPage, visibleHistoryMonthKey, editingSessionTitleKey, sessionTitleDraft, savingSessionTitleKey, sessionTitleErrors, expandedHistoryImageSessions, onSelectSession, onOpenDeleteSession, onShiftMonth, onSelectDate, onCloseSession, onChangePage, onTitleDraftChange, onCancelTitleEdit, onBeginTitleEdit, onToggleImages, onSaveTitle } = props;
  const [isCalendarHelpOpen, setIsCalendarHelpOpen] = useState(false);
  const [visibleGuidelineImages, setVisibleGuidelineImages] = useState<Set<string>>(new Set());
  const [calendarHelpPosition, setCalendarHelpPosition] = useState<{ left: number; top: number } | null>(null);
  const calendarHelpRef = useRef<HTMLDivElement>(null);
  const calendarHelpPopoverRef = useRef<HTMLDivElement>(null);

  const closeCalendarHelp = () => {
    setIsCalendarHelpOpen(false);
    setCalendarHelpPosition(null);
  };

  const updateCalendarHelpPosition = () => {
    const triggerRect = calendarHelpRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return;
    }

    const viewportPadding = 12;
    const popoverGap = 8;
    const popoverWidth = 256;
    const popoverHeight = calendarHelpPopoverRef.current?.offsetHeight ?? 236;
    const maxLeft = window.innerWidth - popoverWidth - viewportPadding;
    const left = Math.max(viewportPadding, Math.min(triggerRect.right - popoverWidth, maxLeft));
    const bottomTop = triggerRect.bottom + popoverGap;
    const top =
      bottomTop + popoverHeight > window.innerHeight - viewportPadding
        ? Math.max(viewportPadding, triggerRect.top - popoverHeight - popoverGap)
        : bottomTop;

    setCalendarHelpPosition({ left, top });
  };

  const toggleCalendarHelp = () => {
    if (isCalendarHelpOpen) {
      closeCalendarHelp();
      return;
    }

    updateCalendarHelpPosition();
    setIsCalendarHelpOpen(true);
  };

  useEffect(() => {
    if (!isCalendarHelpOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (!calendarHelpRef.current?.contains(target) && !calendarHelpPopoverRef.current?.contains(target)) {
        closeCalendarHelp();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("resize", closeCalendarHelp);
    window.addEventListener("scroll", closeCalendarHelp, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("resize", closeCalendarHelp);
      window.removeEventListener("scroll", closeCalendarHelp, true);
    };
  }, [isCalendarHelpOpen]);

  const missingScoreBadge = (
    <span className="inline-flex items-center border border-gray-200 bg-white px-2 py-0.5 text-xs font-bold text-gray-500">
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
        className={`border px-4 py-3 ${isWarning ? "border-orange-200 bg-orange-50 text-orange-800" : "border-[rgba(18,100,76,0.2)] bg-white text-gray-900"
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

  const toggleImageGuideline = (key: string) => {
    setVisibleGuidelineImages((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getPipelinePoint = (landmarks: SerializedPoseLandmark[], index: number) => {
    const landmark = landmarks[index];
    if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y) || (landmark.visibility ?? 1) < 0.35) {
      return null;
    }

    return {
      x: Math.max(0, Math.min(100, 100 - landmark.x * 100)),
      y: Math.max(0, Math.min(100, landmark.y * 100)),
    };
  };

  const renderPosePipeline = (landmarks: SerializedPoseLandmark[]) => (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {POSE_PIPELINE_CONNECTIONS.map(([from, to]) => {
        const start = getPipelinePoint(landmarks, from);
        const end = getPipelinePoint(landmarks, to);
        if (!start || !end) {
          return null;
        }

        return (
          <line
            key={`${from}-${to}`}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="rgba(59, 130, 246, 0.88)"
            strokeWidth="0.9"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {POSE_PIPELINE_POINTS.map((index) => {
        const point = getPipelinePoint(landmarks, index);
        if (!point) {
          return null;
        }

        return (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="1.1"
            fill="rgba(219, 234, 254, 0.95)"
            stroke="rgba(37, 99, 235, 0.95)"
            strokeWidth="0.45"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );

  const renderExtremaImageCard = (session: SessionSummary, kind: ExtremaImageKind) => {
    const isBest = kind === "best";
    const imageUrl = isBest ? session.bestImageUrl : session.worstImageUrl;
    const score = getImageScore(session, kind);
    const imageVersion = isBest
      ? session.bestImageCapturedAt ?? session.bestImageScore
      : session.worstImageCapturedAt ?? session.worstImageScore;
    const title = isBest ? "최고 자세" : "최저 자세";
    const landmarks = isBest ? session.bestImageLandmarks : session.worstImageLandmarks;
    const hasPosePipeline = Boolean(landmarks?.length);
    const guidelineKey = `${session.sessionId}:${kind}`;
    const isGuidelineVisible = visibleGuidelineImages.has(guidelineKey);
    const canShowExplanation = Boolean(imageUrl);
    const explanation = canShowExplanation ? createPhotoScoreExplanation(session, kind) : [];

    return (
      <div className="overflow-hidden border border-gray-200 bg-white">
        {imageUrl ? (
          <div className="relative">
            <img
              src={appendImageVersion(imageUrl, imageVersion)}
              alt={title}
              className="aspect-video w-full object-cover"
            />
            {isGuidelineVisible && landmarks?.length ? renderPosePipeline(landmarks) : null}
            {hasPosePipeline && (
              <button
                type="button"
                onClick={() => toggleImageGuideline(guidelineKey)}
                className="absolute right-2 top-2 border border-[#70E5C4]/60 bg-[#001A12]/75 px-2.5 py-1 text-xs font-bold text-[#D6F3EB]"
              >
                {isGuidelineVisible ? "자세 파이프라인 끄기" : "자세 파이프라인 보기"}
              </button>
            )}
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center text-sm text-gray-400">
            {title} 이미지 없음
          </div>
        )}
        <div className="border-t border-gray-100 p-3">
          <div className="mb-3 flex items-center justify-between gap-3 text-sm font-medium text-gray-900">
            <span>{title}</span>
            <span className="text-right">
              <span className="block text-xs font-bold text-gray-500">사진 점수</span>
              <strong className="tabular-nums">{score !== null ? `${score}점` : "--"}</strong>
            </span>
          </div>
          {canShowExplanation && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">왜 이 점수가 나왔나요?</p>
              {explanation.map((step) => {
                const status = step.overrideStatus ?? getExplanationStatus(step.score);
                const showStatus = step.showStatus !== false;
                const showScore = step.showScore !== false;
                return (
                  <div key={step.label} className="border-t border-gray-100 pt-2 text-sm">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-bold text-gray-900">{step.label}</span>
                      {showStatus && (
                        <span className={`border px-2 py-0.5 text-xs font-bold ${status.className}`}>
                          {status.label}
                        </span>
                      )}
                      {showScore && typeof step.score === "number" && (
                        <span className="text-xs font-bold tabular-nums text-gray-500">{Math.round(step.score)}점</span>
                      )}
                    </div>
                    <p className="leading-5 text-gray-600">{step.message}</p>
                  </div>
                );
              })}
            </div>
          )}
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
      <div
        key={sessionTitleKey}
        className={`flex w-full items-stretch border transition-colors ${isSelected
            ? "border-[#18755B] bg-[#C4F6E8] text-[#001A12]"
            : "border-[rgba(18,100,76,0.18)] bg-white text-gray-700 hover:border-[#18755B]"
          }`}
      >
        <button
          type="button"
          onClick={() => {
            closeCalendarHelp();
            onSelectSession(sessionTitleKey, index, historySessionsPerPage);
          }}
          className="min-w-0 flex-1 px-3 py-2.5 text-left"
        >
          <span className="block truncate text-sm font-bold">{getHistorySessionDisplayTitle(session)}</span>
          <span className="mt-1 block truncate text-sm text-gray-500">
            {formatTime(session.startedAt)}
            {session.endedAt ? ` - ${formatTime(session.endedAt)}` : ""} · 사용 {sessionDuration}
          </span>
          <span className={`mt-1 block text-sm font-bold ${session.averageScore === null ? "text-gray-500" : "text-[#18755B]"}`}>
            {averageText}
          </span>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            closeCalendarHelp();
            onOpenDeleteSession(sessionTitleKey);
          }}
          className="flex w-10 shrink-0 items-center justify-center border-l border-red-100 bg-white text-red-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          aria-label="세션 삭제"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
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

      {isCalendarHelpOpen && calendarHelpPosition && (
        <div
          ref={calendarHelpPopoverRef}
          className="fixed z-50 w-64 max-w-[calc(100vw-1.5rem)] border border-[rgba(18,100,76,0.18)] bg-white p-3 text-left text-xs shadow-lg"
          style={{ left: calendarHelpPosition.left, top: calendarHelpPosition.top }}
        >
          <p className="mb-2 font-bold text-gray-900">날짜 색상 의미</p>
          <div className="space-y-2 text-gray-600">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 border border-[#39AF8E] bg-[#E7FFF7]" />
              <span>좋음 · 80점 이상</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 border border-yellow-400 bg-yellow-50" />
              <span>주의 · 60~79점</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 border border-red-300 bg-red-50" />
              <span>위험 · 60점 미만</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 border border-gray-300 bg-gray-50" />
              <span>평균 -- · 측정 부족</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 border border-transparent bg-transparent ring-1 ring-gray-200" />
              <span>기록 없는 날짜</span>
            </div>
          </div>
          <p className="mt-3 border-t border-gray-100 pt-2 font-medium text-gray-500">
            날짜 색상은 그날 평균 점수 기준이에요.
          </p>
        </div>
      )}

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
                <div ref={calendarHelpRef} className="relative">
                  <button
                    type="button"
                    onClick={toggleCalendarHelp}
                    className="flex h-8 w-8 items-center justify-center border border-[rgba(18,100,76,0.2)] bg-white text-[#18755B] transition-colors hover:border-[#18755B]"
                    aria-label="날짜 색상 설명"
                    aria-expanded={isCalendarHelpOpen}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    closeCalendarHelp();
                    onShiftMonth(-1);
                  }}
                  className="flex h-8 w-8 items-center justify-center border border-[rgba(18,100,76,0.2)] bg-white text-[#18755B]"
                  aria-label="이전 달"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeCalendarHelp();
                    onShiftMonth(1);
                  }}
                  disabled={!canGoNextHistoryMonth}
                  className={`flex h-8 w-8 items-center justify-center border border-[rgba(18,100,76,0.2)] ${canGoNextHistoryMonth
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
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-gray-500">
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
                    onClick={() => {
                      if (!dayGroup) {
                        return;
                      }
                      closeCalendarHelp();
                      onSelectDate(dateKey);
                    }}
                    className={`relative flex aspect-square min-h-9 items-center justify-center border text-sm font-bold transition-colors ${isSelected
                        ? isToday
                          ? "border-[#003D2B] bg-[#003D2B] text-white ring-2 ring-[#001A12]"
                          : `${calendarTone?.border ?? "border-[#18755B]"} ${calendarTone?.bg ?? "bg-[#E7FFF7]"} ${calendarTone?.text ?? "text-[#12644C]"
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
                <span className="text-sm font-medium text-gray-500">{selectedHistorySessions.length}개</span>
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
              <div className="mt-4 border-l-4 border-l-[#18755B] bg-[#F2FBF8] px-4 py-3">
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-[#18755B]">성장 자세 한마디</p>
                <p className="mt-1 text-sm font-medium leading-6 text-gray-700">
                  {getGrowthPostureHistoryMessage(selectedHistoryGroup.averageScore)}
                </p>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900">세션 기록</h2>
                  <p className="mt-1 text-sm font-medium text-gray-500">
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
                    className={`app-surface p-5 transition-colors ${isSelectedHistorySession ? "border-[#18755B] bg-[#F0FBF7]" : ""
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
                            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
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
                            {titleError && <p className="mt-1 text-sm font-bold text-red-600">{titleError}</p>}
                          </>
                        )}
                        <p className="mt-1 text-sm text-gray-500">
                          {formatTime(session.startedAt)}
                          {session.endedAt ? ` - ${formatTime(session.endedAt)}` : ""} · 사용 {sessionDuration}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 md:justify-end">
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-500">평균</p>
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
                                <span className="min-w-0 text-sm font-bold text-gray-500">
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
                              <p className="mt-0.5 text-sm font-medium text-gray-500">기록일 평균과 선택 날짜 평균 비교</p>
                            </div>
                            {sessionTrendSummary.currentPoint && (
                              <span className="shrink-0 text-sm font-bold tabular-nums text-[#18755B]">
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
                                  <Line type="linear" dataKey="score" stroke="#18755B" strokeWidth={1.5} dot={renderHistoryTrendDot} activeDot={renderHistoryTrendActiveDot} />
                                  {sessionTrendSummary.currentPoint && (
                                    <ReferenceDot
                                      x={sessionTrendSummary.currentPoint.time}
                                      y={sessionTrendSummary.currentPoint.score}
                                      r={5}
                                      fill="#001A12"
                                      stroke="#C4F6E8"
                                      strokeWidth={3}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          ) : (
                            <div className="flex h-[132px] items-center justify-center border border-dashed border-gray-200 bg-white px-4 text-center text-sm font-bold text-gray-500">
                              최근 점수 흐름을 보려면 기록이 조금 더 필요해요.
                            </div>
                          )}
                          <div className="mt-2 space-y-1 text-sm leading-5 text-gray-500">
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
                        {renderExtremaImageCard(session, "best")}
                        {renderExtremaImageCard(session, "worst")}
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


