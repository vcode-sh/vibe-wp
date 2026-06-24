#!/bin/sh
# test/shared-db-isolation.sh — Cross-tenant MariaDB isolation harness
#
# PURPOSE: Proves the security model of the vibe-wp shared-db feature by running
# real SQL assertions against a live shared-db container.
#
# !! NOT A UNIT TEST !! — This script requires Docker and a running (or init-able)
# shared-db container. Run it on the VPS as part of the Phase-1 security gate
# (Task 12 in the implementation plan). It does NOT run in CI without Docker.
#
# USAGE (as root on the VPS):
#   bin/shared-db-init          # idempotent — skipped if container already running
#   sh test/shared-db-isolation.sh
#
# The script exits non-zero on ANY failed assertion. It cleans up both test tenants
# (sitea, siteb) on exit, even after a failure.
#
# Assertions covered:
#   OWN-1  vibe_sitea CAN CREATE TABLE in its own database
#   OWN-2  vibe_sitea CAN INSERT into its own database
#   OWN-3  vibe_sitea CAN SELECT from its own database
#   DENY-1 vibe_sitea CANNOT USE vibe_siteb (access denied)
#   DENY-2 vibe_sitea CANNOT SELECT from vibe_siteb.* (access denied)
#   DENY-3 vibe_sitea CANNOT SELECT from mysql.user (access denied)
#   DENY-4 vibe_sitea CANNOT GRANT privileges (no GRANT OPTION)
#   DENY-5 vibe_sitea CANNOT CREATE USER
#   SHOW-1 SHOW DATABASES as vibe_sitea lists vibe_sitea but NOT vibe_siteb
#   SF-3   information_schema.SCHEMATA as vibe_sitea does NOT reveal vibe_siteb
#   GRANT  SHOW GRANTS FOR vibe_sitea: only scoped grant + USAGE, no *.*, no SUPER
#   PROC-1 root password does NOT appear in host ps aux during db-provision
#   PROC-2 root password does NOT appear in container process list during db-provision
#   PROC-3 no readable temp credential file survives provision
#   DEPR-1 after db-deprovision sitea: vibe_sitea DB+user are gone (connect fails)
#   DEPR-2 after db-deprovision sitea: vibe_siteb is still intact (connect works)

set -u
export LC_ALL=C

# ---------------------------------------------------------------------------
# Resolve paths
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
BIN="${REPO_ROOT}/bin"
SHARED_DB_DIR="${SHARED_DB_DIR:-/opt/vibe-wp-shared-db}"
SHARED_DB_ENV="${SHARED_DB_DIR}/env/shared-db.env"
COMPOSE_FILE="${SHARED_DB_DIR}/compose.yaml"
ENV_FILE="${SHARED_DB_ENV}"

# Wrapper: every docker compose invocation must supply --env-file so the
# compose.yaml variable interpolation (${MARIADB_ROOT_PASSWORD:?required})
# succeeds even when the caller's shell environment does not export it.
DC() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# ---------------------------------------------------------------------------
# Counters and cleanup
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
_cleanup_done=0

cleanup() {
  if [ "$_cleanup_done" = "1" ]; then return; fi
  _cleanup_done=1
  echo ""
  echo "==> Cleanup: deprovisioning test tenants (errors here are non-fatal)"
  "${BIN}/db-deprovision" sitea 2>/dev/null || true
  "${BIN}/db-deprovision" siteb 2>/dev/null || true
  "${BIN}/db-deprovision" sitec 2>/dev/null || true
  rm -f /tmp/vibe_test_pwc
}
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

# pass <label> — record a PASS
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }

# fail <label> [<detail>] — record a FAIL (never exits immediately; allows full run)
fail() {
  FAIL=$((FAIL + 1))
  printf 'FAIL  %s\n' "$1"
  if [ -n "${2:-}" ]; then printf '      Detail: %s\n' "$2"; fi
}

# assert_ok <label> <cmd...>
# The command MUST exit 0 (operation expected to succeed).
assert_ok() {
  label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label" "command exited non-zero (expected success)"
  fi
}

