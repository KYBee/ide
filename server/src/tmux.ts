import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expandHome } from "./config.js";
import { cleanProcessEnv } from "./env.js";
import { inferAgentType } from "./metadataStore.js";
import type { SessionStatus, SessionSummary, TmuxPaneSummary, TmuxWindowSummary } from "./types.js";

const execFileAsync = promisify(execFile);

const FIELD_SEPARATOR = "@@SC@@";
const TMUX_FORMAT = [
  "#{session_id}",
  "#{session_name}",
  "#{session_created}",
  "#{session_last_attached}",
  "#{session_attached}",
  "#{session_windows}"
].join(FIELD_SEPARATOR);

const TMUX_PANE_FORMAT = [
  "#{session_name}",
  "#{pane_id}",
  "#{pane_active}",
  "#{pane_current_path}",
  "#{pane_current_command}"
].join(FIELD_SEPARATOR);

const TMUX_WINDOW_FORMAT = [
  "#{window_id}",
  "#{window_index}",
  "#{window_name}",
  "#{window_active}",
  "#{window_panes}",
  "#{window_layout}"
].join(FIELD_SEPARATOR);

const TMUX_WINDOW_PANE_FORMAT = [
  "#{window_id}",
  "#{window_index}",
  "#{pane_id}",
  "#{pane_index}",
  "#{pane_active}",
  "#{pane_current_path}",
  "#{pane_current_command}",
  "#{pane_width}",
  "#{pane_height}"
].join(FIELD_SEPARATOR);

interface TmuxPaneInfo {
  paneId: string;
  active: boolean;
  currentPath?: string;
  currentCommand?: string;
}

function shellCommand(command: string): string {
  return `${command}; exec ${process.env.SHELL ?? "/bin/zsh"}`;
}

function targetSession(name: string): string {
  return `=${name}`;
}

function targetActivePane(name: string): string {
  return `=${name}:`;
}

function targetWindow(name: string, windowIndex: number): string {
  return `=${name}:${windowIndex}`;
}

function isNoTmuxServerError(error: any): boolean {
  const message = `${error?.stderr ?? ""}\n${error?.message ?? ""}`;
  return message.includes("no server running") || message.includes("error connecting to");
}

async function listTmuxPanesBySession(): Promise<Map<string, TmuxPaneInfo[]>> {
  try {
    const { stdout } = await execFileAsync("tmux", ["list-panes", "-a", "-F", TMUX_PANE_FORMAT], {
      env: cleanProcessEnv()
    });
    const panesBySession = new Map<string, TmuxPaneInfo[]>();
    for (const line of stdout.split("\n").filter(Boolean)) {
      const [sessionName, paneId, active, currentPath, currentCommand] = line.split(FIELD_SEPARATOR);
      const panes = panesBySession.get(sessionName) ?? [];
      panes.push({
        paneId,
        active: active === "1",
        currentPath: currentPath || undefined,
        currentCommand: currentCommand || undefined
      });
      panesBySession.set(sessionName, panes);
    }
    return panesBySession;
  } catch (error: any) {
    if (isNoTmuxServerError(error)) return new Map();
    throw error;
  }
}

export async function listTmuxSessions(): Promise<SessionSummary[]> {
  try {
    const [{ stdout }, panesBySession] = await Promise.all([
      execFileAsync("tmux", ["list-sessions", "-F", TMUX_FORMAT], { env: cleanProcessEnv() }),
      listTmuxPanesBySession()
    ]);
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, name, created, lastAttached, attached, windows] = line.split(FIELD_SEPARATOR);
        const panes = panesBySession.get(name) ?? [];
        const activePane = panes.find((pane) => pane.active) ?? panes[0];
        const currentCommand = activePane?.currentCommand;
        return {
          id: `tmux:${name}`,
          name,
          hostId: "local",
          type: "tmux",
          agentType: inferAgentType(`${name} ${currentCommand ?? ""}`),
          tmuxName: name,
          cwd: activePane?.currentPath,
          command: currentCommand,
          status: "running",
          persistent: true,
          attached: Number(attached) || 0,
          windowCount: Number(windows) || undefined,
          paneCount: panes.length || undefined,
          activePaneId: activePane?.paneId,
          activePaneCommand: currentCommand,
          activePanePath: activePane?.currentPath,
          createdAt: created ? new Date(Number(created) * 1000).toISOString() : undefined,
          lastActiveAt: lastAttached && lastAttached !== "0"
            ? new Date(Number(lastAttached) * 1000).toISOString()
            : undefined,
          tags: id ? [id] : []
        };
      });
  } catch (error: any) {
    if (isNoTmuxServerError(error)) return [];
    throw error;
  }
}

export async function resolveUniqueTmuxSessionName(baseName: string): Promise<string> {
  const normalizedBaseName = baseName.trim() || "session";
  try {
    const { stdout } = await execFileAsync("tmux", ["list-sessions", "-F", "#{session_name}"], {
      env: cleanProcessEnv()
    });
    const existingNames = new Set(stdout.split("\n").filter(Boolean));
    if (!existingNames.has(normalizedBaseName)) return normalizedBaseName;

    let index = 2;
    while (existingNames.has(`${normalizedBaseName}-${index}`)) {
      index += 1;
    }
    return `${normalizedBaseName}-${index}`;
  } catch (error: any) {
    if (isNoTmuxServerError(error)) return normalizedBaseName;
    throw error;
  }
}

