#!/bin/sh
# vibe-wp-mail-log — log mode sendmail_path. Capture the raw message to a file
# for debugging "what would have been sent"; never connects to a server.
set -eu
QDIR="${MSMTP_QUEUE:-/var/www/html/wp-content/.vibe/mail-queue}"
umask 077
mkdir -p "$QDIR/log"
f="$(mktemp "$QDIR/log/XXXXXXXX.eml" 2>/dev/null)" || exit 0
cat > "$f"
exit 0