# assert_deny <label> <cmd...>
# The command MUST exit non-zero (access denied / error expected).
# A zero exit means the tenant CAN access forbidden data → FAIL (security breach).
# IMPORTANT: the <cmd> is the direct mariadb invocation — do NOT wrap in grep,
# because grep -q exits 0 when it finds the "Access denied" string, which would
# invert the semantics and make a DENIAL look like a success to this function.
assert_deny() {
  label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    fail "$label" "command succeeded (expected access-denied — SECURITY BREACH)"
  else
    pass "$label"
  fi
}

# assert_contains <label> <pattern> <text>
# text must contain pattern (case-sensitive substring).
assert_contains() {
  label="$1"; pattern="$2"; text="$3"
  case "$text" in
    *"$pattern"*) pass "$label" ;;
    *) fail "$label" "expected '${pattern}' in output; got: $(printf '%s' "$text" | head -c 200)" ;;
  esac
}

# assert_not_contains <label> <pattern> <text>
# text must NOT contain pattern.
assert_not_contains() {
  label="$1"; pattern="$2"; text="$3"
  case "$text" in
    *"$pattern"*) fail "$label" "found forbidden '${pattern}' in output (should be absent)" ;;
    *) pass "$label" ;;
  esac
}

# ---------------------------------------------------------------------------
# mariadb runner — connects as a PER-SITE user (not root) via docker exec.
# Never stores or echoes the password; accepts it as a variable.
# $1=db_name $2=user $3=password_var_name $4=sql
# Outputs query results to stdout; non-zero exit on error.
# ---------------------------------------------------------------------------
run_as_site_user() {
  _db="$1"; _user="$2"; _pw_var="$3"; _sql="$4"
  eval "_pw=\"\${${_pw_var}}\""
  # Password delivered via --password= inside the container only; never via argv visible
  # to host ps. The docker exec command itself shows -u and --database but not -p<pw>
  # (we use --password= which IS visible in container argv — acceptable for per-site
  # users whose passwords are non-secret at the container boundary; the ROOT password
  # is held to the stricter off-argv standard in sdb_mariadb_root).
  printf '%s\n' "$_sql" \
    | DC exec -T db \
        mariadb -u "$_user" "--password=${_pw}" "--database=${_db}" \
          --batch --skip-column-names 2>&1
}

# Variant: ignore the database selection (for USE/cross-db tests where we start at root)
run_as_site_user_nodb() {
  _user="$1"; _pw_var="$2"; _sql="$3"
  eval "_pw=\"\${${_pw_var}}\""
  printf '%s\n' "$_sql" \
    | DC exec -T db \
        mariadb -u "$_user" "--password=${_pw}" \
          --batch --skip-column-names 2>&1
}

# ---------------------------------------------------------------------------
# Pre-flight: verify shared-db container is present and healthy
# ---------------------------------------------------------------------------
echo "==> Pre-flight: checking shared-db container health"

if ! DC ps --status running db 2>/dev/null | grep -q db; then
  echo "SKIP: shared-db container is not running. Run 'bin/shared-db-init' first."
  exit 1
fi
echo "     Container is running."

# ---------------------------------------------------------------------------
# Phase 1: Provision two tenants — capture passwords
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 1: Provisioning sitea and siteb"

# db-provision prints exactly ONE line to stdout — the 32-hex password.
# Capture it without echoing. Errors go to stderr (visible to operator).
pw_a="$("${BIN}/db-provision" sitea 2>/dev/null)" || {
  echo "FATAL: db-provision sitea failed — cannot continue" >&2; exit 1
}
pw_b="$("${BIN}/db-provision" siteb 2>/dev/null)" || {
  echo "FATAL: db-provision siteb failed — cannot continue" >&2; exit 1
}

# Validate that we got single-line 32-hex passwords (sanity check).
case "$pw_a" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) : ;;
  *) echo "FATAL: pw_a does not look like a hex password" >&2; exit 1 ;;
esac
case "$pw_b" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) : ;;
  *) echo "FATAL: pw_b does not look like a hex password" >&2; exit 1 ;;
esac

