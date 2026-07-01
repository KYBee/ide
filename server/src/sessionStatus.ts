import { aggregateSessionStatus, captureTmuxPaneSnapshots, detectSessionStatus } from "./tmux.js";
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
        const paneSnapshots = await captureTmuxPaneSnapshots(session.name, 30);
        const status = aggregateSessionStatus(
          paneSnapshots.map((pane) => detectSessionStatus(pane.snapshot, pane.agentType))
        );
        return { ...session, status };
      } catch {
        return session;
      }
    })
  );
}
