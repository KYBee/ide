# Session Control

An Electron-based local control room for AI terminal work sessions. The MVP focuses on `tmux` as the persistent session layer, with optional non-persistent `pty` sessions for short-lived commands.

## Product Direction

Session Control is a local AI terminal session control center for macOS and Linux. It is meant to help developers monitor and control long-running `tmux` sessions used by tools like Codex, Claude Code, Gemini CLI, dev servers, test runners, and logs.

It is not trying to replace iTerm2, Terminal.app, Terminator, Ghostty, Tabby, or Hyper. The core idea is to sit above `tmux` and make active AI/work sessions easier to scan, attach to, and resume.

## Current Product Scope

The product we are building is a terminal session work control center, not a general terminal replacement.

Primary use cases:

- See active local `tmux` sessions in one place.
- Start a new work session quickly, optionally from a chosen working directory.
- Attach to a selected session inside the app.
- Use long-running sessions for Codex, Claude Code, Gemini CLI, shell work, dev servers, tests, and logs.
- Let the user fix metadata after a session already exists instead of forcing a complex creation form up front.
- Later, connect the same desktop app to remote agents running on a Mac mini or Linux server over Tailscale.

Target platforms:

- macOS
- Linux

Windows is intentionally out of scope.

## What It Does

- Lists existing `tmux` sessions.
- Starts a new local `tmux` work session with one click.
- Lets users set the working directory before starting a new session.
- Attaches an interactive browser terminal to a selected `tmux` session.
- Renames and kills `tmux` sessions.
- Starts non-persistent `pty` sessions.
- Loads quick-launch projects from `config/projects.yaml`.
- Tracks local session metadata such as agent type, command, cwd, and host.
- Lets users edit session metadata after the session already exists.
- Captures `tmux` pane snapshots for quick inspection.

## Important Design Decisions

- `tmux` is the persistence layer. If the app closes, `tmux` sessions should continue running.
- `pty` is the interactive terminal bridge used to attach xterm.js to a running session.
- The default session start flow should be lightweight: set a cwd, press `+`, then edit metadata later.
- Existing `tmux` sessions created in iTerm2, Terminal.app, Terminator, or any shell should be discoverable.
- Sessions not running inside `tmux` are not reliably importable.
- Remote machines should eventually use a small agent service, not repeated ad-hoc `ssh host 'tmux ...'` commands for the main user flow.

## Stack

- Desktop: Electron
- Local agent: Node.js, Express, pty bridge, WebSocket
- Frontend: React, Vite, xterm.js
- Session runtime: `tmux`

The local agent currently uses `@homebridge/node-pty-prebuilt-multiarch` for pty support because the original `node-pty` package failed on the current Node v23 runtime.

The initial prompt preferred Go, but this repository currently runs on a machine without Go installed. The agent is structured around small adapters so the process/session layer can be ported to Go later without changing the UI concept.

## Requirements

- Node.js 20+
- npm
- tmux

## Run Locally

For the desktop app:

```bash
npm install
npm run dev:desktop
```

This starts:

- Electron desktop shell
- React/Vite renderer on `http://127.0.0.1:3634`
- Local session backend on `http://127.0.0.1:3635`

For browser-only development:

```bash
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:3634
```

The API server listens on:

```text
http://127.0.0.1:3635
```

## Validation

Run the build and smoke checks before committing UI or tmux changes:

```bash
npm run build
npm run smoke
```

`npm run smoke` expects the local app to be running on `127.0.0.1:3634` and `127.0.0.1:3635`. It checks the web shell, API health, tmux session parsing, and tmux window creation/close behavior.

## Quick Launch Config

Edit `config/projects.yaml`:

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

Set `tmux: false` for an ephemeral process directly owned by the backend. Use `tmux: true` for anything you want to survive browser disconnects or backend restarts.

## Architecture

```text
desktop/
  Electron main/preload process
  Loads the local React UI

web/
  React dashboard
  xterm.js terminal view

server/
  Local agent HTTP API
  WebSocket terminal bridge
  tmux command adapter
  in-memory pty registry
  lightweight session metadata store

config/
  quick-launch projects
```

