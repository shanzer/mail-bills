#!/bin/bash
# Install the mail-bills API as a launchd user agent (boot + crash restart).
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="$REPO/config.yaml"
PORT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --config) CONFIG="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"; shift 2 ;;
    --port)   PORT="$2"; shift 2 ;;
    *) echo "usage: install.sh [--config <path>] [--port <port>]" >&2; exit 2 ;;
  esac
done

LABEL="com.mail-bills.api"
LOG_DIR="$HOME/Library/Logs/mail-bills"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE_BIN="$(command -v node || true)"

[[ -n "$NODE_BIN" ]] || { echo "error: node not found in PATH" >&2; exit 1; }
[[ -f "$CONFIG" ]] || { echo "error: config not found: $CONFIG (pass --config)" >&2; exit 1; }

echo "Building..."
(cd "$REPO" && npm run build >/dev/null)

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

sed -e "s|__NODE__|$NODE_BIN|g" \
    -e "s|__REPO__|$REPO|g" \
    -e "s|__CONFIG__|$CONFIG|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    "$REPO/deploy/com.mail-bills.api.plist.template" > "$PLIST"

if [[ -n "$PORT" ]]; then
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments: string --port" "$PLIST"
  /usr/libexec/PlistBuddy -c "Add :ProgramArguments: string $PORT" "$PLIST"
fi

# Idempotent (re)load: bootout is allowed to fail on first install.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/$LABEL"

NEWSYSLOG_SRC="$REPO/deploy/newsyslog-mail-bills.conf.template"
NEWSYSLOG_DST="/etc/newsyslog.d/mail-bills.conf"
if sudo -n true 2>/dev/null || [[ -t 0 ]]; then
  sed -e "s|__LOG_DIR__|$LOG_DIR|g" -e "s|__USER__|$(id -un)|g" "$NEWSYSLOG_SRC" \
    | sudo tee "$NEWSYSLOG_DST" >/dev/null \
    && echo "Log rotation installed at $NEWSYSLOG_DST" \
    || echo "warning: could not install $NEWSYSLOG_DST; run install.sh again with sudo access for log rotation" >&2
else
  echo "note: skipping log rotation (needs sudo). To install manually:"
  echo "  sed -e 's|__LOG_DIR__|$LOG_DIR|g' -e 's|__USER__|$(id -un)|g' $NEWSYSLOG_SRC | sudo tee $NEWSYSLOG_DST"
fi

echo "Installed. Status:"
launchctl print "gui/$(id -u)/$LABEL" | grep -E "state|pid" | head -3 || true
echo "Logs: $LOG_DIR"
