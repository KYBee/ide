import { useMemo, useState } from "react";
import { Bot, Circle, FolderOpen, Hammer, Monitor, Plus, RefreshCw, Sparkles, SquareTerminal, Terminal } from "lucide-react";
import type { AgentType, SessionSummary } from "../lib/api";
import { agentLabel, LAUNCH_AGENT_TYPES } from "../lib/agents";
import { displaySessionPath, stripRemotePathPrefix } from "../lib/sessionDisplay";

interface SessionSidebarProps {
  sessions: SessionSummary[];
  selectedId?: string;
  startCwd: string;
  startAgentType: AgentType;
  startHostId: string;
  hosts: Array<{ id: string; label: string; type: "local" | "agent" }>;
  onStartCwdChange: (cwd: string) => void;
  onPickStartCwd: () => void;
  onStartAgentTypeChange: (agentType: AgentType) => void;
  onStartHostChange: (hostId: string) => void;
  onSelect: (session: SessionSummary) => void;
  onRefresh: () => void;
  onNew: () => void;
}

type GroupMode = "path" | "agent";

const AGENT_ORDER: AgentType[] = ["codex", "claude", "gemini", "shell", "build", "custom"];

function agentIcon(agentType: AgentType) {
  if (agentType === "codex") return <Bot size={16} />;
  if (agentType === "claude") return <Sparkles size={16} />;
  if (agentType === "gemini") return <Sparkles size={16} />;
  if (agentType === "build") return <Hammer size={16} />;
  if (agentType === "shell") return <Terminal size={16} />;
  return <SquareTerminal size={16} />;
}

function sessionSubtitle(session: SessionSummary): string {
  const mode = session.persistent ? "tmux" : "pty";
  const location = displaySessionPath(session, session.cwd ?? session.activePanePath);
  const command = session.command ?? session.activePaneCommand;
  return [session.agentType, mode, location, command].filter(Boolean).join(" · ");
}

function sessionPath(session: SessionSummary): string {
  return displaySessionPath(session, session.cwd ?? session.activePanePath) ?? "Unknown path";
}

function pathDepth(value: string): number {
  if (value === "~" || value === "Unknown path") return 0;
  return stripRemotePathPrefix(value).split("/").filter(Boolean).length;
}

function groupSessions(sessions: SessionSummary[], mode: GroupMode): Array<{ key: string; label: string; sessions: SessionSummary[] }> {
  const groups = new Map<string, SessionSummary[]>();
  for (const session of sessions) {
    const key = mode === "path" ? sessionPath(session) : session.agentType;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }

  return Array.from(groups.entries())
    .map(([key, groupedSessions]) => ({
      key,
      label: key,
      sessions: groupedSessions.sort((left, right) =>
        (left.displayName ?? left.name).localeCompare(right.displayName ?? right.name)
      )
    }))
    .sort((left, right) => {
      if (mode === "agent") {
        const leftIndex = AGENT_ORDER.indexOf(left.key as AgentType);
        const rightIndex = AGENT_ORDER.indexOf(right.key as AgentType);
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      }
      return pathDepth(left.key) - pathDepth(right.key) || left.key.localeCompare(right.key);
    });
}

export function SessionSidebar({
  sessions,
  selectedId,
  startCwd,
  startAgentType,
  startHostId,
  hosts,
  onStartCwdChange,
  onPickStartCwd,
  onStartAgentTypeChange,
  onStartHostChange,
  onSelect,
  onRefresh,
  onNew
}: SessionSidebarProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>(() =>
    window.localStorage.getItem("session-control:group-mode") === "agent" ? "agent" : "path"
  );
  const groupedSessions = useMemo(() => groupSessions(sessions, groupMode), [sessions, groupMode]);

  function selectGroupMode(nextMode: GroupMode) {
    setGroupMode(nextMode);
    window.localStorage.setItem("session-control:group-mode", nextMode);
  }

  return (
    <aside className="sidebar">
      <header className="panel-header">
        <div>
          <h1>Session Control</h1>
          <p>{sessions.length} sessions</p>
        </div>
        <div className="icon-row">
          <button className="icon-button" onClick={onRefresh} title="Refresh sessions">
            <RefreshCw size={16} />
          </button>
          <button className="icon-button primary" onClick={onNew} title="New session">
            <Plus size={16} />
          </button>
        </div>
      </header>

      <div className="quick-start">
        <label>
          Run on
          <select value={startHostId} onChange={(event) => onStartHostChange(event.target.value)}>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start agent
          <select value={startAgentType} onChange={(event) => onStartAgentTypeChange(event.target.value as AgentType)}>
            {LAUNCH_AGENT_TYPES.map((agentType) => (
              <option key={agentType} value={agentType}>
                {agentLabel(agentType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Start in
          <div className="path-picker">
            <input
              value={startCwd}
              onChange={(event) => onStartCwdChange(event.target.value)}
              placeholder={startHostId === "local" ? "~ or ~/project" : "Remote ~ or ~/project"}
              spellCheck={false}
            />
            <button
              className="icon-button"
              onClick={onPickStartCwd}
              title={startHostId === "local" ? "Choose directory" : "Remote paths must be typed"}
              disabled={startHostId !== "local"}
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </label>
      </div>

      <div className="session-list">
        <div className="session-group-toggle">
          <button className={groupMode === "path" ? "selected" : ""} onClick={() => selectGroupMode("path")}>
            Path
          </button>
          <button className={groupMode === "agent" ? "selected" : ""} onClick={() => selectGroupMode("agent")}>
            AI
          </button>
        </div>
        {groupedSessions.map((group) => (
          <section key={group.key} className="session-group">
            <div className="session-group-title" title={group.label}>
              <span>{group.label}</span>
              <strong>{group.sessions.length}</strong>
            </div>
            {group.sessions.map((session) => (
              <button
                key={session.id}
                className={`session-item ${session.id === selectedId ? "selected" : ""}`}
                onClick={() => onSelect(session)}
              >
                <span className="session-icon">
                  {session.type === "tmux" ? agentIcon(session.agentType) : <Monitor size={16} />}
                </span>
                <span className="session-copy">
                  <strong title={session.name}>{session.displayName ?? session.name}</strong>
                  <small title={sessionSubtitle(session)}>{sessionSubtitle(session)}</small>
                </span>
                <Circle className={`status-dot ${session.status}`} size={10} fill="currentColor" />
              </button>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}
