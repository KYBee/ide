import { Columns2, Pencil, Plus, Rows2, X } from "lucide-react";
import type { AgentType, SessionSummary, TmuxWindowSummary } from "../lib/api";
import { agentLabel, LAUNCH_AGENT_TYPES } from "../lib/agents";

interface TmuxWorkspaceBarProps {
  session?: SessionSummary;
  windows: TmuxWindowSummary[];
  onSelectWindow: (window: TmuxWindowSummary) => void;
  onCreateWindow: () => void;
  onRenameWindow: (window: TmuxWindowSummary) => void;
  onCloseWindow: (window: TmuxWindowSummary) => void;
  launchAgentType: AgentType;
  onLaunchAgentTypeChange: (agentType: AgentType) => void;
  onSplitPane: (direction: "horizontal" | "vertical") => void;
}

export function TmuxWorkspaceBar({
  session,
  windows,
  onSelectWindow,
  onCreateWindow,
  onRenameWindow,
  onCloseWindow,
  launchAgentType,
  onLaunchAgentTypeChange,
  onSplitPane
}: TmuxWorkspaceBarProps) {
  if (!session || session.type !== "tmux") return null;

  const activeWindow = windows.find((window) => window.active) ?? windows[0];

  return (
    <div className="tmux-workspace-bar">
      <div className="window-command-row">
        <div className="window-tabs" role="tablist" aria-label="tmux windows">
          {windows.map((window) => (
            <div
              key={window.id}
              className={`window-tab-shell ${window.active ? "selected" : ""}`}
              title={`${window.index}: ${window.name}`}
            >
              <button
                className="window-tab"
                role="tab"
                aria-selected={window.active}
                onClick={() => onSelectWindow(window)}
              >
                <span>{window.index}</span>
                <strong>{window.name}</strong>
                <small>{window.paneCount}</small>
              </button>
              <button
                className="window-close-button"
                disabled={windows.length <= 1}
                onClick={() => onCloseWindow(window)}
                title={windows.length <= 1 ? "Keep at least one window" : "Close tmux window"}
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button className="icon-button compact" onClick={onCreateWindow} title="New tmux window">
            <Plus size={15} />
          </button>
          {activeWindow && (
            <button className="icon-button compact" onClick={() => onRenameWindow(activeWindow)} title="Rename active window">
              <Pencil size={14} />
            </button>
          )}
        </div>

        {activeWindow && (
          <div className="tmux-actions">
            <label className="tmux-agent-picker">
              <span>Run as</span>
              <select
                value={launchAgentType}
                onChange={(event) => onLaunchAgentTypeChange(event.target.value as AgentType)}
              >
                {LAUNCH_AGENT_TYPES.map((agentType) => (
                  <option key={agentType} value={agentType}>
                    {agentLabel(agentType)}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => onSplitPane("horizontal")} title="Split pane left and right">
              <Columns2 size={15} />
              Split
            </button>
            <button onClick={() => onSplitPane("vertical")} title="Split pane top and bottom">
              <Rows2 size={15} />
              Split
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