# Confirm exactly 32 hex chars (16-byte openssl rand -hex 16).
pw_a_len="$(printf '%s' "$pw_a" | wc -c | tr -d ' ')"
pw_b_len="$(printf '%s' "$pw_b" | wc -c | tr -d ' ')"
[ "$pw_a_len" = "32" ] || { echo "FATAL: pw_a length ${pw_a_len} != 32" >&2; exit 1; }
[ "$pw_b_len" = "32" ] || { echo "FATAL: pw_b length ${pw_b_len} != 32" >&2; exit 1; }

echo "     sitea and siteb provisioned (passwords captured, not printed)."

# ---------------------------------------------------------------------------
# Phase 2: Root-password-not-in-ps checks (run DURING another provision call)
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 2: Root-password-not-in-ps checks"

# Read the root password solely for comparison; NEVER echo it.
root_pw="$(grep -m1 '^MARIADB_ROOT_PASSWORD=' "$SHARED_DB_ENV" | sed 's/^MARIADB_ROOT_PASSWORD=//')"
# Strip optional surrounding quotes.
case "$root_pw" in
  \"*\") root_pw="${root_pw#\"}"; root_pw="${root_pw%\"}" ;;
  \'*\') root_pw="${root_pw#\'}"; root_pw="${root_pw%\'}" ;;
esac

# Provision a third temporary slug in the background; while it runs, check ps.
# The sitec pw is discarded (written to a temp file, cleaned up below).
"${BIN}/db-provision" sitec >/tmp/vibe_test_pwc 2>/dev/null &
bg_pid=$!

# Give the provision a moment to start up (it needs to pull the root pw + start docker exec).
# We sleep up to 3 seconds, checking each second if the process is still running.
# Once it's confirmed running (kill -0 succeeds), we snapshot ps — this is the window
# where the root pw could appear in argv if the implementation is wrong.
_waited=0
while [ "$_waited" -lt 15 ]; do
  sleep 0.2
  _waited=$((_waited + 1))
  if kill -0 "$bg_pid" 2>/dev/null; then
    # Process is still alive — a good time to snapshot
    break
  fi
  # If the process already exited (very fast provision), continue to snapshot anyway.
done

# Snapshot host process list.
ps_snapshot="$(ps aux 2>/dev/null || ps -ef 2>/dev/null || true)"

# Snapshot container process list.
container_ps="$(DC top db 2>/dev/null || true)"

# Wait for background provision to complete.
wait "$bg_pid" 2>/dev/null || true

# Clean up the temp pw file.
rm -f /tmp/vibe_test_pwc

# Deprovision sitec immediately.
"${BIN}/db-deprovision" sitec 2>/dev/null || true

# Assert root password NOT in host ps.
assert_not_contains "PROC-1: root pw absent from host ps aux" "$root_pw" "$ps_snapshot"

# Assert root password NOT in container process list.
assert_not_contains "PROC-2: root pw absent from container top" "$root_pw" "$container_ps"

# Assert no readable temp cred file with the root password survives in /tmp or /root.
# We check common temp locations; the in-container tmp is transient and cleaned inline.
tmp_survivors="$(grep -rl "$root_pw" /tmp /root /var/tmp 2>/dev/null | head -5 || true)"
if [ -z "$tmp_survivors" ]; then
  pass "PROC-3: no readable temp cred file survives on host"
else
  fail "PROC-3: readable temp cred file(s) found: $tmp_survivors"
fi

unset root_pw ps_snapshot container_ps

# ---------------------------------------------------------------------------
# Phase 3: Per-site OWN-access assertions (sitea CAN use its own DB)
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 3: Own-database access assertions (sitea)"

# These wrappers run mariadb directly; exit 0 from mariadb = success = PASS for assert_ok.
_own_create_table() {
  printf 'CREATE TABLE IF NOT EXISTS _vibe_test_t (id INT PRIMARY KEY);\n' \
    | DC exec -T db \
        mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
          --batch --skip-column-names 2>/dev/null
}
assert_ok "OWN-1: vibe_sitea can CREATE TABLE in vibe_sitea" _own_create_table

_own_insert() {
  printf 'INSERT INTO _vibe_test_t (id) VALUES (1) ON DUPLICATE KEY UPDATE id=id;\n' \
    | DC exec -T db \
        mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
          --batch --skip-column-names 2>/dev/null
}
assert_ok "OWN-2: vibe_sitea can INSERT into vibe_sitea" _own_insert

_own_select() {
  printf 'SELECT id FROM _vibe_test_t;\n' \
    | DC exec -T db \
        mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
          --batch --skip-column-names 2>/dev/null
}
assert_ok "OWN-3: vibe_sitea can SELECT from vibe_sitea" _own_select

# ---------------------------------------------------------------------------
# Phase 4: Cross-tenant denial assertions (sitea CANNOT access siteb or mysql)
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 4: Cross-tenant denial assertions"

# DENY-1: cannot USE vibe_siteb
# mariadb exits non-zero on "Access denied" → assert_deny sees non-zero → PASS.
# If vibe_sitea somehow could switch to vibe_siteb, mariadb exits 0 → FAIL.
_deny_use_siteb() {
  printf 'USE vibe_siteb;\n' \
    | DC exec -T db \
        mariadb -u vibe_sitea "--password=${pw_a}" \
          --batch --skip-column-names 2>/dev/null
}
assert_deny "DENY-1: vibe_sitea cannot USE vibe_siteb" _deny_use_siteb

# DENY-2: cannot SELECT from vibe_siteb.*
_deny_select_siteb() {
  printf 'SELECT * FROM vibe_siteb._vibe_test_t;\n' \
    | DC exec -T db \
        mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
          --batch --skip-column-names 2>/dev/null
}
assert_deny "DENY-2: vibe_sitea cannot SELECT from vibe_siteb.*" _deny_select_siteb

# DENY-3: cannot SELECT from mysql.user
_deny_select_mysql_user() {
  printf 'SELECT User, Host FROM mysql.user;\n' \
    | DC exec -T db \
        mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
          --batch --skip-column-names 2>/dev/null
}
assert_deny "DENY-3: vibe_sitea cannot SELECT from mysql.user" _deny_select_mysql_user

# DENY-4: cannot GRANT (no GRANT OPTION)
# MariaDB returns "Access denied; you need (at least one of) the GRANT OPTION privilege(s)"
_deny_grant() {
  printf 'GRANT SELECT ON vibe_sitea.* TO vibe_sitea;\n' \
    | DC exec -T db \
        mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
          --batch --skip-column-names 2>/dev/null
}
assert_deny "DENY-4: vibe_sitea cannot GRANT privileges (no GRANT OPTION)" _deny_grant

# DENY-5: cannot CREATE USER
_deny_create_user() {
  printf "CREATE USER 'attacker'@'%%' IDENTIFIED BY 'x';\n" \
    | DC exec -T db \
        mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
          --batch --skip-column-names 2>/dev/null
}
assert_deny "DENY-5: vibe_sitea cannot CREATE USER" _deny_create_user

# ---------------------------------------------------------------------------
# Phase 5: SHOW DATABASES cross-tenant invisibility
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 5: SHOW DATABASES cross-tenant visibility"

show_dbs="$(printf 'SHOW DATABASES;\n' \
  | DC exec -T db \
      mariadb -u vibe_sitea "--password=${pw_a}" \
        --batch --skip-column-names 2>/dev/null || true)"

assert_contains "SHOW-1a: SHOW DATABASES contains vibe_sitea" "vibe_sitea" "$show_dbs"
assert_not_contains "SHOW-1b: SHOW DATABASES does NOT contain vibe_siteb" "vibe_siteb" "$show_dbs"

# ---------------------------------------------------------------------------
# Phase 6: SF-3 — information_schema.SCHEMATA cross-tenant invisibility
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 6: SF-3 — information_schema.SCHEMATA cross-tenant invisibility"

schemata="$(printf 'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA;\n' \
  | DC exec -T db \
      mariadb -u vibe_sitea "--password=${pw_a}" \
        --batch --skip-column-names 2>/dev/null || true)"

assert_contains "SF-3a: SCHEMATA contains vibe_sitea" "vibe_sitea" "$schemata"
assert_not_contains "SF-3b: SCHEMATA does NOT reveal vibe_siteb" "vibe_siteb" "$schemata"

# ---------------------------------------------------------------------------
# Phase 7: SHOW GRANTS scope — only scoped grant + USAGE, no *.*, no SUPER
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 7: SHOW GRANTS scope for vibe_sitea"

grants="$(printf 'SHOW GRANTS FOR CURRENT_USER();\n' \
  | DC exec -T db \
      mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
        --batch --skip-column-names 2>/dev/null || true)"

