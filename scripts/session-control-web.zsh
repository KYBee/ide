#!/bin/zsh

set -eu

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"

cd "$PROJECT_DIR"
export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
unset TMUX TMUX_PANE

exec npm run preview --workspace web
