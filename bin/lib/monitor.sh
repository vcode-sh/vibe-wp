#!/usr/bin/env sh
# Monitoring helpers: a small set of health checks for the running stack plus
# alert senders (Telegram, generic webhook, email). Everything reads its
# configuration through vibe_env_value so values come from the selected env
# file; secrets (tokens) are only ever passed to curl, never printed.
#
# Counters and the human-readable report are accumulated in shell variables
# owned by the caller (bin/monitor): monitor_warnings, monitor_failures and
# monitor_report. The check functions update them via the record helpers.

# --- result recording ------------------------------------------------------

# monitor_report holds the plain-text report; appended line by line.
monitor_report=""
monitor_warnings=0
monitor_failures=0

# monitor_quiet=1 suppresses per-check ok/warn/fail lines on stdout.
monitor_quiet="${monitor_quiet:-0}"

monitor_emit() {
  # Print a check result line unless running quiet.
  if [ "${monitor_quiet}" != "1" ]; then
    printf '%s\n' "$1"
  fi
}

monitor_ok() {
  monitor_emit "ok: $*"
}

monitor_warn() {
  monitor_warnings=$((monitor_warnings + 1))
  monitor_emit "warn: $*"
  monitor_report="${monitor_report}warn: $*\n"
}

monitor_fail() {
  monitor_failures=$((monitor_failures + 1))
  monitor_emit "fail: $*"
  monitor_report="${monitor_report}fail: $*\n"
}

# --- helpers ---------------------------------------------------------------

# Extract the bare hostname from a URL (strips scheme, path, port).
monitor_url_host() {
  printf '%s' "$1" | sed -e 's#^[a-zA-Z][a-zA-Z0-9+.-]*://##' -e 's#/.*$##' -e 's#:.*$##'
}

# Used% (integer, no % sign) for the filesystem holding the given path.
monitor_disk_used_pct() {
  df -P "$1" 2>/dev/null | awk 'NR==2 { gsub(/%/, "", $5); print $5 }'
}

