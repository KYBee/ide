import { captureTmuxPane, detectSessionStatus } from "./tmux.js";
import type { SessionSummary } from "./types.js";

const DEFAULT_STATUS_SCAN_LIMIT = 50;

export function statusScanLimit(): number {
  const configured = process.env.SESSION_CONTROL_STATUS_SCAN_LIMIT;
  if (!configured) return DEFAULT_STATUS_SCAN_LIMIT;

  const limit = Number(configured);
  if (!Number.isFinite(limit) || limit < 0) return DEFAULT_STATUS_SCAN_LIMIT;
  return Math.floor(limit);
}

export async function enrichTmuxSessionsWithStatus(
  sessions: SessionSummary[],
  limit = statusScanLimit()
): Promise<SessionSummary[]> {
  return Promise.all(
    sessions.map(async (session, index) => {
      if (index >= limit) return session;

      try {
        const snapshot = await captureTmuxPane(session.name, 30);
        return { ...session, status: detectSessionStatus(snapshot) };
      } catch {
        return session;
      }
    })
  );
}
