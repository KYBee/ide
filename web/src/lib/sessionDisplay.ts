import type { SessionSummary } from "./api";

const REMOTE_PREFIX = "Remote ";

export function isRemoteSession(session: SessionSummary): boolean {
  return session.hostId !== "local";
}

export function displaySessionPath(session: SessionSummary, path?: string): string | undefined {
  if (!path) return undefined;
  const label = compactPath(path);
  return isRemoteSession(session) ? `${REMOTE_PREFIX}${label}` : label;
}

export function fullSessionPathTitle(session: SessionSummary, path?: string): string | undefined {
  if (!path) return undefined;
  return isRemoteSession(session) ? `${REMOTE_PREFIX}${path}` : path;
}

export function stripRemotePathPrefix(path: string): string {
  return path.startsWith(REMOTE_PREFIX) ? path.slice(REMOTE_PREFIX.length) : path;
}

function compactPath(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  if (!normalized || normalized === "~") return "~";
  if (normalized.startsWith("~/")) return normalized.split("/").filter(Boolean).at(-1) ?? "~";
  return normalized.split("/").filter(Boolean).at(-1) ?? normalized;
}
