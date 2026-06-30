# Session Control

Session Control is a local desktop/web app for managing terminal-based AI work sessions.

It is a control room for developers who run Codex, Claude Code, Gemini, shells, dev servers, builds, tests, and logs across multiple long-running terminal sessions. The app uses `tmux` as the durable session layer and gives those sessions a dashboard UI with an embedded terminal.

The project is focused on macOS and Linux. Windows is intentionally out of scope.

The current app is an MVP/development build. On macOS, the repository includes a local Dock launcher that starts the development stack. A fully packaged `Session Control.app` is planned, but not required for day-to-day MVP testing.

## Why This Exists

AI coding agents often run as CLI tools inside terminal sessions. Once several agents, shells, dev servers, and logs are running, it becomes hard to answer simple questions:

- Which sessions are alive?
- Which project directory is each agent working in?
- Which agent needs input?
- Can I reconnect without killing the work?
- Can I see Codex, Claude, Gemini, and shell work in one place?

Session Control solves this by sitting above `tmux`.

```text
Electron desktop app
  -> React dashboard
  -> local Node backend
  -> tmux sessions
  -> Codex / Claude / Gemini / shell / build commands
```

It is not trying to replace iTerm2, Terminal.app, Terminator, Ghostty, Tabby, or Hyper. Those are terminals. Session Control is a session control center.

## Core Features

- List existing local `tmux` sessions.
- Start new tmux-backed work sessions.
- Choose the working directory before starting a session.
- Launch sessions as Codex, Claude, Gemini, or Shell.
- Attach to a selected session through an embedded xterm.js terminal.
- Keep sessions alive even if the Electron app closes.
- Rename and kill tmux sessions.
- Edit session metadata after creation.
- Group sessions by project path or AI agent type.
- Manage tmux windows from the app.
- Create tmux splits with selected agent commands.
- Capture pane snapshots for quick inspection.
- Show Codex skill/tool metadata in the right panel.
- Run a local smoke test that checks web, API, tmux parsing, and tmux window creation.

## Current UI

The app is organized as a three-panel dashboard:

```text
Left sidebar        Center workspace              Right panel
-------------       -------------------------     --------------------
session list        xterm.js terminal attach      session metadata
path/AI grouping    tmux window controls          actions
new session         tmux split controls           agent tools
cwd picker          reconnect                     snapshot
```

The main workspace shows the actual attached terminal session. For Codex, Claude, or Gemini sessions, this is where the running agent conversation appears.

## Session Model

### tmux Sessions

`tmux` is the source of truth for durable work.

If Session Control exits, tmux sessions keep running. When the app starts again, it lists existing tmux sessions and can attach back to them.

Examples:

```bash
tmux new-session -s codex-linktrip
tmux attach-session -t codex-linktrip
tmux list-sessions
```

Sessions created from iTerm2, Terminal.app, Terminator, or a remote shell can be discovered as long as they are tmux sessions on the same machine.

### pty Sessions

The backend can also run direct pty sessions, but those are non-persistent. If the backend exits, those processes may exit too.

Use tmux for important or long-running work.

## Supported Agents

The launch controls currently support:

- Codex: `codex`
- Claude: `claude`
- Gemini: `agy`
- Shell: default shell without a startup command

The agent mapping is shared across sidebar session starts, tmux window creation, and tmux pane splits so the behavior stays consistent.

## Tech Stack

- Desktop: Electron
- Frontend: React, Vite, xterm.js
- Backend: Node.js, Express, WebSocket
- Terminal bridge: `@homebridge/node-pty-prebuilt-multiarch`
- Session runtime: `tmux`
- Config: YAML
- Tests: Node's built-in `node:test`, smoke test script
- macOS launcher: local `.app` wrapper with a tiny native launcher binary

The original product direction considered Go for the backend. This repository currently uses Node because it fits the existing Electron/Vite workspace and works well for the MVP.

## Requirements

- macOS or Linux
- Node.js 20+
- npm
- tmux

## Install

```bash
npm install
```

## Run

Desktop development app:

```bash
npm run dev:desktop
```

This starts:

- Electron desktop shell
- React/Vite renderer at `http://127.0.0.1:3634`
- Local backend at `http://127.0.0.1:3635`

Because this is still the development Electron runtime, macOS may show an `Electron` process/icon for the actual window. The macOS launcher below is a convenience launcher, not a fully packaged app.

Browser-only development:

```bash
npm run dev
```

Then open:

```text
http://127.0.0.1:3634
```

## macOS Launcher

The repository can install a local Dock-friendly launcher:

```bash
npm run install:launcher
open "Session Control Launcher.app"
```

The launcher does this:

```text
Session Control Launcher.app
  -> native launcher binary
  -> scripts/session-control-launcher.zsh
  -> isolated tmux runtime socket
  -> server, web, and Electron desktop processes
```

The internal runtime sessions use a separate tmux socket named `session-control-runtime`, so they do not appear in the user's normal Session Control session list.

Current limitation:

- The launcher is macOS-only.
- The actual window still uses the development Electron runtime.
- A future packaged build should replace this with a real `Session Control.app`, so Dock and menu bar identity are fully owned by the app.

