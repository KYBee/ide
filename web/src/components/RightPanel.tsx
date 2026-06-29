import { useEffect, useMemo, useState } from "react";
import { BookOpen, Camera, Save, Send, Skull, Tag } from "lucide-react";
import type { SessionSummary, SkillRegistry, SkillSummary } from "../lib/api";
import { agentLabel } from "../lib/agents";

interface RightPanelProps {
  selected?: SessionSummary;
  skills: SkillRegistry;
  onKill: (session: SessionSummary) => void;
  onRename: (session: SessionSummary) => void;
  onSnapshot: (session: SessionSummary) => void;
  onUpdateMetadata: (
    session: SessionSummary,
    input: { displayName?: string; cwd?: string; command?: string }
  ) => void;
  onSendCommand: (session: SessionSummary, command: string) => void;
  onInsertSkillPrompt: (session: SessionSummary, skill: SkillSummary) => void;
  snapshot?: string;
}

function formatDate(value?: string) {
  if (!value) return "unknown";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function RightPanel({
  selected,
  skills,
  onKill,
  onRename,
  onSnapshot,
  onUpdateMetadata,
  onSendCommand,
  onInsertSkillPrompt,
  snapshot
}: RightPanelProps) {
  const [displayName, setDisplayName] = useState("");
  const [cwd, setCwd] = useState("");
  const [command, setCommand] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string>();

  useEffect(() => {
    setDisplayName(selected?.displayName ?? "");
    setCwd(selected?.cwd ?? "");
    setCommand(selected?.command ?? "");
  }, [selected?.id, selected?.displayName, selected?.cwd, selected?.command]);

  const agentSkills = useMemo(
    () => selected?.agentType === "codex" ? skills.codex : [],
    [selected?.agentType, skills.codex]
  );
  const selectedSkill = agentSkills.find((skill) => skill.id === selectedSkillId);

  useEffect(() => {
    if (agentSkills.length === 0) {
      setSelectedSkillId(undefined);
      return;
    }
    if (selectedSkillId && !agentSkills.some((skill) => skill.id === selectedSkillId)) {
      setSelectedSkillId(undefined);
    }
  }, [agentSkills, selectedSkillId]);

  return (
    <aside className="details">
      <section>
        <div className="section-title">
          <Tag size={15} />
          <h2>Session</h2>
        </div>
        {selected ? (
          <div className="meta-grid">
            <span>Name</span>
            <strong>{selected.displayName ?? selected.name}</strong>
            {selected.displayName && (
              <>
                <span>Tmux</span>
                <strong>{selected.name}</strong>
              </>
            )}
            <span>Type</span>
            <strong>{selected.type}</strong>
            <span>Agent</span>
            <strong>{selected.agentType}</strong>
            <span>Host</span>
            <strong>{selected.hostId}</strong>
            <span>CWD</span>
            <strong title={selected.cwd}>{selected.cwd ?? "unknown"}</strong>
            <span>Command</span>
            <strong title={selected.command}>{selected.command ?? "unknown"}</strong>
            <span>Status</span>
            <strong>{selected.status}</strong>
            <span>Attached</span>
            <strong>{selected.attached ?? 0}</strong>
            <span>Windows</span>
            <strong>{selected.windowCount ?? "unknown"}</strong>
            <span>Panes</span>
            <strong>{selected.paneCount ?? "unknown"}</strong>
            <span>Pane Path</span>
            <strong title={selected.activePanePath}>{selected.activePanePath ?? "unknown"}</strong>
            <span>Pane Cmd</span>
            <strong title={selected.activePaneCommand}>{selected.activePaneCommand ?? "unknown"}</strong>
            <span>Created</span>
            <strong>{formatDate(selected.createdAt)}</strong>
            <span>Active</span>
            <strong>{formatDate(selected.lastActiveAt)}</strong>
          </div>
        ) : (
          <p className="muted">No session selected.</p>
        )}
        {selected && (
          <div className="metadata-editor">
            <label>
              Alias
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={selected.name} />
            </label>
            <label>
              Working Directory
              <input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="~/project" />
            </label>
            <label>
              Command
              <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="$SHELL" />
            </label>
          </div>
        )}
        <div className="action-row">
          <button
            disabled={!selected}
            onClick={() => selected && onUpdateMetadata(selected, {
              displayName: displayName.trim(),
              cwd: cwd || undefined,
              command: command || undefined
            })}
          >
            <Save size={15} />
            Save
          </button>
          <button
            disabled={!selected || selected.type !== "tmux" || !command.trim()}
            onClick={() => selected && onSendCommand(selected, command.trim())}
          >
            <Send size={15} />
            Send
          </button>
          <button disabled={!selected || selected.type !== "tmux"} onClick={() => selected && onRename(selected)}>
            Rename
          </button>
          <button disabled={!selected || selected.type !== "tmux"} onClick={() => selected && onSnapshot(selected)}>
            <Camera size={15} />
            Snapshot
          </button>
          <button className="danger" disabled={!selected} onClick={() => selected && onKill(selected)}>
            <Skull size={15} />
            Kill
          </button>
        </div>
        {snapshot && (
          <pre className="snapshot-preview">{snapshot}</pre>
        )}
      </section>

      <section className="skills-section">
        <div className="section-title compact-title">
          <BookOpen size={15} />
          <h2>Agent Tools{agentSkills.length > 0 ? ` (${agentSkills.length})` : ""}</h2>
        </div>
        {agentSkills.length > 0 ? (
          <div className="skill-chip-list">
            {agentSkills.map((skill) => (
              <button
                key={skill.id}
                className={`skill-chip ${skill.id === selectedSkillId ? "selected" : ""}`}
                title={`${skill.name}\n${skill.description ?? skill.path}`}
                onClick={() => setSelectedSkillId((current) => current === skill.id ? undefined : skill.id)}
              >
                {skill.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">{selected ? agentLabel(selected.agentType) : "Agent"} tools are not registered yet.</p>
        )}
        {selectedSkill && (
          <div className="skill-detail">
            <div className="skill-detail-header">
              <strong>{selectedSkill.name}</strong>
              <button
                disabled={!selected || selected.type !== "tmux"}
                onClick={() => selected && onInsertSkillPrompt(selected, selectedSkill)}
              >
                <Send size={13} />
                Insert prompt
              </button>
            </div>
            <p>{selectedSkill.description ?? "No description recorded."}</p>
            <small>{selectedSkill.id}</small>
          </div>
        )}
      </section>

    </aside>
  );
}
