# Remote Agent Setup

This guide connects a Mac mini tmux workspace to the Session Control app running on your main Mac.

The main Mac remains the UI/coordinator. The Mac mini runs the same server in `agent` mode and controls its own local tmux sessions.

```text
Main Mac
  React/Electron UI
  local Session Control server
    -> local tmux
    -> Mac mini Session Control agent over VPN

Mac mini
  Session Control server in agent mode
    -> local tmux
    -> Codex / Claude / Gemini / shell sessions
```

## Requirements

- VPN connectivity from the main Mac to the Mac mini.
- Node.js 20+, npm, and tmux on the Mac mini.
- The same repository cloned on both machines.
- Codex, Claude, Gemini, or other agent CLIs installed on the Mac mini if you want to run them there.

## 1. Start the Agent on the Mac mini

On the Mac mini:

```bash
git clone git@github.com:KYBee/ide.git
cd ide
npm install
npm run build
```

Choose a shared token. Keep it out of git.

```bash
export SESSION_CONTROL_MODE=agent
export SESSION_CONTROL_AGENT_TOKEN="replace-with-a-long-random-token"
export HOST=0.0.0.0
export PORT=3635
npm run start
```

For a long-running manual setup, run that command inside tmux. Later this can be moved to launchd.

```bash
tmux new-session -s session-control-agent
```

If possible, restrict access to the VPN interface or allow the port only from your VPN subnet. The token is required, but the port should still not be exposed broadly.

## 2. Configure the Main Mac

On the main Mac, put the Mac mini token in your shell environment:

```bash
export SESSION_CONTROL_MACMINI_TOKEN="replace-with-the-same-token"
```

Add the agent host to `config/projects.yaml`:

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

projects:
  - name: Shell
    cwd: ~
    command: $SHELL
    tmux: true
    agentType: shell
    tags:
      - local
```

Use the Mac mini VPN address in `baseUrl`.

## 3. Run Session Control on the Main Mac

```bash
npm run dev:desktop
```

The session list should include local sessions and Mac mini sessions. Remote sessions use IDs like:

```text
tmux:macmini:codex-work
```

Local sessions keep their existing IDs:

```text
tmux:codex-work
```

## Supported in the Initial Agent Flow

- List Mac mini tmux sessions.
- Attach to a Mac mini tmux session through the existing terminal pane.
- Capture snapshots.
- Send input/commands.
- List and manage tmux windows and panes through forwarded agent API calls.

## Troubleshooting

Check agent health from the main Mac:

```bash
curl -H "Authorization: Bearer $SESSION_CONTROL_MACMINI_TOKEN" \
  http://100.x.x.x:3635/api/health
```

Expected response:

```json
{"ok":true}
```

If the UI does not show Mac mini sessions:

- Confirm the VPN can reach the Mac mini address.
- Confirm the Mac mini server is running with `SESSION_CONTROL_MODE=agent`.
- Confirm the token environment variable on the main Mac matches `tokenEnv`.
- Confirm tmux is installed and has sessions on the Mac mini.