## Linux Usage

The core app already works on Linux as a local web/dashboard workflow. Install the same dependencies and run either the browser UI or the development desktop shell:

```bash
npm install
npm run dev
```

Then open:

```text
http://127.0.0.1:3634
```

For the Electron shell on Linux:

```bash
npm run dev:desktop
```

Linux requirements:

- `tmux`
- Node.js and npm
- a working shell such as `bash` or `zsh`
- optional agent CLIs such as `codex`, `claude`, and `agy`

The macOS `.app` launcher does not apply to Linux. Linux packaging should eventually be added as an AppImage, `.deb`, or another desktop-native format.

## Validation

Run logic tests:

```bash
npm run test
```

Run TypeScript and production build checks:

```bash
npm run build
```

Run local smoke checks:

```bash
npm run smoke
```

Run the full validation flow:

```bash
npm run validate
```

`npm run smoke` expects the local app to be running on `127.0.0.1:3634` and `127.0.0.1:3635`. It checks:

- Electron main process syntax
- launcher script syntax
- native launcher syntax
- web app reachability
- API health
- session response shape
- tmux window listing
- tmux window creation and close behavior

## TDD Rule

Future feature work should follow TDD. See [AGENT.md](./AGENT.md).

In short:

1. Add or update a failing test for the behavior.
2. Implement the smallest change that makes it pass.
3. Refactor after tests are green.
4. Run the relevant validation command before handoff.

## Quick Launch Config

Quick launch project config lives in [config/projects.yaml](./config/projects.yaml).

Example:

```yaml
projects:
  - name: LinkTrip Backend
    cwd: ~/5-2_link_trip
    command: docker compose up
    tmux: true
    agentType: build

  - name: Codex - LinkTrip
    cwd: ~/5-2_link_trip
    command: codex
    tmux: true
    agentType: codex
```

Use `tmux: true` for durable sessions. Use `tmux: false` only for short-lived processes that can be owned directly by the backend.

## Project Structure

```text
desktop/
  Electron main and preload process

web/
  React dashboard
  xterm.js terminal component
  session UI components
  launch and panel-width helpers

server/
  Express API
  WebSocket terminal attach
  tmux command adapter
  pty registry
  metadata store
  skill registry reader

scripts/
  smoke test
  icon helpers
  macOS launcher scripts
  service wrapper scripts

tests/
  node:test regression tests

config/
  quick launch project config
```

## Architecture

```text
Electron desktop shell
  main/preload
    OS integration
    single-instance behavior
    directory picker

  renderer
    React dashboard
    xterm.js terminal
    session list
    metadata/actions panel

Local backend
  HTTP API
  WebSocket terminal bridge
  tmux adapter
  pty registry
  JSON metadata store
```

Current development runtime:

```text
npm run dev:desktop
  -> concurrently
  -> server dev process
  -> web dev process
  -> electron .
```

macOS launcher runtime:

```text
Session Control Launcher.app
  -> native launcher binary
  -> scripts/session-control-launcher.zsh
  -> tmux -L session-control-runtime
  -> server: npm run start --workspace server
  -> web: npm run preview --workspace web
  -> desktop: npm run dev --workspace desktop
```

Terminal attach flow:

```text
React TerminalPane
  -> WebSocket /term
  -> backend pty
  -> tmux attach-session -d -t <session>
  -> running shell or AI agent
```

## Existing tmux Import

Existing tmux sessions should appear automatically because the backend uses tmux commands such as:

```bash
tmux list-sessions
tmux list-panes
tmux list-windows
```

This works:

```bash
tmux new-session -s codex-work
```

Then Session Control can discover and attach to `codex-work`.

This does not work reliably:

- arbitrary iTerm2 tabs that are not tmux sessions
- Terminal.app windows that are not tmux sessions
- Claude/Codex/Gemini processes started directly outside tmux

## Remote Direction

Remote Mac mini and Linux support should eventually use a small remote agent instead of repeated ad-hoc SSH commands.

Target shape:

```text
MacBook Session Control
  -> local backend
  -> Mac mini session-control-agent over Tailscale
  -> tmux / Codex / Claude / Gemini on Mac mini
```

Why a remote agent:

- faster session list and attach
- stable reconnect behavior
- better monitoring
- cleaner snapshots and logs
- easier notifications

## Roadmap

Near term:

- More regression tests around tmux parsing and attach behavior.
- Better detection for Codex, Claude, and Gemini waiting states.
- Desktop notifications for waiting input, completion, and errors.
- Recent working directories.
- Cleaner project presets.
- More robust snapshot and timeline UI.

Later:

- SQLite metadata store.
- Remote agent for Mac mini and Linux hosts.
- Packaged macOS app build.
- Linux desktop packaging.
- Session timeline and command history.
- Agent status monitor across local and remote machines.

## Non-Goals

- Replacing full terminal emulators.
- Windows, PowerShell, WSL, or ConPTY support.
- iTerm2 or Terminator plugin integration in v1.
- Running remote sessions only through repeated SSH command prefixes as the primary UX.