# Must contain the scoped grant.
assert_contains "GRANT-1: grants include scoped vibe_sitea.* grant" \
  "vibe_sitea" "$grants"

# Must contain MAX_USER_CONNECTIONS.
assert_contains "GRANT-2: grants include MAX_USER_CONNECTIONS" \
  "MAX_USER_CONNECTIONS" "$grants"

# Must NOT have any *.* (global) grant beyond USAGE.
# Extract any ON *.* grants.
global_non_usage="$(printf '%s\n' "$grants" \
  | grep 'ON \*\.\*' | grep -v '^GRANT USAGE ON' || true)"
if [ -z "$global_non_usage" ]; then
  pass "GRANT-3: no *.* grant beyond USAGE"
else
  fail "GRANT-3: forbidden *.* grant found: $global_non_usage"
fi

# Must NOT contain GRANT OPTION.
assert_not_contains "GRANT-4: no GRANT OPTION in grants" "WITH GRANT OPTION" "$grants"

# Must NOT contain SUPER.
assert_not_contains "GRANT-5: no SUPER in grants" "SUPER" "$grants"

# Must NOT reference vibe_siteb.
assert_not_contains "GRANT-6: grants do not reference vibe_siteb" "vibe_siteb" "$grants"

# Must NOT contain PROCESS, FILE, RELOAD, SHUTDOWN, REPLICATION.
for _priv in PROCESS FILE RELOAD SHUTDOWN REPLICATION CREATE USER; do
  assert_not_contains "GRANT-7-${_priv}: no ${_priv} in grants" "$_priv" "$grants"
