import { useCallback, useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  captureSnapshot,
  createTmuxWindow,
  createSession,
  insertTmuxText,
  killSession,
  killTmuxWindow,
  listSessions,
  listTmuxWindows,
  loadSkills,
  renameTmuxSession,
  renameTmuxWindow,
  sendTmuxCommand,
  selectTmuxWindow,
  splitTmuxPane,
  updateSessionMetadata
} from "./lib/api";
import type { AgentType, SessionSummary, SkillRegistry, SkillSummary, TmuxWindowSummary } from "./lib/api";
import { RightPanel } from "./components/RightPanel";
import { SessionSidebar } from "./components/SessionSidebar";
import { TerminalPane } from "./components/TerminalPane";
import { TmuxWorkspaceBar } from "./components/TmuxWorkspaceBar";
import { agentCommand, agentWindowName } from "./lib/agents";

const DEFAULT_LEFT_WIDTH = 286;
const DEFAULT_RIGHT_WIDTH = 316;
const MIN_LEFT_WIDTH = 220;
const MAX_LEFT_WIDTH = 480;
const MIN_RIGHT_WIDTH = 260;
const MAX_RIGHT_WIDTH = 560;
const MIN_WORKSPACE_WIDTH = 420;
const RESIZE_HANDLE_WIDTH = 8;

