import type { PostureResult } from "@/lib/types";

export function averageScores(scores: number[]) {
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

export function withPostureScore(posture: PostureResult, score: number, warningThreshold: number): PostureResult {
  return { ...posture, score, isBadPosture: score <= warningThreshold };
}

export function createLiveScorePoint(score: number, now: number) {
  return {
    id: `live-${now}`,
    time: new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Seoul",
    }).format(new Date(now)),
    timestamp: now,
    score,
  };
}

