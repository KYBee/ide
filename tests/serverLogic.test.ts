import test from "node:test";
import assert from "node:assert/strict";
import { inferAgentType } from "../server/src/metadataStore";
import { detectSessionStatus } from "../server/src/tmux";

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
