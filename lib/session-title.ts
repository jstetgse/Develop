import type { SessionSummary } from "@/lib/types";

export const SESSION_TITLE_MAX_LENGTH = 30;

export function normalizeSessionTitle(title: string) {
  return title.trim().slice(0, SESSION_TITLE_MAX_LENGTH);
}

export function sanitizeSessionTitleKey(value: string) {
  return value.replace(/\//g, "_");
}

export function getSessionTitleKey(session: Pick<SessionSummary, "sessionId" | "startedAt">, dateKey: string) {
  const rawKey = session.sessionId || `${dateKey}_${session.startedAt}`;
  return sanitizeSessionTitleKey(rawKey);
}
