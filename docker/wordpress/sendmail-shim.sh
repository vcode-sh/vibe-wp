#!/bin/sh
# vibe-wp-sendmail — relay-mode sendmail_path. Read the RFC5322 message on stdin,
# attempt immediate delivery via msmtp; on ANY failure spool it to the shared
# queue dir for the cron container to retry. Always exit 0 so WordPress never
# sees a hard mail error — the queue guarantees eventual delivery (or expiry).
# Args from PHP (e.g. -t -i, envelope-from) are forwarded to msmtp verbatim.
set -eu
QDIR="${MSMTP_QUEUE:-/var/www/html/wp-content/.vibe/mail-queue}"
msg="$(cat)"
if printf '%s' "$msg" | msmtp "$@" 2>/dev/null; then
  exit 0
fi
umask 077
mkdir -p "$QDIR"
f="$(mktemp "$QDIR/XXXXXXXX.mail" 2>/dev/null)" || exit 0
printf '%s' "$msg" > "$f"
# Persist the msmtp args alongside the body so the flush replays them exactly.
printf '%s\n' "$@" > "${f}.args"
exit 0
