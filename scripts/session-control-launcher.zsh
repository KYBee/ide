#!/bin/zsh

set -eu

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
LOG_DIR="$PROJECT_DIR/.session-control"
LOG_FILE="$LOG_DIR/launcher.log"
LOCK_DIR="$LOG_DIR/launcher.lock"
PID_FILE="$LOCK_DIR/pid"
SERVER_TMUX_SESSION="session-control-server"
WEB_TMUX_SESSION="session-control-web"
DESKTOP_TMUX_SESSION="session-control-desktop"
RUNTIME_TMUX_SOCKET="session-control-runtime"

mkdir -p "$LOG_DIR"

export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

log_line() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >>"$LOG_FILE" 2>&1
}

activate_existing_app() {
  osascript -e 'tell application "Session Control" to activate' >/dev/null 2>&1 && return 0
  osascript -e 'tell application "System Events" to set frontmost of first process whose name is "Session Control" to true' >/dev/null 2>&1 && return 0
  osascript -e 'tell application "Electron" to activate' >/dev/null 2>&1 && return 0
  osascript -e 'tell application "System Events" to set frontmost of first process whose name is "Electron" to true' >/dev/null 2>&1 && return 0
  return 1
}

focus_desktop_shell() {
  local attempts=0
  while [ "$attempts" -lt 40 ]; do
    if activate_existing_app; then
      log_line "Session Control desktop shell activated"
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 0.25
  done

  log_line "Session Control desktop shell did not activate in time"
  return 1
}

port_is_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

app_ports_are_ready() {
  port_is_listening 3634 && port_is_listening 3635
}

wait_for_ready() {
  local attempts=0
  while [ "$attempts" -lt 40 ]; do
    if app_ports_are_ready; then
      log_line "Session Control ports are ready"
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 0.5
  done

  log_line "Session Control did not become ready in time"
  return 1
}

tmux_has_session() {
  tmux -L "$RUNTIME_TMUX_SOCKET" has-session -t "=$1" >/dev/null 2>&1
}

restart_tmux_service() {
  local session_name="$1"
  local script_path="$2"
  if tmux_has_session "$session_name"; then
    tmux -L "$RUNTIME_TMUX_SOCKET" kill-session -t "=$session_name" >/dev/null 2>&1 || true
  fi
  tmux -L "$RUNTIME_TMUX_SOCKET" new-session -d -s "$session_name" -c "$PROJECT_DIR" "$script_path >>\"$LOG_FILE\" 2>&1"
}

start_server_service() {
  if port_is_listening 3635; then
    log_line "Server port 3635 is already listening"
    return
  fi

  log_line "Starting Session Control server tmux service"
  restart_tmux_service "$SERVER_TMUX_SESSION" "$PROJECT_DIR/scripts/session-control-server.zsh"
}

start_web_service() {
  if port_is_listening 3634; then
    log_line "Web port 3634 is already listening"
    return
  fi

  log_line "Starting Session Control web tmux service"
  restart_tmux_service "$WEB_TMUX_SESSION" "$PROJECT_DIR/scripts/session-control-web.zsh"
}

start_desktop_service() {
  log_line "Starting Session Control desktop tmux signal"
  restart_tmux_service "$DESKTOP_TMUX_SESSION" "$PROJECT_DIR/scripts/session-control-desktop.zsh"
}

start_full_stack() {
  {
    echo ""
    log_line "Starting Session Control stable full stack"
    cd "$PROJECT_DIR"
    if [ ! -f "$PROJECT_DIR/server/dist/index.js" ] || [ ! -f "$PROJECT_DIR/web/dist/index.html" ]; then
      npm run build
    fi
    start_server_service
    start_web_service
    wait_for_ready
    start_desktop_shell
  } >>"$LOG_FILE" 2>&1
}

start_desktop_shell() {
  echo "" >>"$LOG_FILE" 2>&1
  log_line "Focusing Session Control desktop shell against existing ports"
  if activate_existing_app; then
    log_line "Existing Session Control desktop shell activated"
    return 0
  fi

  log_line "No existing Session Control desktop shell found; starting desktop tmux signal"
  start_desktop_service
  focus_desktop_shell || true
}

if app_ports_are_ready; then
  log_line "Session Control ports are ready; focusing desktop shell"
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