Near-term architecture:

```text
Electron desktop app
  -> local agent at 127.0.0.1:3635
    -> local tmux / pty / Codex / Claude / Gemini
```

Later remote architecture:

```text
Electron desktop app
  -> local agent
  -> Mac mini agent over Tailscale
  -> Linux server agent over Tailscale
```

## Existing Session Import

Existing `tmux` sessions should show up because the local agent lists sessions through `tmux list-sessions`.

This works:

```bash
tmux new -s codex-linktrip
tmux attach -t codex-linktrip
```

The app can discover that session and attach to it.

This does not work reliably:

```text
Codex/Claude/Gemini running directly in an iTerm2 tab without tmux
Terminal.app tabs that are not tmux sessions
Arbitrary shell processes outside tmux
```

For imported sessions, metadata such as `cwd`, `command`, and `agentType` may be incomplete at first. The user can edit it in the right panel. A planned improvement is to infer `cwd` and active command from tmux pane metadata.

## Version 1 Plan

### Done

- Electron desktop shell.
- React/xterm.js dashboard.
- Local agent API.
- `tmux` session listing.
- One-click new local tmux work session.
- User-provided start cwd.
- Attach to tmux through pty and WebSocket.
- Rename and kill tmux sessions.
- Quick launch config.
- Agent type metadata: Codex, Claude, Gemini, Shell, Build, Custom.
- Editable session metadata after creation.
- Basic `tmux capture-pane` snapshot.
- Empty tmux state returns `[]` instead of an API error.

### Next

- Improve existing tmux session import:
  - read `pane_current_path`
  - read `pane_current_command`
  - infer agent type from session name and active command
- Improve new-session UX:
  - quick cwd picker
  - recent cwd list
  - project presets
  - launch agent from selected cwd
- Add session status:
  - running
  - idle
  - waiting input
  - needs approval
  - completed
  - error
- Add agent-specific detectors:
  - Codex waiting for input
  - Claude approval prompt
  - Gemini waiting/completed states
- Add desktop notifications for waiting/completed/error states.
- Persist metadata in SQLite instead of JSON.
- Add session event timeline and command history.
- Package macOS and Linux builds.

## Later Remote Plan

The Mac mini and Linux server flow should use a remote agent:

```text
MacBook Electron app
  -> Mac mini session-control-agent over Tailscale
    -> tmux / Codex / Claude / Gemini running locally on Mac mini
```

Why remote agent instead of repeated SSH wrapping:

- Better day-to-day UX.
- Faster session list and attach.
- More reliable status monitoring.
- Cleaner snapshot/log/event collection.
- Easier to support notifications and agent state.

Minimum remote agent requirements:

- Bind to localhost by default.
- Remote mode must bind only to a Tailscale address or explicitly configured host.
- Token-based authentication.
- Same HTTP/WebSocket API shape as the local agent.
- macOS and Linux support.

## Reference Apps

Useful projects to study:

- Tabby: Electron terminal app with profiles, SSH, split panes, notifications.
- Hyper: web-technology terminal app and plugin model.
- electerm: Electron SSH/SFTP/terminal client.
- Wave Terminal: AI-oriented terminal workflow ideas.

Our differentiation is the control-room layer for AI agent sessions, not building the most complete standalone terminal emulator.

## Open Questions

- Should the local agent eventually be bundled inside Electron or installed as a separate background service?
- Should session metadata edits automatically rename tmux sessions, or remain separate labels?
- How much terminal output should be stored for status detection?
- Which notification events are useful enough to avoid noise?
- Should remote agents be manually installed first, or should the desktop app bootstrap them over SSH once?

## Immediate Next Work

The next coding task should probably be existing session import quality:

1. Use `tmux display-message` to read current pane path and command.
2. Show imported sessions with better `cwd`, command hints, and agent type.
3. Keep user-edited metadata as the source of truth after the user saves it.
