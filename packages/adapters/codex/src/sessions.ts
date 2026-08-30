import type { SessionSummary } from "./hub.js";

export type SessionStatusFilter = "all" | "live" | "ended";

export interface SessionFilter {
  query: string;
  status: SessionStatusFilter;
  model?: string;
  effort?: string;
}

export function filterSessions(
  sessions: readonly SessionSummary[],
  filter: SessionFilter,
): SessionSummary[] {
  const needle = filter.query.trim().toLowerCase();
  return sessions.filter((session) => {
    if (needle) {
      const haystack = `${session.prompt} ${session.id}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filter.status === "live" && !session.live) return false;
    if (filter.status === "ended" && session.live) return false;
    if (filter.model && session.model !== filter.model) return false;
    if (filter.effort && session.effort !== filter.effort) return false;
    return true;
  });
}

export function sessionModels(sessions: readonly SessionSummary[]): string[] {
  return unique(sessions.map((session) => session.model));
}

export function sessionEfforts(sessions: readonly SessionSummary[]): string[] {
  return unique(sessions.map((session) => session.effort));
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

const SMOKE_SESSION_ID = "smoke";

export function pickStudioSession(
  sessions: readonly SessionSummary[],
  options: { selected?: string | null; userPicked?: boolean } = {},
): string | undefined {
  if (!sessions.length) return undefined;
  const selected = options.selected ?? undefined;
  const listed = (id: string | undefined) =>
    Boolean(id && sessions.some((session) => session.id === id));

  if (options.userPicked && listed(selected)) return selected;

  const newestLiveReal = [...sessions]
    .reverse()
    .find((session) => session.live && session.id !== SMOKE_SESSION_ID);
  if (newestLiveReal) return newestLiveReal.id;

  const newestReal = [...sessions].reverse().find((session) => session.id !== SMOKE_SESSION_ID);
  if (newestReal) return newestReal.id;

  return sessions[sessions.length - 1]?.id;
}
