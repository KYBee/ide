#!/bin/zsh

set -eu

PROJECT_DIR="/Users/kybee/Documents/advanced-terminal"
LOG_DIR="$PROJECT_DIR/.session-control"
LOG_FILE="$LOG_DIR/launcher.log"
LOCK_DIR="$LOG_DIR/launcher.lock"
PID_FILE="$LOCK_DIR/pid"

mkdir -p "$LOG_DIR"

export PATH="/Users/kybee/.nvm/versions/node/v20.20.2/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

log_line() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >>"$LOG_FILE" 2>&1
}

activate_existing_app() {
  open -a "Electron" >/dev/null 2>&1 && return 0
  osascript -e 'tell application "Electron" to activate' >/dev/null 2>&1 && return 0
  osascript -e 'tell application "Session Control" to activate' >/dev/null 2>&1 && return 0
  osascript -e 'tell application "System Events" to set frontmost of first process whose name is "Session Control" to true' >/dev/null 2>&1 && return 0
  osascript -e 'tell application "System Events" to set frontmost of first process whose name is "Electron" to true' >/dev/null 2>&1 && return 0
  return 1
}

port_is_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

app_ports_are_ready() {
  port_is_listening 3634 &&
    port_is_listening 3635 &&
    curl -fsS "http://127.0.0.1:3635/api/health" >/dev/null 2>&1
}

start_full_stack() {
  {
    echo ""
    log_line "Starting Session Control stable full stack"
    cd "$PROJECT_DIR"
    if [ ! -f "$PROJECT_DIR/server/dist/index.js" ] || [ ! -f "$PROJECT_DIR/web/dist/index.html" ]; then
      npm run build
    fi
    npm run launch:desktop
  } >>"$LOG_FILE" 2>&1
}

start_desktop_shell() {
  {
    echo ""
    log_line "Starting Session Control desktop shell against existing ports"
    cd "$PROJECT_DIR"
    npm run dev --workspace desktop
  } >>"$LOG_FILE" 2>&1
}

if app_ports_are_ready; then
  log_line "Session Control ports are ready; starting desktop shell signal"
  start_desktop_shell
  exit 0
fi

if mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "$$" >"$PID_FILE"
  trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM
else
  EXISTING_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$EXISTING_PID" ] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    log_line "Session Control launcher is already starting; focusing if possible"
    activate_existing_app && exit 0
    exit 0
  fi

  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR"
  echo "$$" >"$PID_FILE"
  trap 'rm -rf "$LOCK_DIR"' EXIT INT TERM
fi

start_full_stack
