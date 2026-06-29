# Scope

## Product

Session Control is a local desktop control room for terminal-based AI work sessions.

The app is designed for developers who run multiple terminal agents and long-running commands at the same time:

- Codex
- Claude Code
- Gemini CLI
- dev servers
- build/test commands
- Docker logs

## Target Platforms

- macOS
- Linux

Windows is intentionally out of scope for now. That lets the app stay focused on POSIX shells, `tmux`, and Unix-style process control.

## Core Idea

`tmux` is the persistence layer. Electron is the local desktop shell. React and xterm.js provide the dashboard and terminal surface.

```text
Electron
  main/preload
    local OS integration
    notifications
    future IPC API

  renderer
    React dashboard
    xterm.js terminal

Local backend
  tmux adapter
  pty bridge
  session metadata
```

## MVP

- Electron app window
- tmux session list
- tmux attach
- create tmux session
- rename session
- kill session
- quick launch config
- local metadata store for cwd, command, host, and agent type
- basic snapshot via `tmux capture-pane`

## Next

- Agent type: Codex, Claude, Gemini, Shell, Build
- Agent state: running, waiting input, needs approval, completed, error, idle
- desktop notifications
- session timeline
- remote SSH tmux hosts

## Non-Goals

- Replacing a full terminal emulator
- Windows support
- PowerShell, WSL, or ConPTY compatibility
- iTerm2/Terminator plugin integration in the first version
