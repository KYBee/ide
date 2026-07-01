import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/src/config";
import { enrichTmuxSessionsWithStatus, statusScanLimit } from "../server/src/sessionStatus";
import { inferAgentType } from "../server/src/metadataStore";
import { aggregateSessionStatus, buildTmuxShellCommand, detectSessionStatus, isInternalSessionControlTmuxSession } from "../server/src/tmux";
import { tmuxSessionNameSchema, tmuxWindowNameSchema, zodErrorMessage } from "../server/src/validation";
import { z } from "zod";
import type { SessionSummary } from "../server/src/types";

test("inferAgentType recognizes supported local agents", () => {
  assert.equal(inferAgentType("run codex"), "codex");
  assert.equal(inferAgentType("Claude Code"), "claude");
  assert.equal(inferAgentType("agy chat"), "gemini");
  assert.equal(inferAgentType("gemini"), "gemini");
  assert.equal(inferAgentType("docker compose up"), "build");
  assert.equal(inferAgentType("zsh"), "shell");
  assert.equal(inferAgentType("custom workflow"), "custom");
});

test("detectSessionStatus keeps attention states distinguishable", () => {
  assert.equal(detectSessionStatus("Error: failed to build", "codex"), "error");
  assert.equal(detectSessionStatus("approval required: allow?", "codex"), "needs_approval");
  assert.equal(detectSessionStatus("Waiting for input", "codex"), "waiting_input");
  assert.equal(detectSessionStatus("completed successfully", "codex"), "completed");
  assert.equal(detectSessionStatus("working on files\n> ", "shell"), "idle");
  assert.equal(detectSessionStatus("› Summarize recent commits\n\ngpt-5.5 medium · ~", "codex"), "idle");
  assert.equal(detectSessionStatus("• Working (48s • esc to interrupt)\n\n› Find and fix a bug\n\ngpt-5.5 medium · ~/project", "codex"), "running");
  assert.equal(detectSessionStatus("working on files", "codex"), "running");
});

test("detectSessionStatus ignores stale attention text above the prompt", () => {
  assert.equal(detectSessionStatus([
    "We discussed waiting for input and y/n prompts.",
    "The previous command completed successfully.",
    "› "
  ].join("\n"), "codex"), "idle");
});

test("detectSessionStatus uses agent-specific adapters", () => {
  assert.equal(detectSessionStatus("Claude Code\n\n> ", "claude"), "idle");
  assert.equal(detectSessionStatus("Thinking...\nEsc to interrupt", "claude"), "running");
  assert.equal(detectSessionStatus("Gemini\n\n❯ ", "gemini"), "idle");
  assert.equal(detectSessionStatus("Antigravity CLI\n>\n? for shortcuts Gemini 3.5 Flash (Medium)", "gemini"), "idle");
  assert.equal(detectSessionStatus("Generating response", "gemini"), "running");
  assert.equal(detectSessionStatus("npm run dev\ncompiled successfully", "shell"), "idle");
  assert.equal(detectSessionStatus("unknown tui footer", "custom"), "unknown");
});

test("aggregateSessionStatus only reports idle when every pane is idle or completed", () => {
  assert.equal(aggregateSessionStatus(["idle", "idle"]), "idle");
  assert.equal(aggregateSessionStatus(["idle", "completed"]), "idle");
  assert.equal(aggregateSessionStatus(["idle", "running"]), "running");
  assert.equal(aggregateSessionStatus(["idle", "waiting_input"]), "waiting_input");
  assert.equal(aggregateSessionStatus(["running", "needs_approval"]), "needs_approval");
  assert.equal(aggregateSessionStatus(["error", "needs_approval"]), "error");
});

test("internal Session Control runtime tmux sessions are hidden from users", () => {
  assert.equal(isInternalSessionControlTmuxSession("session-control-server"), true);
  assert.equal(isInternalSessionControlTmuxSession("session-control-web"), true);
  assert.equal(isInternalSessionControlTmuxSession("session-control-desktop"), true);
  assert.equal(isInternalSessionControlTmuxSession("session-control-user-work"), false);
  assert.equal(isInternalSessionControlTmuxSession("codex-session-control"), false);
});

