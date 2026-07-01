import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../server/src/config";
import { enrichTmuxSessionsWithStatus, statusScanLimit } from "../server/src/sessionStatus";
import { listAgentHosts } from "../server/src/agentHosts";
import { inferAgentType } from "../server/src/metadataStore";
import { buildTmuxShellCommand, detectSessionStatus, isInternalSessionControlTmuxSession } from "../server/src/tmux";
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
  assert.equal(detectSessionStatus("Error: failed to build"), "error");
  assert.equal(detectSessionStatus("approval required: allow?"), "needs_approval");
  assert.equal(detectSessionStatus("Waiting for input"), "waiting_input");
  assert.equal(detectSessionStatus("completed successfully"), "completed");
  assert.equal(detectSessionStatus("working on files"), "running");
});

test("detectSessionStatus ignores stale errors above the current prompt", () => {
  assert.equal(detectSessionStatus([
    "GitHub API error 404",
    "error connecting to api.github.com",
    "────────────────",
    "• 됐습니다.",
    "",
    "  커밋:",
    "  83fd459 fix terminal color inheritance",
    "",
    "  PR:",
    "  https://github.com/KYBee/ide/pull/4",
    "",
    "  검증:",
    "  npm run build 통과했습니다.",
    "",
    "─ Worked for 11m 26s ─",
    "",
    "› Write tests for @filename"
  ].join("\n")), "running");
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

test("config supports local and remote agent hosts without exposing token values", () => {
  const previousConfig = process.env.SESSION_CONTROL_CONFIG;
  const previousToken = process.env.SESSION_CONTROL_MACMINI_TOKEN;
  const previousMode = process.env.SESSION_CONTROL_MODE;
  const directory = mkdtempSync(join(tmpdir(), "session-control-config-"));
  const configPath = join(directory, "projects.yaml");

  try {
    process.env.SESSION_CONTROL_CONFIG = configPath;
    process.env.SESSION_CONTROL_MACMINI_TOKEN = "secret-token";
    delete process.env.SESSION_CONTROL_MODE;
    writeFileSync(configPath, [
      "hosts:",
      "  - id: local",
      "    label: Local",
      "    type: local",
      "  - id: macmini",
      "    label: Mac mini",
      "    type: agent",
      "    baseUrl: http://100.64.0.10:3635/",
      "    tokenEnv: SESSION_CONTROL_MACMINI_TOKEN",
      "projects: []",
      ""
    ].join("\n"));

    const config = loadConfig();
    assert.deepEqual(config.hosts, [
      { id: "local", label: "Local", type: "local" },
      {
        id: "macmini",
        label: "Mac mini",
        type: "agent",
        baseUrl: "http://100.64.0.10:3635",
        tokenEnv: "SESSION_CONTROL_MACMINI_TOKEN"
      }
    ]);
    assert.equal("token" in config.hosts[1], false);
    assert.equal(listAgentHosts().length, 1);

    process.env.SESSION_CONTROL_MODE = "agent";
    assert.equal(listAgentHosts().length, 0);
  } finally {
    if (previousConfig === undefined) delete process.env.SESSION_CONTROL_CONFIG;
    else process.env.SESSION_CONTROL_CONFIG = previousConfig;
    if (previousToken === undefined) delete process.env.SESSION_CONTROL_MACMINI_TOKEN;
    else process.env.SESSION_CONTROL_MACMINI_TOKEN = previousToken;
    if (previousMode === undefined) delete process.env.SESSION_CONTROL_MODE;
    else process.env.SESSION_CONTROL_MODE = previousMode;
    rmSync(directory, { recursive: true, force: true });
  }
});