done

# ---------------------------------------------------------------------------
# Phase 8: db-deprovision sitea — assert gone + siteb intact
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 8: Deprovision sitea — assert DB+user gone, siteb intact"

"${BIN}/db-deprovision" sitea 2>/dev/null || {
  fail "DEPR-0: db-deprovision sitea failed"
}

# DEPR-1: connecting as vibe_sitea must now FAIL.
depr_result="$(printf 'SELECT 1;\n' \
  | DC exec -T db \
      mariadb -u vibe_sitea "--password=${pw_a}" --database=vibe_sitea \
        --batch --skip-column-names 2>&1 || true)"
case "$depr_result" in
  *"Access denied"*|*"denied"*|*"Can't connect"*|*"Unknown database"*)
    pass "DEPR-1: vibe_sitea DB+user are gone after deprovision" ;;
  *)
    fail "DEPR-1: vibe_sitea is still accessible after deprovision" \
      "$(printf '%s' "$depr_result" | head -c 200)" ;;
esac

# DEPR-2: siteb must still be accessible.
_depr_siteb_intact() {
  printf 'SELECT 1;\n' \
    | DC exec -T db \
        mariadb -u vibe_siteb "--password=${pw_b}" --database=vibe_siteb \
          --batch --skip-column-names 2>/dev/null
}
assert_ok "DEPR-2: vibe_siteb is intact after sitea deprovision" _depr_siteb_intact

# ---------------------------------------------------------------------------
# Phase 9: Cleanup siteb (also done by trap, but do it explicitly here)
# ---------------------------------------------------------------------------
echo ""
echo "==> Phase 9: Cleanup siteb"
"${BIN}/db-deprovision" siteb 2>/dev/null && echo "     siteb deprovisioned." || \
  echo "     WARN: siteb deprovision returned non-zero (may already be gone)."
_cleanup_done=1  # prevent double-cleanup in trap

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "========================================="
printf 'RESULTS: %d PASS, %d FAIL\n' "$PASS" "$FAIL"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
  echo "ISOLATION TEST: FAILED — see FAIL lines above." >&2
  exit 1
fi

echo "ISOLATION TEST: ALL PASSED"
exit 0