test("tmux launch commands run through the user's login shell", () => {
  const command = buildTmuxShellCommand("agy");
  assert.match(command, /exec '.+' -lic/);
  assert.match(command, /agy/);
  assert.match(command, /exec '.+' -l/);
  assert.match(command, /unset .*NO_COLOR/);
  assert.match(command, /FORCE_COLOR=3/);
});

test("config treats yaml null cwd as the user home directory", () => {
  const previousConfig = process.env.SESSION_CONTROL_CONFIG;
  const directory = mkdtempSync(join(tmpdir(), "session-control-config-"));
  const configPath = join(directory, "projects.yaml");

  try {
    process.env.SESSION_CONTROL_CONFIG = configPath;
    writeFileSync(configPath, [
      "projects:",
      "  - name: Shell",
      "    cwd: ~",
      "    command: $SHELL",
      ""
    ].join("\n"));

    const config = loadConfig();
    assert.equal(config.projects[0].cwd, process.env.HOME);
    assert.equal(config.projects[0].command, "$SHELL");
  } finally {
    if (previousConfig === undefined) delete process.env.SESSION_CONTROL_CONFIG;
    else process.env.SESSION_CONTROL_CONFIG = previousConfig;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("tmux session names reject targets that would be ambiguous", () => {
  assert.equal(tmuxSessionNameSchema.safeParse("codex-work").success, true);
  assert.equal(tmuxSessionNameSchema.safeParse("codex:work").success, false);
  assert.equal(tmuxSessionNameSchema.safeParse(" codex-work").success, false);
  assert.equal(tmuxSessionNameSchema.safeParse("codex\nwork").success, false);
});

test("tmux window names reject control characters", () => {
  assert.equal(tmuxWindowNameSchema.safeParse("build logs").success, true);
  assert.equal(tmuxWindowNameSchema.safeParse("build\nlogs").success, false);
});

test("zod errors are formatted as client-facing validation messages", () => {
  const schema = z.object({ name: tmuxSessionNameSchema });
  const result = schema.safeParse({ name: "bad:name" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(zodErrorMessage(result.error), /name: tmux session name cannot contain ':'/);
  }
});

test("status scan limit is configurable and bounded", () => {
  const previous = process.env.SESSION_CONTROL_STATUS_SCAN_LIMIT;
  try {
    delete process.env.SESSION_CONTROL_STATUS_SCAN_LIMIT;
    assert.equal(statusScanLimit(), 50);

    process.env.SESSION_CONTROL_STATUS_SCAN_LIMIT = "2";
    assert.equal(statusScanLimit(), 2);

    process.env.SESSION_CONTROL_STATUS_SCAN_LIMIT = "not-a-number";
    assert.equal(statusScanLimit(), 50);
  } finally {
    if (previous === undefined) delete process.env.SESSION_CONTROL_STATUS_SCAN_LIMIT;
    else process.env.SESSION_CONTROL_STATUS_SCAN_LIMIT = previous;
  }
});

test("status enrichment can skip tmux snapshot scans when the limit is zero", async () => {
  const sessions: SessionSummary[] = [
    {
      id: "tmux:codex-test",
      name: "codex-test",
      hostId: "local",
      type: "tmux",
      agentType: "codex",
      tmuxName: "codex-test",
      status: "running",
      persistent: true
    }
  ];

  assert.deepEqual(await enrichTmuxSessionsWithStatus(sessions, 0), sessions);
});

test("config treats yaml tilde cwd as the home directory", () => {
  const previousConfig = process.env.SESSION_CONTROL_CONFIG;
  const directory = mkdtempSync(join(tmpdir(), "session-control-config-"));
  const configPath = join(directory, "projects.yaml");

  try {
    process.env.SESSION_CONTROL_CONFIG = configPath;
    writeFileSync(configPath, [
      "projects:",
      "  - name: Shell",
      "    cwd: ~",
      "    command: $SHELL",
      ""
    ].join("\n"));

    const config = loadConfig();
    assert.equal(config.projects[0].cwd, homedir());
  } finally {
    if (previousConfig === undefined) delete process.env.SESSION_CONTROL_CONFIG;
    else process.env.SESSION_CONTROL_CONFIG = previousConfig;
    rmSync(directory, { recursive: true, force: true });
  }
});
