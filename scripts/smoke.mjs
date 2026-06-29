#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const webBaseUrl = process.env.SESSION_CONTROL_WEB_URL ?? "http://127.0.0.1:3634";
const apiBaseUrl = process.env.SESSION_CONTROL_API_URL ?? "http://127.0.0.1:3635";
const timeoutMs = Number(process.env.SESSION_CONTROL_SMOKE_TIMEOUT_MS ?? 5000);

const failures = [];
const notes = [];

function pass(message) {
  console.log(`ok - ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`not ok - ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function hasBadValue(value) {
  return value === undefined || value === null || value === "" || String(value).includes("undefined");
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readText(url, label) {
  const response = await fetchWithTimeout(url);
  assert(response.ok, `${label} returned ${response.status}`);
  if (!response.ok) return "";
  return response.text();
}

async function readJson(url, label) {
  const response = await fetchWithTimeout(url);
  assert(response.ok, `${label} returned ${response.status}`);
  if (!response.ok) return undefined;
  return response.json();
}

async function sendJson(url, label, body, init) {
  const response = await fetchWithTimeout(url, {
    method: init?.method ?? "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init
  });
  assert(response.ok, `${label} returned ${response.status}`);
  if (!response.ok || response.status === 204) return undefined;
  return response.json();
}

function runSyntaxCheck(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  if (result.status === 0) {
    pass(label);
    return;
  }
  fail(`${label}: ${(result.stderr || result.stdout).trim()}`);
}

function validateSessions(sessions) {
  assert(Array.isArray(sessions), "sessions response is an array");
  if (!Array.isArray(sessions)) return;

  const seenIds = new Set();
  for (const session of sessions) {
    assert(!hasBadValue(session.id), "session id is present");
    assert(!hasBadValue(session.name), `session name is present for ${session.id ?? "unknown"}`);
    assert(!seenIds.has(session.id), `session id is unique: ${session.id}`);
    seenIds.add(session.id);

    if (session.type === "tmux") {
      assert(session.id === `tmux:${session.name}`, `tmux id matches name: ${session.id}`);
      assert(session.tmuxName === session.name, `tmuxName matches name: ${session.id}`);
      assert(!hasBadValue(session.activePaneId), `tmux active pane is present: ${session.id}`);
      assert(Number.isFinite(session.windowCount), `tmux window count is numeric: ${session.id}`);
      assert(Number.isFinite(session.paneCount), `tmux pane count is numeric: ${session.id}`);
    }
  }

  pass(`sessions endpoint returned ${sessions.length} sessions`);
}

function validateWindows(payload, sessionName) {
  assert(payload?.sessionId === `tmux:${sessionName}`, `windows payload session id matches ${sessionName}`);
  assert(Array.isArray(payload?.windows), `windows response is an array for ${sessionName}`);
  if (!Array.isArray(payload?.windows)) return;

  for (const window of payload.windows) {
    assert(!hasBadValue(window.id), `window id is present for ${sessionName}`);
    assert(!hasBadValue(window.name), `window name is present for ${sessionName}`);
    assert(Number.isFinite(window.index), `window index is numeric for ${window.id}`);
    assert(Number.isFinite(window.paneCount), `window pane count is numeric for ${window.id}`);
    assert(Array.isArray(window.panes), `window panes are listed for ${window.id}`);
    for (const pane of window.panes ?? []) {
      assert(!hasBadValue(pane.id), `pane id is present for ${window.id}`);
      assert(Number.isFinite(pane.index), `pane index is numeric for ${pane.id}`);
      assert(typeof pane.active === "boolean", `pane active flag is boolean for ${pane.id}`);
    }
  }

  pass(`windows endpoint returned ${payload.windows.length} windows for ${sessionName}`);
}

async function validateWindowCreation() {
  const baseName = `session-control-smoke-${Date.now().toString(36)}`;
  const created = await sendJson(`${apiBaseUrl}/api/sessions`, "create smoke tmux session", {
    name: baseName,
    type: "tmux",
    agentType: "shell",
    cwd: "~",
    command: "zsh"
  });
  const sessionId = created?.id;
  const sessionName = typeof sessionId === "string" ? sessionId.replace(/^tmux:/, "") : baseName;

  try {
    assert(sessionId === `tmux:${sessionName}`, "create smoke tmux session returned tmux id");
    await sendJson(`${apiBaseUrl}/api/sessions/tmux/${encodeURIComponent(sessionName)}/windows`, "create smoke tmux window", {
      name: "zsh-smoke",
      cwd: "~"
    });
    const windows = await readJson(`${apiBaseUrl}/api/sessions/tmux/${encodeURIComponent(sessionName)}/windows`, "smoke tmux windows after create");
    assert(
      Array.isArray(windows?.windows) && windows.windows.length >= 2,
      "new tmux window button backend creates a second window"
    );
    const createdWindow = windows?.windows?.find((window) => window.name === "zsh-smoke");
    assert(createdWindow, "created tmux window is listed");
    if (createdWindow) {
      await sendJson(
        `${apiBaseUrl}/api/sessions/tmux/${encodeURIComponent(sessionName)}/windows/${createdWindow.index}`,
        "close smoke tmux window",
        undefined,
        { method: "DELETE" }
      );
      const afterClose = await readJson(`${apiBaseUrl}/api/sessions/tmux/${encodeURIComponent(sessionName)}/windows`, "smoke tmux windows after close");
      assert(
        Array.isArray(afterClose?.windows) && !afterClose.windows.some((window) => window.name === "zsh-smoke"),
        "tmux window close removes the created window"
      );
    }
    pass("tmux window creation is functional");
  } finally {
    await fetchWithTimeout(`${apiBaseUrl}/api/sessions/tmux/${encodeURIComponent(sessionName)}`, {
      method: "DELETE"
    }).catch(() => undefined);
  }
}

async function main() {
  console.log(`smoke - web ${webBaseUrl}`);
  console.log(`smoke - api ${apiBaseUrl}`);

  runSyntaxCheck("node", ["--check", "desktop/main.cjs"], "desktop main syntax");
  runSyntaxCheck("zsh", ["-n", "Session Control Launcher.app/Contents/MacOS/session-control-launcher"], "launcher syntax");

  const html = await readText(`${webBaseUrl}/`, "web index");
  assert(html.includes('<div id="root"></div>'), "web index contains root mount");
  assert(html.includes("/src/main.tsx") || html.includes("/assets/"), "web index contains app script");
  pass("web index is reachable");

  const health = await readJson(`${apiBaseUrl}/api/health`, "api health");
  assert(health?.ok === true, "api health is ok");
  pass("api health is reachable");

  const sessions = await readJson(`${apiBaseUrl}/api/sessions`, "api sessions");
  validateSessions(sessions);

  const firstTmuxSession = Array.isArray(sessions)
    ? sessions.find((session) => session.type === "tmux" && !hasBadValue(session.name))
    : undefined;

  if (firstTmuxSession) {
    const windows = await readJson(
      `${apiBaseUrl}/api/sessions/tmux/${encodeURIComponent(firstTmuxSession.name)}/windows`,
      "api tmux windows"
    );
    validateWindows(windows, firstTmuxSession.name);
  } else {
    notes.push("no tmux sessions available; skipped windows endpoint");
  }

  await validateWindowCreation();

  for (const note of notes) console.log(`skip - ${note}`);

  if (failures.length > 0) {
    console.error("");
    console.error(`${failures.length} smoke check(s) failed.`);
    process.exit(1);
  }

  console.log("");
  console.log("smoke checks passed");
}

main().catch((error) => {
  console.error(`not ok - smoke crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