export async function createTmuxSession(input: {
  name: string;
  cwd?: string;
  command?: string;
}): Promise<void> {
  const args = [
    "new-session",
    "-d",
    "-e",
    "npm_config_prefix=",
    "-e",
    "NPM_CONFIG_PREFIX=",
    "-s",
    input.name
  ];
  if (input.cwd) args.push("-c", expandHome(input.cwd));
  if (input.command) args.push(shellCommand(input.command));
  await execFileAsync("tmux", args, { env: cleanProcessEnv() });
}

export async function listTmuxWindows(name: string): Promise<TmuxWindowSummary[]> {
  const [{ stdout: windowStdout }, { stdout: paneStdout }] = await Promise.all([
    execFileAsync("tmux", ["list-windows", "-t", targetSession(name), "-F", TMUX_WINDOW_FORMAT], {
      env: cleanProcessEnv()
    }),
    execFileAsync("tmux", ["list-panes", "-t", targetSession(name), "-F", TMUX_WINDOW_PANE_FORMAT], {
      env: cleanProcessEnv()
    })
  ]);

  const panesByWindow = new Map<string, TmuxPaneSummary[]>();
  for (const line of paneStdout.split("\n").filter(Boolean)) {
    const [windowId, _windowIndex, paneId, paneIndex, active, currentPath, currentCommand, width, height] = line.split(FIELD_SEPARATOR);
    const panes = panesByWindow.get(windowId) ?? [];
    panes.push({
      id: paneId,
      index: Number(paneIndex),
      active: active === "1",
      currentPath: currentPath || undefined,
      currentCommand: currentCommand || undefined,
      width: Number(width) || undefined,
      height: Number(height) || undefined
    });
    panesByWindow.set(windowId, panes);
  }

  return windowStdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, index, name, active, paneCount, layout] = line.split(FIELD_SEPARATOR);
      return {
        id,
        index: Number(index),
        name,
        active: active === "1",
        paneCount: Number(paneCount) || 0,
        layout: layout || undefined,
        panes: panesByWindow.get(id) ?? []
      };
    });
}

export async function createTmuxWindow(sessionName: string, input: {
  name?: string;
  cwd?: string;
  command?: string;
} = {}): Promise<void> {
  const args = ["new-window", "-t", targetSession(sessionName)];
  if (input.name) args.push("-n", input.name);
  if (input.cwd) args.push("-c", expandHome(input.cwd));
  if (input.command) args.push(shellCommand(input.command));
  await execFileAsync("tmux", args, { env: cleanProcessEnv() });
}

export async function selectTmuxWindow(sessionName: string, windowIndex: number): Promise<void> {
  await execFileAsync("tmux", ["select-window", "-t", targetWindow(sessionName, windowIndex)], {
    env: cleanProcessEnv()
  });
}

export async function renameTmuxWindow(sessionName: string, windowIndex: number, nextName: string): Promise<void> {
  await execFileAsync("tmux", ["rename-window", "-t", targetWindow(sessionName, windowIndex), nextName], {
    env: cleanProcessEnv()
  });
}

export async function killTmuxWindow(sessionName: string, windowIndex: number): Promise<void> {
  await execFileAsync("tmux", ["kill-window", "-t", targetWindow(sessionName, windowIndex)], {
    env: cleanProcessEnv()
  });
}

export async function splitTmuxPane(sessionName: string, windowIndex: number, input: {
  direction: "horizontal" | "vertical";
  cwd?: string;
  command?: string;
}): Promise<void> {
  const args = [
    "split-window",
    input.direction === "horizontal" ? "-h" : "-v",
    "-t",
    targetWindow(sessionName, windowIndex)
  ];
  if (input.cwd) args.push("-c", expandHome(input.cwd));
  if (input.command) args.push(shellCommand(input.command));
  await execFileAsync("tmux", args, { env: cleanProcessEnv() });
}

export async function selectTmuxPane(paneId: string): Promise<void> {
  await execFileAsync("tmux", ["select-pane", "-t", paneId], {
    env: cleanProcessEnv()
  });
}

export async function killTmuxPane(paneId: string): Promise<void> {
  await execFileAsync("tmux", ["kill-pane", "-t", paneId], {
    env: cleanProcessEnv()
  });
}

export async function killTmuxSession(name: string): Promise<void> {
  await execFileAsync("tmux", ["kill-session", "-t", targetSession(name)], { env: cleanProcessEnv() });
}

export async function renameTmuxSession(name: string, nextName: string): Promise<void> {
  await execFileAsync("tmux", ["rename-session", "-t", targetSession(name), nextName], { env: cleanProcessEnv() });
}

export async function captureTmuxPane(name: string, lines = 80): Promise<string> {
  const { stdout } = await execFileAsync("tmux", ["capture-pane", "-p", "-t", targetActivePane(name), "-S", `-${lines}`], {
    env: cleanProcessEnv()
  });
  return stdout.trimEnd();
}

export async function sendKeysToTmuxSession(name: string, command: string): Promise<void> {
  await execFileAsync("tmux", ["send-keys", "-t", targetActivePane(name), command, "Enter"], {
    env: cleanProcessEnv()
  });
}

export async function sendLiteralToTmuxSession(name: string, text: string): Promise<void> {
  await execFileAsync("tmux", ["send-keys", "-l", "-t", targetActivePane(name), text], {
    env: cleanProcessEnv()
  });
}

export function detectSessionStatus(snapshot: string): SessionStatus {
  const text = snapshot.toLowerCase();
  if (/(error|failed|exception|traceback|panic)/i.test(text)) return "error";
  if (/(approve|approval|permission|allow\?|deny\?)/i.test(text)) return "needs_approval";
  if (/(waiting for input|input required|press enter|continue\?|yes\/no|y\/n)/i.test(text)) return "waiting_input";
  if (/(done|completed|finished successfully)/i.test(text)) return "completed";
  return "running";
}
