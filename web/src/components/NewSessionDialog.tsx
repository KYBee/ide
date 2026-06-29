import { useState } from "react";
import type { AgentType, SessionKind } from "../lib/api";
import { agentLabel, LAUNCH_AGENT_TYPES } from "../lib/agents";

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; type: SessionKind; agentType?: AgentType; cwd?: string; command?: string }) => void;
}

export function NewSessionDialog({ open, onClose, onCreate }: NewSessionDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SessionKind>("tmux");
  const [agentType, setAgentType] = useState<AgentType>("codex");
  const [cwd, setCwd] = useState("");
  const [command, setCommand] = useState("");

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onCreate({
            name,
            type,
            agentType,
            cwd: cwd || undefined,
            command: command || undefined
          });
          setName("");
          setCommand("");
          onClose();
        }}
      >
        <h2>New Session</h2>
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
        </label>
        <label>
          Mode
          <select value={type} onChange={(event) => setType(event.target.value as SessionKind)}>
            <option value="tmux">tmux</option>
            <option value="pty">pty</option>
          </select>
        </label>
        <label>
          Agent
          <select value={agentType} onChange={(event) => setAgentType(event.target.value as AgentType)}>
            {LAUNCH_AGENT_TYPES.map((nextAgentType) => (
              <option key={nextAgentType} value={nextAgentType}>
                {agentLabel(nextAgentType)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Working directory
          <input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="~/project" />
        </label>
        <label>
          Command
          <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="codex" />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary" type="submit">Create</button>
        </div>
      </form>
    </div>
  );
}
