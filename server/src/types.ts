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
  tokenEnv?: string;
  token?: string;
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