# Newest immediate sub-directory of the given root, or empty.
monitor_newest_dir() {
  ls -1dt "$1"/*/ 2>/dev/null | head -n 1
}

# --- checks ----------------------------------------------------------------

# 1. HTTP uptime: the site must answer with an HTTP status < 400.
monitor_check_http() {
  url="$(vibe_wp_home)"
  if [ -z "${url}" ]; then
    monitor_warn "HTTP uptime: no WP_HOME/WP_SITEURL configured (skipped)"
    return 0
  fi
  # curl already prints 000 on connection-refused/timeout/DNS-failure; do NOT
  # add a `|| printf 000` fallback or it concatenates to "000000", which would
  # slip past a `= 000` guard and read as < 400 (a hard-down site reported Up).
  code="$(curl -sS -L -o /dev/null -w '%{http_code}' --max-time 15 "${url}/" 2>/dev/null)"
  case "${code}" in
    2??|3??) monitor_ok "HTTP uptime: ${url} returned ${code}" ;;
    *) monitor_fail "HTTP uptime: ${url} returned ${code:-000}" ;;
  esac
}

# 2. Disk space: backup root filesystem and / must have headroom.
monitor_check_disk() {
  warn_pct="$(vibe_env_value VIBE_MONITOR_DISK_WARN_PCT)"
  [ -n "${warn_pct}" ] || warn_pct=85

  if command -v backup_root >/dev/null 2>&1; then
    broot="$(backup_root)"
  else
    broot="backups"
  fi
  [ -d "${broot}" ] || broot="."

  for path in "${broot}" "/"; do
    used="$(monitor_disk_used_pct "${path}")"
    if [ -z "${used}" ]; then
      monitor_warn "Disk space: could not read usage for ${path} (skipped)"
      continue
    fi
    if [ "${used}" -ge 95 ] 2>/dev/null; then
      monitor_fail "Disk space: ${path} is ${used}% used"
    elif [ "${used}" -ge "${warn_pct}" ] 2>/dev/null; then
      monitor_warn "Disk space: ${path} is ${used}% used"
    else
      monitor_ok "Disk space: ${path} is ${used}% used"
    fi
  done
}

# 3. TLS certificate expiry for the production domain.
monitor_check_tls() {
  url="$(vibe_wp_home)"
  host="$(monitor_url_host "${url}")"
  if [ -z "${host}" ] || [ "${host}" = "localhost" ]; then
    monitor_warn "TLS certificate: no public domain to check (${host:-unset}, skipped)"
    return 0
  fi
  if ! command -v openssl >/dev/null 2>&1; then
    monitor_warn "TLS certificate: openssl not available (skipped)"
    return 0
  fi

  warn_days="$(vibe_env_value VIBE_MONITOR_CERT_WARN_DAYS)"
  [ -n "${warn_days}" ] || warn_days=14

  end_date="$(echo | openssl s_client -servername "${host}" -connect "${host}:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | sed -n 's/^notAfter=//p')"
  if [ -z "${end_date}" ]; then
    monitor_warn "TLS certificate: could not read certificate for ${host} (skipped)"
    return 0
  fi

  end_epoch="$(date -d "${end_date}" +%s 2>/dev/null || true)"
  if [ -z "${end_epoch}" ]; then
    # BSD/macOS date fallback (best effort).
    end_epoch="$(date -j -f '%b %d %T %Y %Z' "${end_date}" +%s 2>/dev/null || true)"
  fi
  if [ -z "${end_epoch}" ]; then
    monitor_warn "TLS certificate: could not parse expiry '${end_date}' for ${host} (skipped)"
    return 0
  fi

  now_epoch="$(date +%s)"
  days_left=$(( (end_epoch - now_epoch) / 86400 ))
  if [ "${days_left}" -lt 0 ]; then
    monitor_fail "TLS certificate: ${host} expired ${days_left#-} day(s) ago"
  elif [ "${days_left}" -lt "${warn_days}" ]; then
    monitor_warn "TLS certificate: ${host} expires in ${days_left} day(s)"
  else
    monitor_ok "TLS certificate: ${host} valid for ${days_left} day(s)"
  fi
}

# 4. Backup freshness: newest backup directory must be recent.
monitor_check_backup() {
  max_age="$(vibe_env_value VIBE_MONITOR_BACKUP_MAX_AGE_HOURS)"
  [ -n "${max_age}" ] || max_age=26

  if command -v backup_root >/dev/null 2>&1; then
    broot="$(backup_root)"
  else
    broot="backups"
  fi

  newest="$(monitor_newest_dir "${broot}")"
  if [ -z "${newest}" ]; then
    monitor_warn "Backup freshness: no backups found under ${broot}"
    return 0
  fi

  mtime="$(date -r "${newest}" +%s 2>/dev/null || true)"
  if [ -z "${mtime}" ]; then
    monitor_warn "Backup freshness: could not stat ${newest} (skipped)"
    return 0
  fi
  now_epoch="$(date +%s)"
  age_hours=$(( (now_epoch - mtime) / 3600 ))
  if [ "${age_hours}" -gt "${max_age}" ]; then
    monitor_warn "Backup freshness: newest backup ${newest} is ${age_hours}h old (max ${max_age}h)"
  else
    monitor_ok "Backup freshness: newest backup is ${age_hours}h old"
  fi
}

# 5. Container health: expected services must be running.
monitor_check_containers() {
  expected="wordpress nginx"
  if vibe_compose_service_exists db; then
    expected="${expected} db"
  fi
  if vibe_compose_service_exists redis; then
    expected="${expected} redis"
  fi

  for svc in ${expected}; do
    if ! vibe_compose_service_exists "${svc}"; then
      monitor_warn "Container health: service ${svc} not defined for ${VIBE_ENV} (skipped)"
      continue
    fi
    if vibe_compose_service_running "${svc}"; then
      monitor_ok "Container health: ${svc} is running"
    else
      monitor_fail "Container health: ${svc} is not running"
    fi
  done
}

# --- alert senders ---------------------------------------------------------
# Each sender is a no-op when its required configuration is missing. Tokens are
# only handed to curl; they are never printed.

monitor_alert_telegram() {
  status="$1"
  body="$2"
  token="$(vibe_env_value VIBE_MONITOR_TELEGRAM_TOKEN)"
  chat_id="$(vibe_env_value VIBE_MONITOR_TELEGRAM_CHAT_ID)"
  if [ -z "${token}" ] || [ -z "${chat_id}" ]; then
    return 0
  fi
  if curl -sS --max-time 15 \
    --data-urlencode "chat_id=${chat_id}" \
    --data-urlencode "text=${body}" \
    "https://api.telegram.org/bot${token}/sendMessage" >/dev/null 2>&1; then
    printf '%s\n' "alert: Telegram notified (${status})"
  else
    printf '%s\n' "alert: Telegram send failed" >&2
  fi
}

monitor_alert_webhook() {
  status="$1"
  summary="$2"
  details="$3"
  url="$(vibe_env_value VIBE_MONITOR_WEBHOOK_URL)"
  if [ -z "${url}" ]; then
    return 0
  fi
  # Build a small JSON payload with the report escaped for safe embedding.
  esc_summary="$(monitor_json_escape "${summary}")"
  esc_details="$(monitor_json_escape "${details}")"
  payload="$(printf '{"env":"%s","status":"%s","summary":"%s","details":"%s"}' \
    "${VIBE_ENV}" "${status}" "${esc_summary}" "${esc_details}")"
  if curl -sS --max-time 15 -X POST \
    -H 'Content-Type: application/json' \
    --data "${payload}" \
    "${url}" >/dev/null 2>&1; then
    printf '%s\n' "alert: Webhook notified (${status})"
  else
    printf '%s\n' "alert: Webhook send failed" >&2
  fi
}

monitor_alert_email() {
  status="$1"
  subject="$2"
  body="$3"
  to="$(vibe_env_value VIBE_MONITOR_EMAIL_TO)"
  if [ -z "${to}" ]; then
    return 0
  fi
  if ! command -v mail >/dev/null 2>&1; then
    printf '%s\n' "alert: mail command not found, email skipped" >&2
    return 0
  fi
  if printf '%s\n' "${body}" | mail -s "${subject}" "${to}" >/dev/null 2>&1; then
    printf '%s\n' "alert: Email sent to ${to} (${status})"
  else
    printf '%s\n' "alert: Email send failed" >&2
  fi
}

# Escape a string for inclusion inside a JSON double-quoted value: backslash,
# double-quote, and newlines (collapsed to literal \n).
monitor_json_escape() {
  printf '%s' "$1" \
    | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
    | awk 'BEGIN { ORS="" } { if (NR > 1) printf "\\n"; printf "%s", $0 }'
}
