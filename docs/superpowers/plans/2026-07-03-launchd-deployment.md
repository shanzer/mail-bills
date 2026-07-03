# launchd Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a native macOS boot-service deployment for the mail-bills API: launchd plist template, install/uninstall scripts, log rotation, docs. Closes GitHub issue #30.

**Architecture:** A `deploy/` directory holding a plist *template* rendered at install time (absolute node path, repo path, config path resolved per machine). Install goes to `~/Library/LaunchAgents` (gui domain — the service needs the user context for iCloud/Vision). Logs to `~/Library/Logs/mail-bills/` rotated by a `newsyslog.d` drop-in (sudo, with graceful fallback to printed instructions).

**Tech Stack:** POSIX shell (bash), launchd/launchctl, newsyslog. No TypeScript changes.

## Global Constraints

- Nothing in `deploy/` may contain a hardcoded username or token; everything machine-specific is resolved by `install.sh` at run time.
- `install.sh` must be idempotent (re-running upgrades in place) and must fail with a clear message when the config file is missing or `npm run build` fails.
- `uninstall.sh` removes the service and plist only — never touches data, logs, or config.
- Scripts pass `bash -n` (syntax) and `shellcheck` if available.
- Branch: `deploy/launchd` off current `main`; commit references `Closes #30`.

---

### Task 1: deploy artifacts + README section

**Files:**
- Create: `deploy/com.mail-bills.api.plist.template`, `deploy/install.sh`, `deploy/uninstall.sh`, `deploy/newsyslog-mail-bills.conf.template`
- Modify: `README.md` (new "Run as a boot service (launchd)" section)

**Interfaces:**
- Produces: `install.sh [--config <path>] [--port <port>]` and `uninstall.sh`, both runnable from any cwd (they resolve the repo root from their own location).

- [ ] **Step 1: Write the plist template** (`deploy/com.mail-bills.api.plist.template`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mail-bills.api</string>
  <key>ProgramArguments</key>
  <array>
    <string>__NODE__</string>
    <string>__REPO__/dist/src/cli.js</string>
    <string>api</string>
    <string>--config</string>
    <string>__CONFIG__</string>
  </array>
  <key>WorkingDirectory</key>
  <string>__REPO__</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>15</integer>
  <key>StandardOutPath</key>
  <string>__LOG_DIR__/mail-bills.log</string>
  <key>StandardErrorPath</key>
  <string>__LOG_DIR__/mail-bills.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

(`KeepAlive.SuccessfulExit=false` restarts on crash but lets a clean `launchctl bootout` stop it; `ThrottleInterval` prevents crash-loop spin. PATH includes Homebrew for the `ollama` CLI.)

- [ ] **Step 2: Write the newsyslog template** (`deploy/newsyslog-mail-bills.conf.template`):

```
# logfilename                              [owner:group]  mode count size(KB) when flags
__LOG_DIR__/mail-bills.log                 __USER__:staff 644  5     10240    *    J
__LOG_DIR__/mail-bills.err.log             __USER__:staff 644  5     10240    *    J
```

- [ ] **Step 3: Write `deploy/install.sh`:**

```bash
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
```

- [ ] **Step 4: Write `deploy/uninstall.sh`:**

```bash
#!/bin/bash
# Remove the mail-bills launchd agent. Leaves data, config, and logs intact.
set -euo pipefail
LABEL="com.mail-bills.api"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed $LABEL. Data and logs were left in place."
echo "Log rotation config (if installed): sudo rm /etc/newsyslog.d/mail-bills.conf"
```

- [ ] **Step 5: `chmod +x deploy/install.sh deploy/uninstall.sh`; run `bash -n` on both; run `shellcheck deploy/*.sh` if shellcheck exists** — fix any findings.

- [ ] **Step 6: README section** — add after the Commands section:

```markdown
## Run as a boot service (launchd)

```bash
./deploy/install.sh                      # uses ./config.yaml
./deploy/install.sh --config /path/to/config.yaml --port 8765
./deploy/uninstall.sh                    # stop + remove (keeps data/logs)
```

`install.sh` builds the project, renders `deploy/com.mail-bills.api.plist.template`
with this machine's node/repo/config paths, installs it as a user LaunchAgent
(`RunAtLoad` + `KeepAlive`: starts at login, restarts on crash), and writes logs to
`~/Library/Logs/mail-bills/` (rotated via `/etc/newsyslog.d/mail-bills.conf`,
which needs sudo — the script prints manual instructions if it can't).

Because it runs as a *user* agent, the service has your user context — required
for Vision OCR, the `ollama` CLI, and iCloud folder access. It starts at login,
not at system boot.
```

- [ ] **Step 7: Verify tests still green** (`npm run check && npm test` — no TS changes, sanity only), **commit** on branch `deploy/launchd`: `"Add launchd boot-service deployment scripts"` + `Closes #30`.

### Task 2: live install verification (controller-run, not subagent)

- [ ] Run `./deploy/install.sh` on this machine (config: repo `config.yaml`, port 8765 free — verified).
- [ ] `curl -sf http://127.0.0.1:8765/health` returns ok.
- [ ] `launchctl print gui/$UID/com.mail-bills.api` shows running state; kill the PID and confirm launchd restarts it (KeepAlive).
- [ ] PR → merge to main → push both remotes.
