import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expandHome } from "./config.js";
import { cleanProcessEnv, TERMINAL_ENV_UNSET_KEYS } from "./env.js";
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

const INTERNAL_TMUX_SESSION_NAMES = new Set([
  "session-control-server",
  "session-control-web",
  "session-control-desktop"
]);

interface TmuxPaneInfo {
  paneId: string;
  active: boolean;
  currentPath?: string;
  currentCommand?: string;
}

function runTmux(args: string[]) {
  return execFileAsync("tmux", args, { env: cleanProcessEnv() });
}

async function unsetNoColor(target: string): Promise<void> {
  try {
    await runTmux(["set-environment", "-u", "-t", target, "NO_COLOR"]);
  } catch {
    // The variable may not exist on older or freshly started tmux servers.
  }
}

function tmuxLines(stdout: string): string[] {
  return stdout.split("\n").filter(Boolean);
}

export function isInternalSessionControlTmuxSession(name: string): boolean {
  return INTERNAL_TMUX_SESSION_NAMES.has(name);
}

function shellPath(): string {
  return process.env.SHELL ?? "/bin/zsh";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function appendColorEnvironment(args: string[]): void {
  args.push(
    "-e",
    "CLICOLOR=1",
    "-e",
    "COLORTERM=truecolor",
    "-e",
    "FORCE_COLOR=3"
  );
}

export function buildTmuxShellCommand(command: string): string {
  const shell = shellPath();
  const colorEnvironment = [
    `unset ${TERMINAL_ENV_UNSET_KEYS.map(shellQuote).join(" ")}`,
    "export CLICOLOR=1 COLORTERM=truecolor FORCE_COLOR=3"
  ].join("; ");
  const interactiveCommand = `${colorEnvironment}; ${command}; exec ${shellQuote(shell)} -l`;
  return `exec ${shellQuote(shell)} -lic ${shellQuote(interactiveCommand)}`;
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
    const { stdout } = await runTmux(["list-panes", "-a", "-F", TMUX_PANE_FORMAT]);
    const panesBySession = new Map<string, TmuxPaneInfo[]>();
    for (const line of tmuxLines(stdout)) {
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
      runTmux(["list-sessions", "-F", TMUX_FORMAT]),
      listTmuxPanesBySession()
    ]);
    return tmuxLines(stdout)
      .filter((line) => {
        const [_id, name] = line.split(FIELD_SEPARATOR);
        return !isInternalSessionControlTmuxSession(name);
      })
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
    const { stdout } = await runTmux(["list-sessions", "-F", "#{session_name}"]);
    const existingNames = new Set(tmuxLines(stdout));
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
    "NPM_CONFIG_PREFIX="
  ];
  appendColorEnvironment(args);
  args.push("-s", input.name);
  if (input.cwd) args.push("-c", expandHome(input.cwd));
  if (input.command) args.push(buildTmuxShellCommand(input.command));
  await runTmux(args);
  await unsetNoColor(targetSession(input.name));
}

export async function listTmuxWindows(name: string): Promise<TmuxWindowSummary[]> {
  const [{ stdout: windowStdout }, { stdout: paneStdout }] = await Promise.all([
    runTmux(["list-windows", "-t", targetSession(name), "-F", TMUX_WINDOW_FORMAT]),
    runTmux(["list-panes", "-t", targetSession(name), "-F", TMUX_WINDOW_PANE_FORMAT])
  ]);

  const panesByWindow = new Map<string, TmuxPaneSummary[]>();
  for (const line of tmuxLines(paneStdout)) {
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

  return tmuxLines(windowStdout)
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
  appendColorEnvironment(args);
  if (input.name) args.push("-n", input.name);
  if (input.cwd) args.push("-c", expandHome(input.cwd));
  if (input.command) args.push(buildTmuxShellCommand(input.command));
  await unsetNoColor(targetSession(sessionName));
  await runTmux(args);
}

export async function selectTmuxWindow(sessionName: string, windowIndex: number): Promise<void> {
  await runTmux(["select-window", "-t", targetWindow(sessionName, windowIndex)]);
}

export async function renameTmuxWindow(sessionName: string, windowIndex: number, nextName: string): Promise<void> {
  await runTmux(["rename-window", "-t", targetWindow(sessionName, windowIndex), nextName]);
}

export async function killTmuxWindow(sessionName: string, windowIndex: number): Promise<void> {
  await runTmux(["kill-window", "-t", targetWindow(sessionName, windowIndex)]);
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
  appendColorEnvironment(args);
  if (input.cwd) args.push("-c", expandHome(input.cwd));
  if (input.command) args.push(buildTmuxShellCommand(input.command));
  await unsetNoColor(targetSession(sessionName));
  await runTmux(args);
}

export async function selectTmuxPane(paneId: string): Promise<void> {
  await runTmux(["select-pane", "-t", paneId]);
}

export async function killTmuxPane(paneId: string): Promise<void> {
  await runTmux(["kill-pane", "-t", paneId]);
}

export async function killTmuxSession(name: string): Promise<void> {
  await runTmux(["kill-session", "-t", targetSession(name)]);
}

export async function renameTmuxSession(name: string, nextName: string): Promise<void> {
  await runTmux(["rename-session", "-t", targetSession(name), nextName]);
}

export async function captureTmuxPane(name: string, lines = 80): Promise<string> {
  const { stdout } = await runTmux(["capture-pane", "-p", "-t", targetActivePane(name), "-S", `-${lines}`]);
  return stdout.trimEnd();
}

export async function sendKeysToTmuxSession(name: string, command: string): Promise<void> {
  await runTmux(["send-keys", "-t", targetActivePane(name), command, "Enter"]);
}

export async function sendLiteralToTmuxSession(name: string, text: string): Promise<void> {
  await runTmux(["send-keys", "-l", "-t", targetActivePane(name), text]);
}

export function detectSessionStatus(snapshot: string): SessionStatus {
  const text = snapshot.toLowerCase();
  if (/(error|failed|exception|traceback|panic)/i.test(text)) return "error";
  if (/(approve|approval|permission|allow\?|deny\?)/i.test(text)) return "needs_approval";
  if (/(waiting for input|input required|press enter|continue\?|yes\/no|y\/n)/i.test(text)) return "waiting_input";
  if (/(done|completed|finished successfully)/i.test(text)) return "completed";
  return "running";
}
