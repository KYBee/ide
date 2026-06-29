# Agent Working Rules

This project is a local terminal session control center for tmux-backed AI agent workflows.

## Development Flow

- Use TDD for all future feature work.
- Start each feature or bug fix by writing or updating a failing test that captures the intended behavior.
- Implement the smallest change that makes the test pass.
- Refactor only after the relevant tests are green.
- Run `npm run test` for logic changes.
- Run `npm run build` before handing off TypeScript, React, Electron, or server changes.
- Run `npm run smoke` when touching tmux, terminal attach, Electron launch, routing, or session lifecycle behavior.
- Run `npm run validate` before commits that should be considered stable.

## Product Constraints

- macOS and Linux are first-class targets.
- Windows support is intentionally out of scope.
- tmux sessions are the durable source of truth for long-running work.
- Electron and the web UI should attach to tmux without killing sessions when the app closes.
- Codex, Claude, Gemini, and Shell launch behavior should remain consistent across sidebar starts, tmux windows, and tmux splits.

## Implementation Notes

- Prefer small, testable helpers for launch input, tmux state parsing, status detection, and UI state derivation.
- Keep UI components focused on rendering and event wiring.
- Keep direct tmux command execution inside the server tmux module.
- Add regression tests for every previously fixed issue before changing nearby code.
