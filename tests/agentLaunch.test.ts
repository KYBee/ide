import test from "node:test";
import assert from "node:assert/strict";
import type { SessionSummary, TmuxWindowSummary } from "../web/src/lib/api";
import { agentCommand, agentLabel, agentWindowName } from "../web/src/lib/agents";
import {
  buildSessionLaunchInput,
  buildTmuxLaunchInput,
  buildTmuxSplitInput,
  getActiveTmuxWindow
} from "../web/src/lib/sessionLaunch";

function session(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: "tmux:codex-test",
    name: "codex-test",
    hostId: "local",
    type: "tmux",
    agentType: "codex",
    tmuxName: "codex-test",
    cwd: "/project",
    command: "codex",
    status: "running",
    persistent: true,
    activePanePath: "/project/current",
    ...overrides
  };
}

function tmuxWindow(overrides: Partial<TmuxWindowSummary> = {}): TmuxWindowSummary {
  return {
    id: "@1",
    index: 0,
    name: "zsh",
    active: false,
    paneCount: 1,
    panes: [
      {
        id: "%1",
        index: 0,
        active: true,
        currentPath: "/project/pane",
        currentCommand: "zsh"
      }
    ],
    ...overrides
  };
}

test("agent command mapping stays stable for launch controls", () => {
  assert.equal(agentCommand("codex"), "codex");
  assert.equal(agentCommand("claude"), "claude");
  assert.equal(agentCommand("gemini"), "agy");
  assert.equal(agentCommand("shell"), undefined);
  assert.equal(agentLabel("gemini"), "Gemini");
  assert.equal(agentWindowName("shell", 3), "zsh-3");
});

test("buildSessionLaunchInput creates persistent tmux sessions with normalized cwd", () => {
  const codexInput = buildSessionLaunchInput("codex", "/workspace");
  assert.equal(codexInput.type, "tmux");
  assert.equal(codexInput.hostId, "local");
  assert.equal(codexInput.agentType, "codex");
  assert.equal(codexInput.cwd, "/workspace");
  assert.equal(codexInput.command, "codex");
  assert.match(codexInput.name, /^codex-\d{8}-\d{6}-\d{3}$/);

  const shellInput = buildSessionLaunchInput("shell", "", "macmini");
  assert.equal(shellInput.hostId, "macmini");
  assert.equal(shellInput.cwd, undefined);
  assert.equal(shellInput.command, undefined);
});

test("tmux window launch picks the next sparse index and current pane path", () => {
  const input = buildTmuxLaunchInput(session(), [
    tmuxWindow({ index: 0 }),
    tmuxWindow({ id: "@3", index: 3, name: "codex", active: true })
  ], "gemini");

  assert.equal(input.name, "gemini-4");
  assert.equal(input.cwd, "/project/current");
  assert.equal(input.command, "agy");
});

test("tmux split input prefers the active pane path over session paths", () => {
  const activeWindow = tmuxWindow({ active: true });
  const input = buildTmuxSplitInput(session(), activeWindow, "claude", "vertical");

  assert.deepEqual(input, {
    direction: "vertical",
    cwd: "/project/pane",
    command: "claude"
  });
});

test("active tmux window helper falls back to the first window", () => {
  const first = tmuxWindow({ id: "@1", index: 1, active: false });
  const second = tmuxWindow({ id: "@2", index: 2, active: false });
  assert.equal(getActiveTmuxWindow([first, second]), first);
  assert.equal(getActiveTmuxWindow([first, { ...second, active: true }])?.id, "@2");
  assert.equal(getActiveTmuxWindow([]), undefined);
});
