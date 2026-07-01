export type SessionKind = "tmux" | "pty";
export type AgentType = "codex" | "claude" | "gemini" | "shell" | "build" | "custom";
export type SessionStatus = "running" | "idle" | "waiting_input" | "needs_approval" | "completed" | "unknown" | "error";

export interface SessionSummary {
  id: string;
  name: string;
  displayName?: string;
  hostId: string;
  type: SessionKind;
  agentType: AgentType;
  tmuxName?: string;
  cwd?: string;
  command?: string;
  status: SessionStatus;
  createdAt?: string;
  lastActiveAt?: string;
  persistent: boolean;
  attached?: number;
  windowCount?: number;
  paneCount?: number;
  activePaneId?: string;
  activePaneCommand?: string;
  activePanePath?: string;
  tags?: string[];
}

export interface TmuxPaneSummary {
  id: string;
  index: number;
  active: boolean;
  currentPath?: string;
  currentCommand?: string;
  width?: number;
  height?: number;
}

export interface TmuxWindowSummary {
  id: string;
  index: number;
  name: string;
  active: boolean;
  paneCount: number;
  layout?: string;
  panes: TmuxPaneSummary[];
}

export interface TmuxWindowsResponse {
  sessionId: string;
  windows: TmuxWindowSummary[];
}

export interface QuickLaunch {
  name: string;
  cwd: string;
  command: string;
  tmux: boolean;
  agentType?: AgentType;
  tags?: string[];
}

export interface LocalHostConfig {
  id: string;
  label: string;
  type: "local";
}

export interface AgentHostConfig {
  id: string;
  label: string;
  type: "agent";
  baseUrl: string;
}

export type HostConfig = LocalHostConfig | AgentHostConfig;

export interface AppConfig {
  hosts: HostConfig[];
  projects: QuickLaunch[];
}

export interface SkillSummary {
  id: string;
  name: string;
  description?: string;
  source: "codex";
  path: string;
  builtin: boolean;
}

export interface SkillRegistry {
  codex: SkillSummary[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function sessionRouteName(session: SessionSummary): string {
  return session.type === "pty" ? session.id.slice("pty:".length) : session.name;
}

function isRemoteTmuxSession(session: SessionSummary): boolean {
  return session.type === "tmux" && session.hostId !== "local";
}

function tmuxSessionPath(session: SessionSummary): string {
  if (isRemoteTmuxSession(session)) {
    return `/api/hosts/${encodeURIComponent(session.hostId)}/sessions/tmux/${encodeURIComponent(session.name)}`;
  }
  return `/api/sessions/tmux/${encodeURIComponent(session.name)}`;
}

export function listSessions(): Promise<SessionSummary[]> {
  return request("/api/sessions");
}

export function loadConfig(): Promise<AppConfig> {
  return request("/api/config");
}

export function loadSkills(): Promise<SkillRegistry> {
  return request("/api/skills");
}

export function createSession(input: {
  name: string;
  type: SessionKind;
  hostId?: string;
  agentType?: AgentType;
  cwd?: string;
  command?: string;
}): Promise<SessionSummary | { id: string }> {
  const { hostId, ...sessionInput } = input;
  const path = hostId && hostId !== "local"
    ? `/api/hosts/${encodeURIComponent(hostId)}/sessions`
    : "/api/sessions";
  return request(path, {
    method: "POST",
    body: JSON.stringify(sessionInput)
  });
}

export function updateSessionMetadata(
  session: SessionSummary,
  input: {
    displayName?: string;
    agentType?: AgentType;
    cwd?: string;
    command?: string;
    tags?: string[];
  }
): Promise<void> {
  if (isRemoteTmuxSession(session)) {
    return request(`${tmuxSessionPath(session)}/metadata`, {
      method: "PATCH",
      body: JSON.stringify(input)
    });
  }
  const name = sessionRouteName(session);
  return request(`/api/sessions/${session.type}/${encodeURIComponent(name)}/metadata`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function launchProject(index: number): Promise<SessionSummary | { id: string }> {
  return request(`/api/quick-launch/${index}`, { method: "POST" });
}

export function killSession(session: SessionSummary): Promise<void> {
  if (isRemoteTmuxSession(session)) {
    return request(tmuxSessionPath(session), { method: "DELETE" });
  }
  const name = sessionRouteName(session);
  return request(`/api/sessions/${session.type}/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function renameTmuxSession(session: SessionSummary, name: string): Promise<void> {
  return request(tmuxSessionPath(session), {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
}

export interface SessionSnapshot {
  sessionId: string;
  snapshot: string;
  status: SessionStatus;
  capturedAt: string;
}

export function captureSnapshot(session: SessionSummary): Promise<SessionSnapshot> {
  return request(`${tmuxSessionPath(session)}/snapshot`);
}

export function sendTmuxCommand(session: SessionSummary, command: string): Promise<void> {
  return request(`${tmuxSessionPath(session)}/send`, {
    method: "POST",
    body: JSON.stringify({ command })
  });
}

export function insertTmuxText(session: SessionSummary, text: string): Promise<void> {
  return request(`${tmuxSessionPath(session)}/input`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export function listTmuxWindows(session: SessionSummary): Promise<TmuxWindowsResponse> {
  return request(`${tmuxSessionPath(session)}/windows`);
}

export function createTmuxWindow(
  session: SessionSummary,
  input: { name?: string; cwd?: string; command?: string } = {}
): Promise<void> {
  return request(`${tmuxSessionPath(session)}/windows`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function selectTmuxWindow(session: SessionSummary, windowIndex: number): Promise<void> {
  return request(`${tmuxSessionPath(session)}/windows/${windowIndex}/select`, {
    method: "POST"
  });
}

export function renameTmuxWindow(session: SessionSummary, windowIndex: number, name: string): Promise<void> {
  return request(`${tmuxSessionPath(session)}/windows/${windowIndex}`, {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
}

export function killTmuxWindow(session: SessionSummary, windowIndex: number): Promise<void> {
  return request(`${tmuxSessionPath(session)}/windows/${windowIndex}`, {
    method: "DELETE"
  });
}

export function splitTmuxPane(
  session: SessionSummary,
  windowIndex: number,
  input: { direction: "horizontal" | "vertical"; cwd?: string; command?: string }
): Promise<void> {
  return request(`${tmuxSessionPath(session)}/windows/${windowIndex}/panes/split`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function selectTmuxPane(session: SessionSummary, paneId: string): Promise<void> {
  return request(`${tmuxSessionPath(session)}/panes/${encodeURIComponent(paneId)}/select`, {
    method: "POST"
  });
}

export function killTmuxPane(session: SessionSummary, paneId: string): Promise<void> {
  return request(`${tmuxSessionPath(session)}/panes/${encodeURIComponent(paneId)}`, {
    method: "DELETE"
  });
}
