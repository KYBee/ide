import type { AgentType, SessionSummary, TmuxPaneSummary, TmuxWindowSummary } from "./api";
import { agentCommand, agentWindowName } from "./agents";

function timestampNamePrefix(agentType: AgentType): string {
  const now = new Date();
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "-");
  const suffix = String(now.getMilliseconds()).padStart(3, "0");
  return `${agentType}-${stamp}-${suffix}`;
}

export function buildSessionLaunchInput(agentType: AgentType, cwd?: string) {
  return {
    name: timestampNamePrefix(agentType),
    type: "tmux" as const,
    agentType,
    cwd: cwd || undefined,
    command: agentCommand(agentType)
  };
}

export function getActiveTmuxWindow(windows: TmuxWindowSummary[]): TmuxWindowSummary | undefined {
  return windows.find((window) => window.active) ?? windows[0];
}

export function getActiveTmuxPane(window?: TmuxWindowSummary): TmuxPaneSummary | undefined {
  return window?.panes.find((pane) => pane.active);
}

export function buildTmuxLaunchInput(
  session: SessionSummary,
  windows: TmuxWindowSummary[],
  agentType: AgentType
) {
  const nextIndex = windows.reduce((maxIndex, tmuxWindow) => Math.max(maxIndex, tmuxWindow.index), -1) + 1;
  return {
    name: agentWindowName(agentType, nextIndex),
    cwd: session.activePanePath ?? session.cwd,
    command: agentCommand(agentType)
  };
}

export function buildTmuxSplitInput(
  session: SessionSummary,
  activeWindow: TmuxWindowSummary,
  agentType: AgentType,
  direction: "horizontal" | "vertical"
) {
  const activePane = getActiveTmuxPane(activeWindow);
  return {
    direction,
    cwd: activePane?.currentPath ?? session.activePanePath ?? session.cwd,
    command: agentCommand(agentType)
  };
}
