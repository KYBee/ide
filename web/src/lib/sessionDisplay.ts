import type { SessionSummary } from "./api";

const REMOTE_PREFIX = "Remote ";

export function isRemoteSession(session: SessionSummary): boolean {
  return session.hostId !== "local";
}

export function displaySessionPath(session: SessionSummary, path?: string): string | undefined {
  if (!path) return undefined;
  return isRemoteSession(session) ? `${REMOTE_PREFIX}${path}` : path;
}

export function stripRemotePathPrefix(path: string): string {
  return path.startsWith(REMOTE_PREFIX) ? path.slice(REMOTE_PREFIX.length) : path;
}
