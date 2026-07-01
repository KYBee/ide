import { WebSocket } from "ws";
import { loadConfig } from "./config.js";
import { inferAgentType } from "./metadataStore.js";
import { serverMode } from "./serverMode.js";
import { detectSessionStatus } from "./tmux.js";
import type { AgentHostConfig, AgentType, SessionStatus, SessionSummary, TmuxWindowsResponse } from "./types.js";

interface RemoteSnapshot {
  sessionId: string;
  snapshot: string;
  status: SessionSummary["status"];
  capturedAt: string;
}

function agentHosts(): AgentHostConfig[] {
  if (serverMode() === "agent") return [];
  return loadConfig().hosts.filter((host): host is AgentHostConfig => host.type === "agent");
}

export function listAgentHosts(): AgentHostConfig[] {
  return agentHosts();
}

export function getAgentHost(hostId: string): AgentHostConfig | undefined {
  return agentHosts().find((host) => host.id === hostId);
}

function tokenForHost(host: AgentHostConfig): string | undefined {
  if (host.tokenEnv) return process.env[host.tokenEnv];
  return host.token;
}

function authHeaders(host: AgentHostConfig): Record<string, string> {
  const token = tokenForHost(host);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function requestAgent<T>(host: AgentHostConfig, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${host.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(host),
      ...init.headers
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`${host.id}: ${body.error || response.statusText}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function toRemoteSession(host: AgentHostConfig, session: SessionSummary): SessionSummary {
  const tmuxName = session.tmuxName ?? session.name;
  const agentType = remoteAgentType(session);
  return {
    ...session,
    id: session.type === "tmux" ? `tmux:${host.id}:${tmuxName}` : `${session.type}:${host.id}:${session.name}`,
    hostId: host.id,
    name: tmuxName,
    tmuxName,
    agentType,
    status: remoteStatus(session.status, session.activePaneCommand, agentType),
    tags: [...(session.tags ?? []), host.id]
  };
}

function remoteAgentType(session: SessionSummary): AgentType {
  if (session.agentType !== "custom") return session.agentType;
  const inferred = inferAgentType([
    session.name,
    session.displayName,
    session.command,
    session.activePaneCommand,
    session.cwd,
    session.activePanePath
  ].filter(Boolean).join(" "));
  return inferred;
}

function remoteStatus(status: SessionStatus, command: string | undefined, agentType: AgentType): SessionStatus {
  if (status !== "unknown") return status;
  if (agentType === "shell") return "idle";
  if (command && !["zsh", "bash", "fish", "sh"].includes(command)) return "running";
  return status;
}

export async function listAgentHostSessions(): Promise<SessionSummary[]> {
  const hosts = listAgentHosts();
  const results = await Promise.allSettled(
    hosts.map(async (host) => {
      const sessions = await requestAgent<SessionSummary[]>(host, "/api/sessions");
      const remoteSessions = sessions.filter((session) => session.type === "tmux").map((session) => toRemoteSession(host, session));
      return Promise.all(remoteSessions.map((session) => refreshRemoteStatus(host, session)));
    })
  );

  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

async function refreshRemoteStatus(host: AgentHostConfig, session: SessionSummary): Promise<SessionSummary> {
  try {
    const snapshot = await requestAgent<RemoteSnapshot>(
      host,
      `/api/sessions/tmux/${encodeURIComponent(session.name)}/snapshot`
    );
    return {
      ...session,
      status: detectSessionStatus(snapshot.snapshot, session.agentType)
    };
  } catch {
    return session;
  }
}

export async function captureAgentSnapshot(host: AgentHostConfig, sessionName: string): Promise<RemoteSnapshot> {
  const snapshot = await requestAgent<RemoteSnapshot>(
    host,
    `/api/sessions/tmux/${encodeURIComponent(sessionName)}/snapshot`
  );
  return {
    ...snapshot,
    sessionId: `tmux:${host.id}:${sessionName}`
  };
}

export async function listAgentTmuxWindows(host: AgentHostConfig, sessionName: string): Promise<TmuxWindowsResponse> {
  const windows = await requestAgent<TmuxWindowsResponse>(
    host,
    `/api/sessions/tmux/${encodeURIComponent(sessionName)}/windows`
  );
  return {
    ...windows,
    sessionId: `tmux:${host.id}:${sessionName}`
  };
}

export function createAgentTerminalSocket(host: AgentHostConfig, sessionName: string): WebSocket {
  const url = new URL(host.baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/term";
  url.search = new URLSearchParams({ session: `tmux:${sessionName}` }).toString();

  return new WebSocket(url, {
    headers: authHeaders(host)
  });
}
