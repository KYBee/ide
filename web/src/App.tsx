import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTmuxWindow,
  createSession,
  insertTmuxText,
  killSession,
  killTmuxWindow,
  listSessions,
  listTmuxWindows,
  loadSkills,
  renameTmuxWindow,
  selectTmuxWindow,
  splitTmuxPane,
  updateSessionMetadata
} from "./lib/api";
import type { AgentType, SessionSummary, SkillRegistry, SkillSummary, TmuxWindowSummary } from "./lib/api";
import { RightPanel } from "./components/RightPanel";
import { SessionSidebar } from "./components/SessionSidebar";
import { TerminalPane } from "./components/TerminalPane";
import { TmuxWorkspaceBar } from "./components/TmuxWorkspaceBar";
import { usePanelWidths } from "./hooks/usePanelWidths";
import {
  buildSessionLaunchInput,
  buildTmuxLaunchInput,
  buildTmuxSplitInput,
  getActiveTmuxWindow
} from "./lib/sessionLaunch";

export default function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [skills, setSkills] = useState<SkillRegistry>({ codex: [] });
  const [selectedId, setSelectedId] = useState<string>();
  const [startCwd, setStartCwd] = useState("~");
  const [startAgentType, setStartAgentType] = useState<AgentType>("codex");
  const [error, setError] = useState<string>();
  const [tmuxWindows, setTmuxWindows] = useState<TmuxWindowSummary[]>([]);
  const [tmuxLaunchAgentType, setTmuxLaunchAgentType] = useState<AgentType>("shell");
  const [terminalNonce, setTerminalNonce] = useState(0);
  const { gridTemplateColumns, resetPanelWidths, startResize } = usePanelWidths();

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

  function handleSelectSession(session: SessionSummary) {
    setSelectedId(session.id);
  }

  async function handleStartSession() {
    try {
      const input = buildSessionLaunchInput(startAgentType, startCwd);
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

  async function handleUpdateMetadata(
    session: SessionSummary,
    input: { displayName?: string }
  ) {
    try {
      await updateSessionMetadata(session, input);
      await refresh();
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update session");
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
    try {
      await createTmuxWindow(selected, buildTmuxLaunchInput(selected, tmuxWindows, tmuxLaunchAgentType));
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
    const activeWindow = getActiveTmuxWindow(tmuxWindows);
    if (!activeWindow) return;
    try {
      await splitTmuxPane(selected, activeWindow.index, buildTmuxSplitInput(selected, activeWindow, tmuxLaunchAgentType, direction));
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
        gridTemplateColumns
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
        onUpdateMetadata={handleUpdateMetadata}
        onInsertSkillPrompt={handleInsertSkillPrompt}
      />
    </div>
  );
}
