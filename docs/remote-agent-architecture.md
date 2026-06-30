# Remote Agent Architecture

This document explains the intended Mac mini integration model for Session Control.

## Goal

Run the Session Control UI on the main Mac while also seeing and controlling tmux sessions that live on a Mac mini over VPN.

The Mac mini can run Codex and other agent CLIs locally, so it should control its own tmux sessions directly. The main Mac should act as the single dashboard.

## Runtime Model

```text
Main Mac
  Electron / React UI
  Session Control server in coordinator mode
    -> local tmux
    -> Mac mini Session Control agent over VPN

Mac mini
  Session Control server in agent mode
    -> local tmux
    -> Codex / Claude / Gemini / shell sessions
```

The coordinator keeps the frontend simple. The React app continues to talk only to the local server, and the local server handles remote agent calls and terminal WebSocket proxying.

## Modes

### Coordinator Mode

Default mode. This is what the main Mac runs.

Responsibilities:

- Load `hosts` from `config/projects.yaml`.
- List local tmux/pty sessions.
- Query each configured remote agent host.
- Merge all sessions into one `/api/sessions` response.
- Proxy remote terminal WebSockets.
- Forward remote tmux operations to the selected agent host.

### Agent Mode

Enabled with:

```bash
SESSION_CONTROL_MODE=agent
```

This is what the Mac mini runs.

Responsibilities:

- Expose the existing Session Control server API.
- Control only the Mac mini's local tmux server.
- Require `SESSION_CONTROL_AGENT_TOKEN` when configured.
- Avoid querying additional remote hosts.

## Host Config

```yaml
hosts:
  - id: local
    label: Local
    type: local

  - id: macmini
    label: Mac mini
    type: agent
    baseUrl: http://100.x.x.x:3635
    tokenEnv: SESSION_CONTROL_MACMINI_TOKEN
```

Host IDs must be stable because they become part of remote session IDs.

## Session IDs

Local tmux sessions keep the existing shape:

```text
tmux:<session-name>
```

Remote agent tmux sessions use:

```text
tmux:<host-id>:<session-name>
```

Example:

```text
tmux:macmini:codex-api
```

This avoids collisions when local and remote hosts have tmux sessions with the same name.

## API Shape

The frontend still calls the local coordinator.

Local tmux route:

```text
/api/sessions/tmux/:name
```

Remote tmux route:

```text
/api/hosts/:hostId/sessions/tmux/:name
```

The coordinator forwards remote requests to the agent's normal local API, for example:

```text
Coordinator:
  /api/hosts/macmini/sessions/tmux/codex-api/windows

Mac mini agent:
  /api/sessions/tmux/codex-api/windows
```

## Terminal Attach

The UI opens one WebSocket to the local coordinator:

```text
/term?session=tmux:macmini:codex-api
```

The coordinator opens a second WebSocket to the Mac mini agent:

```text
http://100.x.x.x:3635/term?session=tmux:codex-api
```

Then it bridges terminal messages in both directions. Resize and input messages sent before the remote socket opens are queued briefly and flushed when the remote socket is ready.

## Authentication

Agent mode supports a shared bearer token:

```bash
SESSION_CONTROL_AGENT_TOKEN=...
```

The coordinator reads the token from the environment variable named by `tokenEnv`:

```bash
SESSION_CONTROL_MACMINI_TOKEN=...
```

Then it sends:

```text
Authorization: Bearer <token>
```

This is intentionally simple because the deployment is personal and VPN-only. The token should still be treated as a secret and kept out of git.

## Implementation Phases

### Phase 1: Remote Agent MVP

Implemented in the remote agent branch:

- Host-aware config.
- Coordinator and agent modes.
- Agent token auth.
- Remote session aggregation.
- Remote tmux session IDs.
- Snapshot forwarding.
- tmux command/input forwarding.
- Window and pane operation forwarding.
- Remote terminal WebSocket proxy.
- Mac mini setup guide.

### Phase 2: Operational Polish

Good next steps:

- Add a launchd plist for Mac mini agent startup.
- Show remote host health in the UI.
- Surface remote host connection errors instead of silently skipping failed hosts.
- Add a dedicated host filter/group in the sidebar.
- Add smoke tests that run against a fake or local agent endpoint.

### Phase 3: Broader Node Model

If more machines are added later:

- Treat every machine as a Session Control node.
- Add version/capability discovery.
- Add per-host settings and health checks.
- Consider mTLS or a stronger auth model if the network boundary changes.

## Operational Notes

- Keep the Mac mini agent bound to the VPN interface when possible.
- If binding to `0.0.0.0`, rely on firewall/VPN rules plus token auth.
- The Mac mini must have tmux and any desired agent CLIs installed locally.
- The coordinator branch and Mac mini branch should match during early testing.
