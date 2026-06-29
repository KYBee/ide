#!/bin/zsh

set -eu

cd /Users/kybee/Documents/advanced-terminal
export PATH="/Users/kybee/.nvm/versions/node/v20.20.2/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
unset TMUX TMUX_PANE

exec npm run start --workspace server
