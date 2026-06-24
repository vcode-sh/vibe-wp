#!/bin/sh
# vibe-wp-mailq-flush — retry spooled mail. Run periodically by the cron
# container. On success delete the message; drop messages older than MAX_AGE
# so a permanently-failing relay can't grow the queue without bound.
set -eu
QDIR="${MSMTP_QUEUE:-/var/www/html/wp-content/.vibe/mail-queue}"
MAX_AGE_MIN="${MSMTP_QUEUE_MAX_AGE_MIN:-1440}"
[ -d "$QDIR" ] || exit 0
for f in "$QDIR"/*.mail; do
  [ -e "$f" ] || continue
  set --
  [ -f "${f}.args" ] && while IFS= read -r a; do set -- "$@" "$a"; done < "${f}.args"
  if msmtp "$@" < "$f" 2>/dev/null; then
    rm -f "$f" "${f}.args"
  elif [ -n "$(find "$f" -mmin +"$MAX_AGE_MIN" 2>/dev/null)" ]; then
    rm -f "$f" "${f}.args"
  fi
done
