import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";

const launcherSource = readFileSync("scripts/session-control-launcher.zsh", "utf8");
const launcherInstaller = readFileSync("scripts/install-launcher-app.zsh", "utf8");
const launcherMain = readFileSync("scripts/session-control-launcher-main.c", "utf8");
const serverService = readFileSync("scripts/session-control-server.zsh", "utf8");
const webService = readFileSync("scripts/session-control-web.zsh", "utf8");
const desktopService = readFileSync("scripts/session-control-desktop.zsh", "utf8");
const electronMain = readFileSync("desktop/main.cjs", "utf8");
const desktopPackage = readFileSync("desktop/package.json", "utf8");

test("launcher starts only the desktop shell when web and api ports are already ready", () => {
  assert.match(launcherSource, /app_ports_are_ready/);
  assert.match(launcherSource, /start_desktop_service/);
  assert.match(launcherSource, /focus_desktop_shell/);
  assert.match(launcherSource, /start_server_service/);
  assert.match(launcherSource, /start_web_service/);
  assert.doesNotMatch(launcherSource, /npm run dev:desktop/);
  assert.doesNotMatch(launcherSource, /npm run launch:desktop/);
  assert.match(
    launcherSource,
    /if app_ports_are_ready;[\s\S]*start_desktop_shell[\s\S]*exit 0/
  );
});

test("launcher focuses the visible desktop app after sending the desktop signal", () => {
  assert.match(launcherSource, /focus_desktop_shell\(\)/);
  assert.match(launcherSource, /activate_existing_app/);
  assert.match(launcherSource, /Session Control desktop shell activated/);
  assert.match(launcherSource, /start_desktop_service[\s\S]*focus_desktop_shell \|\| true/);
  assert.doesNotMatch(launcherSource, /open -a "Electron"/);
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

test("desktop shell starts Electron directly after the launcher readiness check", () => {
  assert.match(desktopPackage, /"dev":\s*"electron \."/);
  assert.doesNotMatch(desktopPackage, /wait-on/);
});

test("launcher app delegates to the tracked launcher script", () => {
  const appInfo = readFileSync("Session Control Launcher.app/Contents/Info.plist", "utf8");
  const appExecutablePath = "Session Control Launcher.app/Contents/MacOS/session-control-launcher";
  assert.match(launcherInstaller, /CFBundleExecutable/);
  assert.match(launcherInstaller, /session-control-launcher/);
  assert.match(launcherInstaller, /clang "\$PROJECT_DIR\/scripts\/session-control-launcher-main\.c"/);
  assert.match(launcherMain, /_NSGetExecutablePath/);
  assert.match(launcherMain, /scripts\/session-control-launcher\.zsh/);
  assert.doesNotMatch(launcherMain, /\/Users\/kybee\/Documents\/advanced-terminal/);
  assert.match(launcherInstaller, /scripts\/build-icns\.mjs/);
  assert.match(appInfo, /session-control-launcher/);
  assert.equal(existsSync(appExecutablePath), true);
  assert.equal((statSync(appExecutablePath).mode & 0o111) !== 0, true);
});

test("electron second instance and dock activation ensure a visible main window", () => {
  assert.match(electronMain, /function ensureMainWindow\(\)/);
  assert.match(electronMain, /setAlwaysOnTop\(true, "screen-saver"\)/);
  assert.match(electronMain, /app\.on\("second-instance", \(\) => \{[\s\S]*ensureMainWindow\(\);[\s\S]*\}\);/);
  assert.match(electronMain, /app\.on\("activate", \(\) => \{[\s\S]*ensureMainWindow\(\);[\s\S]*\}\);/);
});
