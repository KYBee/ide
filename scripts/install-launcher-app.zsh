#!/bin/zsh

set -eu

PROJECT_DIR="/Users/kybee/Documents/advanced-terminal"
APP_PATH="$PROJECT_DIR/Session Control Launcher.app"
INFO_PLIST="$APP_PATH/Contents/Info.plist"
TMP_DIR="$(mktemp -d)"
TMP_APP="$TMP_DIR/Session Control Launcher.app"

trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

cd "$PROJECT_DIR"

xattr -cr "$PROJECT_DIR/scripts/session-control-launcher.jxa.js" 2>/dev/null || true
osacompile -l JavaScript -o "$TMP_APP" "$PROJECT_DIR/scripts/session-control-launcher.jxa.js"

rm -rf "$APP_PATH"
mv "$TMP_APP" "$APP_PATH"
mkdir -p "$APP_PATH/Contents/Resources"
node "$PROJECT_DIR/scripts/build-icns.mjs"

plutil -replace CFBundleDisplayName -string "Session Control" "$INFO_PLIST"
plutil -replace CFBundleIdentifier -string "local.session-control.launcher" "$INFO_PLIST"
plutil -replace CFBundleIconFile -string "AppIcon" "$INFO_PLIST"
plutil -replace CFBundleIconName -string "AppIcon" "$INFO_PLIST"

xattr -cr "$APP_PATH"
touch "$APP_PATH"

echo "Installed $APP_PATH"
