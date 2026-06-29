export type SessionKind = "tmux" | "pty";
export type AgentType = "codex" | "claude" | "gemini" | "shell" | "build" | "custom";
export type SessionStatus = "running" | "idle" | "waiting_input" | "needs_approval" | "completed" | "unknown" | "error";

export interface SessionSummary {
  id: string;
  name: string;
  displayName?: string;
  hostId: "local";
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

export interface AppConfig {
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
  agentType?: AgentType;
  cwd?: string;
  command?: string;
}): Promise<SessionSummary | { id: string }> {
  return request("/api/sessions", {
    method: "POST",
    body: JSON.stringify(input)
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
  const name = session.type === "pty" ? session.id.slice("pty:".length) : session.name;
  return request(`/api/sessions/${session.type}/${encodeURIComponent(name)}/metadata`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function launchProject(index: number): Promise<SessionSummary | { id: string }> {
  return request(`/api/quick-launch/${index}`, { method: "POST" });
}

export function killSession(session: SessionSummary): Promise<void> {
  const name = session.type === "pty" ? session.id.slice("pty:".length) : session.name;
  return request(`/api/sessions/${session.type}/${encodeURIComponent(name)}`, { method: "DELETE" });
}

export function renameTmuxSession(session: SessionSummary, name: string): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}`, {
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
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/snapshot`);
}

export function sendTmuxCommand(session: SessionSummary, command: string): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/send`, {
    method: "POST",
    body: JSON.stringify({ command })
  });
}

export function insertTmuxText(session: SessionSummary, text: string): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/input`, {
    method: "POST",
    body: JSON.stringify({ text })
  });
}

export function listTmuxWindows(session: SessionSummary): Promise<TmuxWindowsResponse> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/windows`);
}

export function createTmuxWindow(
  session: SessionSummary,
  input: { name?: string; cwd?: string; command?: string } = {}
): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/windows`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function selectTmuxWindow(session: SessionSummary, windowIndex: number): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/windows/${windowIndex}/select`, {
    method: "POST"
  });
}

export function renameTmuxWindow(session: SessionSummary, windowIndex: number, name: string): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/windows/${windowIndex}`, {
    method: "PATCH",
    body: JSON.stringify({ name })
  });
}

export function killTmuxWindow(session: SessionSummary, windowIndex: number): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/windows/${windowIndex}`, {
    method: "DELETE"
  });
}

export function splitTmuxPane(
  session: SessionSummary,
  windowIndex: number,
  input: { direction: "horizontal" | "vertical"; cwd?: string; command?: string }
): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/windows/${windowIndex}/panes/split`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function selectTmuxPane(session: SessionSummary, paneId: string): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/panes/${encodeURIComponent(paneId)}/select`, {
    method: "POST"
  });
}

export function killTmuxPane(session: SessionSummary, paneId: string): Promise<void> {
  return request(`/api/sessions/tmux/${encodeURIComponent(session.name)}/panes/${encodeURIComponent(paneId)}`, {
    method: "DELETE"
  });
}
