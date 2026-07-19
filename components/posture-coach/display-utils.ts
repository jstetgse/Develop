import type { PostureRecommendationArea, PostureResult, SideMode } from "@/lib/types";

export function getPostureAreaThreshold(area: PostureRecommendationArea) {
  if (area === "neck") {
    return 85;
  }
  if (area === "torso") {
    return 80;
  }
  return 75;
}

export function getPostureAreaLabel(area: PostureRecommendationArea) {
  if (area === "neck") {
    return "목";
  }
  if (area === "torso") {
    return "허리";
  }
  return "안정성";
}


export function formatMinutes(value: number) {
  if (!value) {
    return "0m";
  }
  if (value < 60) {
    return `${value}m`;
  }
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function getCameraErrorMessage(error: unknown) {
  if (
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    window.location.hostname !== "localhost"
  ) {
    return "카메라는 HTTPS 또는 localhost에서만 사용할 수 있습니다.";
  }

  const name =
    typeof error === "object" && error && "name" in error
      ? String((error as { name?: unknown }).name)
      : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return "카메라 권한이 거부되었습니다. 브라우저 권한을 확인해주세요.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "사용 가능한 카메라를 찾을 수 없습니다.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "다른 앱에서 카메라를 사용 중입니다.";
  }
  return "카메라를 시작하지 못했습니다. 권한과 보안 설정을 확인해주세요.";
}

export function getStatusFromScore(score: number | null) {
  if (score === null) {
    return "waiting";
  }
  if (score >= 80) {
    return "good";
  }
  if (score >= 60) {
    return "warning";
  }
  return "danger";
}

export function getStatusLabel(score: number | null) {
  const status = getStatusFromScore(score);
  if (status === "good") {
    return "좋음";
  }
  if (status === "warning") {
    return "주의";
  }
  if (status === "danger") {
    return "위험";
  }
  return "대기";
}

export function getHomeScoreTone(score: number | null) {
  const status = getStatusFromScore(score);

  if (status === "good") {
    return {
      badgeClass: "bg-[#C4F6E8] text-[#18755B]",
      barClass: "bg-[#39AF8E]",
      trackClass: "bg-[#D6F3EB]",
    };
  }

  if (status === "warning") {
    return {
      badgeClass: "bg-amber-100 text-amber-800",
      barClass: "bg-amber-500",
      trackClass: "bg-amber-100",
    };
  }

  if (status === "danger") {
    return {
      badgeClass: "bg-red-100 text-red-700",
      barClass: "bg-red-600",
      trackClass: "bg-red-100",
    };
  }

  return {
    badgeClass: "bg-gray-100 text-gray-500",
    barClass: "bg-gray-300",
    trackClass: "bg-[#D6F3EB]",
  };
}

export function getIssueText(posture: PostureResult) {
  if (!posture.metrics) {
    return posture.feedbackMessage;
  }
  const activeFeedback = posture.feedbackItems.filter((item) => item.severity !== "good");
  if (activeFeedback.length > 1) {
    return activeFeedback.map((item) => item.message).join(" ");
  }
  if (activeFeedback.length === 1) {
    return activeFeedback[0].message;
  }
  if (posture.mainIssue === "neck") {
    return "목이 앞으로 기울어져 있어요. 턱을 살짝 당겨주세요.";
  }
  if (posture.mainIssue === "torso") {
    return "상체가 기울어져 있어요. 허리를 세워주세요.";
  }
  if (posture.mainIssue === "stability") {
    return "자세가 흔들리고 있어요. 화면 중앙에 편하게 앉아주세요.";
  }
  return "좋은 자세를 유지하고 있어요.";
}

export function getWeightMessage(posture: PostureResult) {
  const load = posture.metrics?.estimatedNeckLoadKg;
  if (typeof load !== "number") {
    return posture.feedbackMessage;
  }
  if (load < 12) {
    return "지금 목에는 피카츄 한 마리가 올라가 있어요.";
  }
  if (load < 20) {
    return "목 부담이 조금 커졌어요. 어깨를 편하게 내려주세요.";
  }
  return "목에 큰 부담이 걸리고 있어요. 자세를 바로 세워주세요.";
}

export function getSideModeLabel(mode: SideMode) {
  if (mode === "left") {
    return "왼쪽 옆모습 고정";
  }
  return "오른쪽 옆모습 고정";
}

export function getAnalysisSideLabel(posture: PostureResult, preferredSideMode: SideMode) {
  if (!posture.analysisSide) {
    return `현재 분석 기준: ${getSideModeLabel(preferredSideMode)}`;
  }

  const sideLabel = posture.analysisSide === "left" ? "왼쪽 옆모습" : "오른쪽 옆모습";
  return `현재 분석 기준: ${sideLabel} 고정`;
}

export function getFeedbackSeverityLabel(severity: PostureResult["feedbackItems"][number]["severity"]) {
  if (severity === "good") {
    return "좋음";
  }
  if (severity === "caution") {
    return "주의";
  }
  return "경고";
}

export function getFeedbackSeverityClass(severity: PostureResult["feedbackItems"][number]["severity"]) {
  if (severity === "good") {
    return "border-green-100 bg-green-50 text-green-800";
  }
  if (severity === "caution") {
    return "border-yellow-100 bg-yellow-50 text-yellow-800";
  }
  return "border-red-100 bg-red-50 text-red-800";
}



