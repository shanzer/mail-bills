#!/bin/bash
# Remove the mail-bills launchd agent. Leaves data, config, and logs intact.
set -euo pipefail
LABEL="com.mail-bills.api"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "Removed $LABEL. Data and logs were left in place."
echo "Log rotation config (if installed): sudo rm /etc/newsyslog.d/mail-bills.conf"