function readStoredWidth(key: string, fallback: number): number {
  const stored = Number(window.localStorage.getItem(key));
  return Number.isFinite(stored) ? stored : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export default function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [skills, setSkills] = useState<SkillRegistry>({ codex: [] });
  const [selectedId, setSelectedId] = useState<string>();
  const [startCwd, setStartCwd] = useState("~");
  const [startAgentType, setStartAgentType] = useState<AgentType>("codex");
  const [error, setError] = useState<string>();
  const [snapshot, setSnapshot] = useState<string>();
  const [tmuxWindows, setTmuxWindows] = useState<TmuxWindowSummary[]>([]);
  const [tmuxLaunchAgentType, setTmuxLaunchAgentType] = useState<AgentType>("shell");
  const [terminalNonce, setTerminalNonce] = useState(0);
  const [leftWidth, setLeftWidth] = useState(() => readStoredWidth("session-control:left-width", DEFAULT_LEFT_WIDTH));
  const [rightWidth, setRightWidth] = useState(() => readStoredWidth("session-control:right-width", DEFAULT_RIGHT_WIDTH));

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId),
    [selectedId, sessions]
  );

  const refresh = useCallback(async () => {
    try {
      const nextSessions = await listSessions();
      setSessions(nextSessions);
      setError(undefined);
      setSelectedId((currentId) => {
        if (currentId && nextSessions.some((session) => session.id === currentId)) return currentId;
        return nextSessions[0]?.id;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    loadSkills().then(setSkills).catch(() => {
      // Keep the last successful skill registry if the local dev server briefly restarts.
    });
  }, []);

  const refreshTmuxWindows = useCallback(async (session = selected) => {
    if (!session || session.type !== "tmux") {
      setTmuxWindows([]);
      return;
    }
    try {
      const result = await listTmuxWindows(session);
      setTmuxWindows(result.windows);
      setError(undefined);
    } catch (err) {
      setTmuxWindows([]);
      setError(err instanceof Error ? err.message : "Failed to load tmux windows");
    }
  }, [selected]);

  useEffect(() => {
    if (!selected || selected.type !== "tmux") {
      setTmuxWindows([]);
      return;
    }
    refreshTmuxWindows(selected);
    const timer = window.setInterval(() => refreshTmuxWindows(selected), 3000);
    return () => window.clearInterval(timer);
  }, [refreshTmuxWindows, selected]);

  useEffect(() => {
    window.localStorage.setItem("session-control:left-width", String(Math.round(leftWidth)));
  }, [leftWidth]);

  useEffect(() => {
    window.localStorage.setItem("session-control:right-width", String(Math.round(rightWidth)));
  }, [rightWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      setLeftWidth((current) => clamp(current, MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, maxLeftWidth())));
      setRightWidth((current) => clamp(current, MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, maxRightWidth())));
    };
    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  function maxLeftWidth(currentRightWidth = rightWidth): number {
    return Math.max(
      MIN_LEFT_WIDTH,
      window.innerWidth - currentRightWidth - MIN_WORKSPACE_WIDTH - RESIZE_HANDLE_WIDTH * 2
    );
  }

  function maxRightWidth(currentLeftWidth = leftWidth): number {
    return Math.max(
      MIN_RIGHT_WIDTH,
      window.innerWidth - currentLeftWidth - MIN_WORKSPACE_WIDTH - RESIZE_HANDLE_WIDTH * 2
    );
  }

  function startResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startLeftWidth = leftWidth;
    const startRightWidth = rightWidth;
    document.body.classList.add("is-resizing-panels");

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      if (side === "left") {
        setLeftWidth(clamp(startLeftWidth + delta, MIN_LEFT_WIDTH, Math.min(MAX_LEFT_WIDTH, maxLeftWidth(startRightWidth))));
        return;
      }
      setRightWidth(clamp(startRightWidth - delta, MIN_RIGHT_WIDTH, Math.min(MAX_RIGHT_WIDTH, maxRightWidth(startLeftWidth))));
    };

    const handlePointerUp = () => {
      document.body.classList.remove("is-resizing-panels");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function resetPanelWidths() {
    setLeftWidth(DEFAULT_LEFT_WIDTH);
    setRightWidth(DEFAULT_RIGHT_WIDTH);
  }

  function handleSelectSession(session: SessionSummary) {
    setSelectedId(session.id);
  }

  async function handleStartSession() {
    try {
      const now = new Date();
      const stamp = now
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\..+/, "")
        .replace("T", "-");
      const suffix = String(now.getMilliseconds()).padStart(3, "0");
      const command = agentCommand(startAgentType);
      const input = {
        name: `${startAgentType}-${stamp}-${suffix}`,
        type: "tmux" as const,
        agentType: startAgentType,
        cwd: startCwd || undefined,
        command
      };
      const result = await createSession(input);
      await refresh();
      setSelectedId(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    }
  }

  async function handlePickStartCwd() {
    try {
      if (!window.sessionControl?.selectDirectory) {
        const nextPath = window.prompt("Working directory", startCwd);
        if (nextPath) setStartCwd(nextPath);
        return;
      }
      const nextPath = await window.sessionControl.selectDirectory(startCwd);
      if (nextPath) setStartCwd(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to choose directory");
    }
  }

  async function handleKill(session: SessionSummary) {
    if (!window.confirm(`Kill ${session.name}?`)) return;
    try {
      await killSession(session);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to kill session");
    }
  }

  async function handleRename(session: SessionSummary) {
    const name = window.prompt("Rename tmux session", session.name);
    if (!name || name === session.name) return;
    try {
      await renameTmuxSession(session, name);
      await refresh();
      setSelectedId(`tmux:${name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename session");
    }
  }

  async function handleSnapshot(session: SessionSummary) {
    try {
      const result = await captureSnapshot(session);
      setSnapshot(result.snapshot || "[empty pane]");
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to capture snapshot");
    }
  }

  async function handleUpdateMetadata(
    session: SessionSummary,
    input: { displayName?: string; cwd?: string; command?: string }
  ) {
    try {
      await updateSessionMetadata(session, input);
      await refresh();
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update session");
    }
  }

  async function handleSendCommand(session: SessionSummary, command: string) {
    try {
      await sendTmuxCommand(session, command);
      await refresh();
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send command");
    }
  }

  async function handleInsertSkillPrompt(session: SessionSummary, skill: SkillSummary) {
    try {
      await insertTmuxText(session, `Use the ${skill.name} skill to `);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to insert skill prompt");
    }
  }

  async function handleCreateTmuxWindow() {
    if (!selected || selected.type !== "tmux") return;
    const nextIndex = tmuxWindows.reduce((maxIndex, tmuxWindow) => Math.max(maxIndex, tmuxWindow.index), -1) + 1;
    try {
      await createTmuxWindow(selected, {
        name: agentWindowName(tmuxLaunchAgentType, nextIndex),
        cwd: selected.activePanePath ?? selected.cwd,
        command: agentCommand(tmuxLaunchAgentType)
      });
      await refreshTmuxWindows(selected);
      await refresh();
      setTerminalNonce((value) => value + 1);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tmux window");
    }
  }

  async function handleSelectTmuxWindow(tmuxWindow: TmuxWindowSummary) {
    if (!selected || selected.type !== "tmux") return;
    try {
      await selectTmuxWindow(selected, tmuxWindow.index);
      await refreshTmuxWindows(selected);
      setTerminalNonce((value) => value + 1);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to select tmux window");
    }
  }

  async function handleRenameTmuxWindow(tmuxWindow: TmuxWindowSummary) {
    if (!selected || selected.type !== "tmux") return;
    const name = window.prompt("Rename tmux window", tmuxWindow.name);
    if (!name || name === tmuxWindow.name) return;
    try {
      await renameTmuxWindow(selected, tmuxWindow.index, name);
      await refreshTmuxWindows(selected);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename tmux window");
    }
  }

  async function handleCloseTmuxWindow(tmuxWindow: TmuxWindowSummary) {
    if (!selected || selected.type !== "tmux") return;
    if (tmuxWindows.length <= 1) {
      setError("Keep at least one tmux window. Use Kill to close the session.");
      return;
    }
    try {
      await killTmuxWindow(selected, tmuxWindow.index);
      await refreshTmuxWindows(selected);
      await refresh();
      setTerminalNonce((value) => value + 1);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close tmux window");
    }
  }

  async function handleSplitTmuxPane(direction: "horizontal" | "vertical") {
    if (!selected || selected.type !== "tmux") return;
    const activeWindow = tmuxWindows.find((window) => window.active) ?? tmuxWindows[0];
    if (!activeWindow) return;
    const activePane = activeWindow.panes.find((pane) => pane.active);
    try {
      await splitTmuxPane(selected, activeWindow.index, {
        direction,
        cwd: activePane?.currentPath ?? selected.activePanePath ?? selected.cwd,
        command: agentCommand(tmuxLaunchAgentType)
      });
      await refreshTmuxWindows(selected);
      await refresh();
      setTerminalNonce((value) => value + 1);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to split tmux pane");
    }
  }

  return (
    <div
      className="app-shell"
      style={{
        gridTemplateColumns: `${leftWidth}px ${RESIZE_HANDLE_WIDTH}px minmax(${MIN_WORKSPACE_WIDTH}px, 1fr) ${RESIZE_HANDLE_WIDTH}px ${rightWidth}px`
      }}
    >
      <SessionSidebar
        sessions={sessions}
        selectedId={selectedId}
        startCwd={startCwd}
        startAgentType={startAgentType}
        onStartCwdChange={setStartCwd}
        onPickStartCwd={handlePickStartCwd}
        onStartAgentTypeChange={setStartAgentType}
        onSelect={handleSelectSession}
        onRefresh={refresh}
        onNew={handleStartSession}
      />

      <div
        className="resize-handle left-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize session list"
        onPointerDown={(event) => startResize("left", event)}
        onDoubleClick={resetPanelWidths}
        title="Resize session list"
      />

      <main className="workspace">
        {error && <div className="error-banner">{error}</div>}
        <TmuxWorkspaceBar
          session={selected}
          windows={tmuxWindows}
          onSelectWindow={handleSelectTmuxWindow}
          onCreateWindow={handleCreateTmuxWindow}
          onRenameWindow={handleRenameTmuxWindow}
          onCloseWindow={handleCloseTmuxWindow}
          launchAgentType={tmuxLaunchAgentType}
          onLaunchAgentTypeChange={setTmuxLaunchAgentType}
          onSplitPane={handleSplitTmuxPane}
        />
        <TerminalPane key={`${selected?.id ?? "empty"}:${terminalNonce}`} session={selected} />
      </main>

      <div
        className="resize-handle right-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize details panel"
        onPointerDown={(event) => startResize("right", event)}
        onDoubleClick={resetPanelWidths}
        title="Resize details panel"
      />

      <RightPanel
        selected={selected}
        skills={skills}
        onKill={handleKill}
        onRename={handleRename}
        onSnapshot={handleSnapshot}
        onUpdateMetadata={handleUpdateMetadata}
        onSendCommand={handleSendCommand}
        onInsertSkillPrompt={handleInsertSkillPrompt}
        snapshot={snapshot}
      />
    </div>
  );
}
