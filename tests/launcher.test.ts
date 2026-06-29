import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const launcherSource = readFileSync("scripts/session-control-launcher.zsh", "utf8");
const launcherInstaller = readFileSync("scripts/install-launcher-app.zsh", "utf8");
const serverService = readFileSync("scripts/session-control-server.zsh", "utf8");
const webService = readFileSync("scripts/session-control-web.zsh", "utf8");
const desktopService = readFileSync("scripts/session-control-desktop.zsh", "utf8");
const electronMain = readFileSync("desktop/main.cjs", "utf8");

test("launcher starts only the desktop shell when web and api ports are already ready", () => {
  assert.match(launcherSource, /app_ports_are_ready/);
  assert.match(launcherSource, /start_desktop_service/);
  assert.match(launcherSource, /start_server_service/);
  assert.match(launcherSource, /start_web_service/);
  assert.doesNotMatch(launcherSource, /npm run dev:desktop/);
  assert.doesNotMatch(launcherSource, /npm run launch:desktop/);
  assert.match(
    launcherSource,
    /if app_ports_are_ready;[\s\S]*start_desktop_shell[\s\S]*exit 0/
  );
});

test("stable launcher keeps server and web independent from electron exits", () => {
  const packageJson = readFileSync("package.json", "utf8");
  assert.doesNotMatch(packageJson, /"launch:desktop":\s*"concurrently -k/);
  assert.match(launcherSource, /tmux -L "\$RUNTIME_TMUX_SOCKET" new-session -d/);
  assert.match(launcherSource, /session-control-runtime/);
  assert.match(launcherSource, /session-control-server/);
  assert.match(launcherSource, /session-control-web/);
  assert.match(launcherSource, /session-control-desktop/);
  assert.match(launcherSource, /session-control-server\.zsh/);
  assert.match(launcherSource, /session-control-web\.zsh/);
  assert.match(launcherSource, /session-control-desktop\.zsh/);
  assert.match(launcherSource, /wait_for_ready/);
});

test("launch agent wrapper scripts run the expected npm workspaces", () => {
  assert.match(serverService, /unset TMUX TMUX_PANE/);
  assert.match(webService, /unset TMUX TMUX_PANE/);
  assert.match(desktopService, /unset TMUX TMUX_PANE/);
  assert.match(serverService, /npm run start --workspace server/);
  assert.match(webService, /npm run preview --workspace web/);
  assert.match(desktopService, /npm run dev --workspace desktop/);
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
