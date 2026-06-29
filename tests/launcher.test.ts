import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const launcherSource = readFileSync("scripts/session-control-launcher.zsh", "utf8");
const launcherInstaller = readFileSync("scripts/install-launcher-app.zsh", "utf8");
const electronMain = readFileSync("desktop/main.cjs", "utf8");

test("launcher starts only the desktop shell when web and api ports are already ready", () => {
  assert.match(launcherSource, /app_ports_are_ready/);
  assert.match(launcherSource, /npm run dev --workspace desktop/);
  assert.match(launcherSource, /npm run launch:desktop/);
  assert.doesNotMatch(launcherSource, /npm run dev:desktop/);
  assert.match(
    launcherSource,
    /if app_ports_are_ready;[\s\S]*start_desktop_shell[\s\S]*exit 0/
  );
});

test("launcher app delegates to the tracked launcher script", () => {
  const jxaLauncher = readFileSync("scripts/session-control-launcher.jxa.js", "utf8");
  const appInfo = readFileSync("Session Control Launcher.app/Contents/Info.plist", "utf8");
  assert.match(jxaLauncher, /scripts\/session-control-launcher\.zsh/);
  assert.match(launcherInstaller, /osacompile -l JavaScript/);
  assert.match(launcherInstaller, /scripts\/build-icns\.mjs/);
  assert.match(appInfo, /applet/);
});

test("electron second instance and dock activation ensure a visible main window", () => {
  assert.match(electronMain, /function ensureMainWindow\(\)/);
  assert.match(electronMain, /setAlwaysOnTop\(true, "screen-saver"\)/);
  assert.match(electronMain, /app\.on\("second-instance", \(\) => \{[\s\S]*ensureMainWindow\(\);[\s\S]*\}\);/);
  assert.match(electronMain, /app\.on\("activate", \(\) => \{[\s\S]*ensureMainWindow\(\);[\s\S]*\}\);/);
});
