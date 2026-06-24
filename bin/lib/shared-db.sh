#!/bin/sh
# Shared helpers for the vibe-wp-shared-db ops. POSIX sh. No secrets to stdout.
# Sourced by bin/shared-db-init, bin/shared-db-status, bin/db-provision,
# bin/db-deprovision, bin/backup-shared-db, bin/shared-db-rotate-root.

# Force C locale so every case charset guard is strictly ASCII (defense in depth).
export LC_ALL=C

SHARED_DB_DIR="${SHARED_DB_DIR:-/opt/vibe-wp-shared-db}"
SHARED_DB_ENV="${SHARED_DB_DIR}/env/shared-db.env"
SHARED_DB_NETWORK="vibe-wp-shared-db"

sdb_die() { echo "shared-db: $1" >&2; exit 1; }

# Strict slug validation (mirrors COMPOSE_PROJECT_NAME char class). Excludes all
# SQL metacharacters (backtick, quote, semicolon, backslash, NUL, space).
# Enforces ^[a-z][a-z0-9-]{0,47}$ under LC_ALL=C.
# Echoes the SANITIZED identifier base (hyphens -> underscores) prefixed with vibe_.
sdb_validate_slug() {
  s="$1"
  case "$s" in
    [a-z] | [a-z][a-z0-9-]*) : ;;
    *) sdb_die "invalid slug: must start with a lowercase letter" ;;
  esac
  case "$s" in *[!a-z0-9-]*) sdb_die "slug has invalid characters (allowed a-z 0-9 -)";; esac
  [ "${#s}" -le 48 ] || sdb_die "slug too long (max 48)"
  printf 'vibe_%s' "$(printf '%s' "$s" | tr '-' '_')"
}

# Read MARIADB_ROOT_PASSWORD from the 0600 root-owned env file. Refuse if perms wrong.
# Asserts: file exists, owned by uid 0, not group/other-accessible (no /077 bits set).
sdb_root_password() {
  [ -f "$SHARED_DB_ENV" ] || sdb_die "shared-db env not found: $SHARED_DB_ENV"
  owner="$(stat -c '%u' "$SHARED_DB_ENV" 2>/dev/null || echo "")"
  [ "$owner" = "0" ] || sdb_die "shared-db env not root-owned (refusing to read root password)"
  [ -z "$(find "$SHARED_DB_ENV" -prune -perm /077 2>/dev/null)" ] || sdb_die "shared-db env is group/other-accessible (refusing)"
  line="$(grep -m1 '^MARIADB_ROOT_PASSWORD=' "$SHARED_DB_ENV" 2>/dev/null || true)"
  val="${line#MARIADB_ROOT_PASSWORD=}"
  case "$val" in \"*\") val="${val#\"}"; val="${val%\"}";; \'*\') val="${val#\'}"; val="${val%\'}";; esac
  [ -n "$val" ] || sdb_die "MARIADB_ROOT_PASSWORD empty"
  printf '%s' "$val"
}

# Run SQL as root against the shared container. The root password reaches mariadb
# ONLY as a --defaults-extra-file inside the container (NEVER host or container
# argv, NEVER env MYSQL_PWD, NEVER a fixed path). $1 = SQL. Returns query output;
# on error emits a GENERIC message (the SQL contains the per-site password, so raw
# stderr must NEVER surface — MF-1). Cred + SQL share one stdin, split by a marker;
# the in-container shell writes the cred to a randomized umask-077 temp (MF-2/MF-4).
sdb_mariadb_root() {
  sql="$1"
  rpw="$(sdb_root_password)"
  out="$(
    { printf '[client]\npassword=%s\n__VIBE_SQL_BEGIN__\n' "$rpw"; printf '%s\n' "$sql"; } \
    | docker compose -f "${SHARED_DB_DIR}/compose.yaml" --env-file "$SHARED_DB_ENV" \
        exec -T db sh -c '
          umask 077; cf="$(mktemp)"
          while IFS= read -r l; do [ "$l" = "__VIBE_SQL_BEGIN__" ] && break; printf "%s\n" "$l" >> "$cf"; done
          mariadb --defaults-extra-file="$cf" -u root --batch --skip-column-names
          rc=$?; rm -f "$cf"; exit $rc
        ' 2>&1
  )" || { unset rpw out; sdb_die "provision SQL failed (see container logs)"; }
  unset rpw
  # On success this is the query result (DDL -> empty); NEVER contains a password.
  printf '%s' "$out"
}

# Derive the host pattern for a per-site user grant from the shared DB network's
# first IPv4 subnet. Fails closed: NEVER returns '%' or any fallback.
# /8  -> A.%   /16 -> A.B.%   /24 -> A.B.C.%   other masks -> narrower octet boundary.
# sdb_die if no IPv4 subnet is found (MF-5: fail closed, no silent '%' fallback).
sdb_host_pattern() {
  subnets="$(docker network inspect "$SHARED_DB_NETWORK" \
    --format '{{range .IPAM.Config}}{{println .Subnet}}{{end}}' 2>/dev/null || true)"
  # Take the FIRST line matching an IPv4 CIDR (digits and dots only before /).
  ipv4=""
  IFS='
'
  for subnet in $subnets; do
    case "$subnet" in
      [0-9]*.[0-9]*.[0-9]*.[0-9]*/[0-9]*)
        ipv4="$subnet"
        break
        ;;
    esac
  done
  unset IFS
  [ -n "$ipv4" ] || sdb_die "cannot determine shared-db network IPv4 subnet (network may not exist yet)"
  # Parse A.B.C.D/NN
  addr="${ipv4%%/*}"
  mask="${ipv4##*/}"
  # Validate mask is numeric
  case "$mask" in
    ''|*[!0-9]*) sdb_die "unparseable subnet mask in: $ipv4" ;;
  esac
  # Extract octets
  a="${addr%%.*}"; rest="${addr#*.}"
  b="${rest%%.*}"; rest="${rest#*.}"
  c="${rest%%.*}"
  # Determine pattern by mask — use next-wider octet boundary for non-standard masks.
  if [ "$mask" -le 8 ]; then
    printf '%s.%%' "$a"
  elif [ "$mask" -le 16 ]; then
    printf '%s.%s.%%' "$a" "$b"
  elif [ "$mask" -le 24 ]; then
    printf '%s.%s.%s.%%' "$a" "$b" "$c"
  else
    # /25–/32: pin to the /24 block (more specific than % but safe for Docker bridge)
    printf '%s.%s.%s.%%' "$a" "$b" "$c"
  fi
}

# Read SHARED_DB_MAX_USER_CONNECTIONS from the env file; default 25. Reject non-numeric.
sdb_max_user_connections() {
  val=""
  if [ -f "$SHARED_DB_ENV" ]; then
    line="$(grep -m1 '^SHARED_DB_MAX_USER_CONNECTIONS=' "$SHARED_DB_ENV" 2>/dev/null || true)"
    val="${line#SHARED_DB_MAX_USER_CONNECTIONS=}"
    case "$val" in \"*\") val="${val#\"}"; val="${val%\"}";; \'*\') val="${val#\'}"; val="${val%\'}";; esac
  fi
  [ -n "$val" ] || val="25"
  case "$val" in
    ''|*[!0-9]*) sdb_die "SHARED_DB_MAX_USER_CONNECTIONS is not numeric: $val" ;;
  esac
  printf '%s' "$val"
}
