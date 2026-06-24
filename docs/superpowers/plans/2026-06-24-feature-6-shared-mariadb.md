# Feature #6: Shared / Native Global MariaDB — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠ HIGHEST-STAKES FEATURE.** Cross-tenant data leak is the primary threat. After Phase 1 (the security core — Tasks 1-3) there is a MANDATORY adversarial security review gate before any panel/integration code. Do NOT skip it.

**Goal:** One shared MariaDB container serves many WordPress sites — each site gets its own database + its own least-privilege user (access to ONLY its own DB), provisioned by a root-gated op — saving the per-site-container RAM (one InnoDB buffer pool instead of N). Opt-in per site; existing per-container sites untouched.

**Architecture:** A dedicated `vibe-wp-shared-db` Compose project (reuses the existing `docker/mariadb` image + config-from-env model) runs with ONLY a root password, NO published port, on a fixed-name internal network. A root-gated `db-provision <slug>` op (new top-level `shared-db` subcommand on `bin/vibe-panel-run`) connects as root via `docker compose exec` (no port), creates `vibe_<slug>` DB + `vibe_<slug>` user with `GRANT ALL ON vibe_<slug>.* … WITH MAX_USER_CONNECTIONS` (and NOTHING else), generates a per-site password, and prints ONLY that password to stdout. Opted-in sites run in the existing external-services mode (`compose.external.yaml`) pointed at the shared container via an `external: true` network attachment.

**Tech Stack:** MariaDB 12.3 LTS (existing image), POSIX `sh` (provision/wrapper/backup), Docker/Compose, Bun/Hono/oRPC + Zod (api), React/TanStack (web), systemd timers, Vitest + a real-container isolation test harness.

## Global Constraints

Bind **every** task. From the spec (`docs/superpowers/specs/2026-06-23-feature-6-shared-mariadb-design.md`) + owner decisions (2026-06-24: shared CONTAINER not bare-metal; FULL feature incl. migration + shared-server backup + root rotation; plan + adversarial security review → build → VPS cross-tenant validation) + the feature-#1/#2/#3 VPS-validation lessons.

- **Least privilege is non-negotiable.** Each site's user gets `GRANT ALL PRIVILEGES ON vibe_<slug>.*` and NOTHING else. PROHIBITED: any `*.*` grant, `GRANT OPTION`, `SUPER`, `PROCESS`, `FILE`, `RELOAD`, `SHUTDOWN`, `CREATE USER`, `REPLICATION *`, cross-database access (`mysql.*`, `information_schema.*` beyond defaults, other `vibe_*.*`). The grant SQL is a FIXED template; no caller input is interpolated into it.
- **Slug validation BEFORE any SQL.** `^[a-z][a-z0-9-]{0,47}$`. Validated in `bin/db-provision`/`db-deprovision` AND independently re-validated in `bin/vibe-panel-run` (defense in depth). The DB/user identifier is `vibe_` + slug with `-`→`_`. The regex excludes ALL SQL metacharacters (backtick, quote, semicolon, backslash, NUL, space).
- **Root password handling.** `MARIADB_ROOT_PASSWORD` lives ONLY in `/opt/vibe-wp-shared-db/env/shared-db.env` (root:root, 0600). Read via `grep -m1` (the `env_value` pattern) — NEVER from argv, env var, or a named pipe the panel controls. Passed to `mariadb` via `--defaults-extra-file=/dev/stdin` (heredoc) so it never appears in `ps`. NEVER echoed, logged (always `redact()`-ed at the exec boundary), or returned. The wrapper ASSERTS the env file is root-owned + 0600 before reading it (refuse otherwise).
- **No published port, ever.** The shared MariaDB has NO `ports:` entry. All SQL runs via `docker compose exec -T db mariadb …`. Reachable ONLY from containers on the `vibe-wp-shared-db` network.
- **Network segmentation.** Layer 1: no host port. Layer 2: only provisioned sites attach the `shared_db` external network (nginx NEVER joins it; only `wordpress`+`cron`). Layer 3: the per-site user's host-grant is pinned to the shared Docker network subnet (`<subnet>.%`, read live via `docker network inspect`).
- **Output contract.** `db-provision <slug>` prints EXACTLY ONE LINE to stdout (the 32-hex per-site password), nothing else. `db-deprovision` prints nothing on success. Errors → stderr.
- **Opt-in.** Dedicated-container stays the default for new sites. Shared DB is an explicit wizard choice, shown only when the shared container is initialized + healthy.
- **Reversible migration.** Per-container→shared keeps the old DB volume (tagged, 7-day operator prune); a failed smoke test rolls back to the per-container path with no data loss.
- **Wrapper invocation crux (resolved):** shared-DB ops are NOT per-site, so they do NOT use `wrapVibeArgv` (which is `sudo -n runner vibe <siteDir> …`). A NEW top-level `shared-db` wrapper subcommand handles them: `sudo -n runner shared-db {init|status|provision|deprovision|backup} [slug]`. Add a `wrapSharedDbArgv(sub, ...args)` helper in `exec.ts`.
- **No new `panel_env_keep` entries needed** (confirm in review): the wrapper reads the root password from the file itself; `db-provision` RETURNS the per-site password via stdout (captured by the panel → written to the site env via the existing provision/installer path). No secret is injected via env to these ops.
- **Host-boundary checklist (features #1/#2/#3 lesson — VPS-validate each):** the new wrapper subcommand; the `docker compose exec` runs in/against the shared container (correct — mariadb is container-only); reading the root file (perms asserted); no env injection (no env_keep change); the shared container is a named volume (back up via `exec`, not host paths). Budget the VPS round (Task 12) — and run it on a CORRECTLY-deployed branch (don't validate a stale/main checkout).
- **Tests.** Isolation tests run against a REAL test-only shared-db container (Task 3) — they are the security gate. api uses Vitest. Run `cd control-panel && bun run check-types && bun run check && bun run test` before completing an api/web task; `sh -n` every shell script.

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `compose/shared-db/compose.yaml` | the `vibe-wp-shared-db` project (root-only, no port, named net+volume) | **New** |
| `compose/shared-db/env/shared-db.env.example` | tuning + `MARIADB_ROOT_PASSWORD` placeholder | **New** |
| `bin/shared-db-init` | create `/opt/vibe-wp-shared-db`, gen root pw (0600), `compose up -d`, wait healthy | **New** |
| `bin/shared-db-status` | report exists/healthy/mem/connections (non-secret JSON) | **New** |
| `bin/db-provision` | slug-validate → create DB+user+scoped grant → print per-site pw | **New** |
| `bin/db-deprovision` | slug-validate → DROP DB + user | **New** |
| `bin/lib/shared-db.sh` | shared helpers: slug validate, root-pw read, `mariadb` exec, subnet lookup | **New** |
| `test/shared-db-isolation.sh` (or a bats/sh harness) | provision 2 slugs, assert cross-tenant isolation | **New** |
| `bin/vibe-panel-run` | new top-level `shared-db` subcommand + slug re-validation + env-file perms assert | Modify |
| `bin/panel` | sudoers rule for the `shared-db` subcommand (bounded by wrapper validation) | Modify |
| `control-panel/packages/api/src/core-bridge/exec.ts` | `wrapSharedDbArgv` + `runSharedDb`/`streamSharedDb` helpers | Modify |
| `control-panel/packages/api/src/core-bridge/shared-db.ts` | panel-side: init/status/provision/deprovision wiring | **New** |
| `control-panel/packages/api/src/core-bridge/provision-input.ts` | `createSharedDbSchema` | Modify |
| `control-panel/packages/api/src/core-bridge/provision-state.ts` | `buildCreateSharedDbState` (db-provision pw → external state) | Modify |
| `control-panel/packages/api/src/routers/provisioning.ts` | `createSharedDb`, `sharedDbInit`, `sharedDbStatus`, `sharedDbRotateRoot` | Modify |
| `control-panel/packages/api/src/routers/server.ts` (or settings) | `sharedDbStatus` read procedure for the settings UI | Modify |
| `control-panel/web/...` create-site wizard | a "Database" step (dedicated vs shared) | Modify |
| `control-panel/web/...` server settings | "Shared database" section (status + Initialize + rotate) | Modify/New |
| `bin/backup-shared-db` | full-server `mariadb-dump --all-databases` → dated archive (+R2) | **New** |
| `bin/shared-db-schedule-apply` | install `vibe-wp-shared-db-backup.timer` (weekly) | **New** |
| `bin/shared-db-rotate-root` | rotate `MARIADB_ROOT_PASSWORD` (admin, with restart) | **New** |
| `bin/migrate-to-shared-db` | per-container→shared with verify + rollback | **New** |
| `docs/recovery.md` | shared-server restore + migration recovery procedures | Modify/New |

---

## PHASE 1 — Security core (shared-db project + provision ops + isolation tests)

### Task 1: Shared-db Compose project + `shared-db-init` + `shared-db-status`

**Files:** Create `compose/shared-db/compose.yaml`, `compose/shared-db/env/shared-db.env.example`, `bin/shared-db-init`, `bin/shared-db-status`, `bin/lib/shared-db.sh`.

**Interfaces — Produces:** a runnable shared-db project at `/opt/vibe-wp-shared-db`; `shared-db-init` (idempotent bring-up + root-pw gen); `shared-db-status` (non-secret JSON).

- [ ] **Step 1: `compose/shared-db/compose.yaml`** — the spec's §3a, reusing `docker/mariadb`:

```yaml
name: vibe-wp-shared-db

services:
  db:
    build:
      context: ../../docker/mariadb
    image: vibe-wp-shared-db-mariadb
    restart: unless-stopped
    env_file: env/shared-db.env
    environment:
      MARIADB_ROOT_PASSWORD: ${MARIADB_ROOT_PASSWORD:?MARIADB_ROOT_PASSWORD is required}
      # NO MARIADB_DATABASE/USER/PASSWORD — per-site DBs+users are created ONLY
      # by db-provision against the running container.
    volumes:
      - shared_db_data:/var/lib/mysql
    networks:
      - shared_db
    # NEVER add a ports: section.
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  shared_db_data:
    driver: local

networks:
  shared_db:
    driver: bridge
    name: vibe-wp-shared-db
```
(Verify the `build.context` relative path resolves from `/opt/vibe-wp-shared-db/compose.yaml` to the docker/mariadb dir — `shared-db-init` copies/symlinks `docker/mariadb` into `/opt/vibe-wp-shared-db/docker/mariadb`, so use `context: ./docker/mariadb` and have init place it there. Pick ONE approach and make it consistent between this file and Task 1 Step 3.)

- [ ] **Step 2: `compose/shared-db/env/shared-db.env.example`** — tuning defaults (one shared buffer pool):

```sh
# Vibe WP shared MariaDB — host-level tuning. MARIADB_ROOT_PASSWORD is generated
# by shared-db-init into the REAL env file (0600, root-only); never commit it.
MARIADB_ROOT_PASSWORD=
# One shared buffer pool replaces N per-site pools — the core RAM saving.
MARIADB_INNODB_BUFFER_POOL_SIZE=768M
# Tune up vs the per-site default (150) for many sites on one server.
MARIADB_MAX_CONNECTIONS=300
# Per-site user connection cap (db-provision applies WITH MAX_USER_CONNECTIONS).
SHARED_DB_MAX_USER_CONNECTIONS=25
```

- [ ] **Step 3: `bin/lib/shared-db.sh`** — shared helpers (sourced by all shared-db scripts):

```sh
#!/bin/sh
# Shared helpers for the vibe-wp-shared-db ops. POSIX sh. No secrets to stdout.
SHARED_DB_DIR="${SHARED_DB_DIR:-/opt/vibe-wp-shared-db}"
SHARED_DB_ENV="${SHARED_DB_DIR}/env/shared-db.env"
SHARED_DB_NETWORK="vibe-wp-shared-db"

sdb_die() { echo "shared-db: $1" >&2; exit 1; }

# Strict slug validation (mirrors COMPOSE_PROJECT_NAME char class). Excludes all
# SQL metacharacters. Echoes the SANITIZED identifier base (hyphens -> underscores).
sdb_validate_slug() {
  s="$1"
  case "$s" in
    [a-z][a-z0-9-]*) : ;;
    *) sdb_die "invalid slug: must start with a lowercase letter" ;;
  esac
  case "$s" in *[!a-z0-9-]*) sdb_die "slug has invalid characters (allowed a-z 0-9 -)";; esac
  [ "${#s}" -le 48 ] || sdb_die "slug too long (max 48)"
  printf 'vibe_%s' "$(printf '%s' "$s" | tr '-' '_')"
}

# Read MARIADB_ROOT_PASSWORD from the 0600 root-owned env file. Refuse if perms wrong.
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

# Run SQL as root against the shared container. Password via --defaults-extra-file
# on stdin (NEVER argv). $1 = SQL string. Output passes back to caller.
sdb_mariadb_root() {
  sql="$1"
  rpw="$(sdb_root_password)"
  # The defaults file + the SQL both arrive on the container's stdin: the defaults
  # file via a process-substitution-free heredoc isn't possible, so write a 0600
  # temp defaults file, exec the SQL via --execute, and shred the temp.
  cf="$(mktemp)"; chmod 600 "$cf"; trap 'rm -f "$cf"' EXIT INT TERM
  printf '[client]\npassword=%s\n' "$rpw" > "$cf"
  unset rpw
  docker compose -f "${SHARED_DB_DIR}/compose.yaml" --env-file "$SHARED_DB_ENV" \
    exec -T db sh -c 'cat > /tmp/.sdbcf && mariadb --defaults-extra-file=/tmp/.sdbcf -u root --batch --skip-column-names; rc=$?; rm -f /tmp/.sdbcf; exit $rc' \
    < "$cf" >/dev/null 2>/tmp/.sdberr <<SQL || { rm -f "$cf"; sdb_die "mariadb failed: $(cat /tmp/.sdberr 2>/dev/null | head -1)"; }
$sql
SQL
  rm -f "$cf"; trap - EXIT INT TERM
}
```
> **Implementer note:** the `sdb_mariadb_root` heredoc-vs-cred-file interleaving above is fiddly — the cred file and the SQL must both reach the container without the password touching argv. Validate this works in Task 3 against a real container BEFORE relying on it; if the dual-stdin is awkward, the robust alternative is: `docker compose exec -T db env MYSQL_PWD="$rpw" mariadb -u root --batch -e "$sql"` (MYSQL_PWD avoids argv but is visible in the container's env — acceptable since it's a transient `exec`; the security reviewer must confirm the chosen approach keeps the root pw off the HOST `ps`). Pick the approach that the isolation test + security review both bless. Document the choice.

- [ ] **Step 4: `bin/shared-db-init`** — idempotent: create `/opt/vibe-wp-shared-db`, copy `docker/mariadb` + `compose.yaml`, generate `MARIADB_ROOT_PASSWORD` (`openssl rand -hex 32`) into a 0600 root-owned env file (only if absent — never regenerate over a running DB), `docker compose up -d --build`, wait for healthy. Print non-secret status. Source `bin/lib/shared-db.sh`.

- [ ] **Step 5: `bin/shared-db-status`** — print non-secret JSON: `{ "present": bool, "healthy": bool, "network": "vibe-wp-shared-db", "max_connections": N, "buffer_pool": "...", "databases": <count of vibe_* DBs> }`. NO root password, NO per-site passwords.

- [ ] **Step 6:** `for f in bin/shared-db-init bin/shared-db-status bin/lib/shared-db.sh; do sh -n "$f" && chmod +x "$f"; done`; `docker compose -f compose/shared-db/compose.yaml config >/dev/null` (or yaml-lint). Commit.

### Task 2: `bin/db-provision` + `bin/db-deprovision` (the grant SQL)

**Files:** Create `bin/db-provision`, `bin/db-deprovision`.

**Interfaces:** `db-provision <slug>` → prints the 32-hex per-site password (stdout, one line). `db-deprovision <slug>` → silent on success.

- [ ] **Step 1: `bin/db-provision`:**

```sh
#!/bin/sh
set -eu
VIBE_BIN_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "${VIBE_BIN_DIR}/lib/shared-db.sh"
[ "$#" -eq 1 ] || sdb_die "usage: db-provision <slug>"
ident="$(sdb_validate_slug "$1")"          # vibe_<slug-with-underscores>; validated
# Per-site password: generated HERE, returned ONLY via stdout.
pw="$(openssl rand -hex 16)"               # 32 hex chars
# Host-grant pinned to the shared Docker network subnet (read live).
subnet="$(docker network inspect "$SHARED_DB_NETWORK" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
host_pat="$(printf '%s' "$subnet" | sed 's#\.0/[0-9]*$#.%#')"   # 172.x.0.0/16 -> 172.x.%
[ -n "$host_pat" ] || host_pat='%'         # fallback (still scoped by the grant)
maxc="$(grep -m1 '^SHARED_DB_MAX_USER_CONNECTIONS=' "$SHARED_DB_ENV" | sed 's/^[^=]*=//')"
maxc="${maxc:-25}"
case "$maxc" in ''|*[!0-9]*) maxc=25 ;; esac
# FIXED SQL TEMPLATE — only the VALIDATED ident, the generated pw, the derived
# host_pat, and the numeric maxc are substituted. No caller input reaches here.
sdb_mariadb_root "CREATE DATABASE IF NOT EXISTS \`${ident}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${ident}'@'${host_pat}' IDENTIFIED BY '${pw}';
GRANT ALL PRIVILEGES ON \`${ident}\`.* TO '${ident}'@'${host_pat}' WITH MAX_USER_CONNECTIONS ${maxc};
FLUSH PRIVILEGES;"
# Output contract: exactly the password, nothing else.
printf '%s\n' "$pw"
```

- [ ] **Step 2: `bin/db-deprovision`:** validate slug → `DROP DATABASE IF EXISTS \`${ident}\`; DROP USER IF EXISTS '${ident}'@'${host_pat}'; FLUSH PRIVILEGES;` (re-derive host_pat live; also try `'${ident}'@'%'` defensively). Silent on success.

- [ ] **Step 3:** `sh -n` both, chmod +x. Commit. (Real-DB behavior is proven in Task 3.)

### Task 3: Cross-tenant isolation test harness (THE SECURITY GATE)

**Files:** Create `test/shared-db-isolation.sh` (a self-contained sh harness; runnable on the VPS and in the Phase-5 round).

- [ ] **Step 1:** Write a harness that, against a REAL test shared-db container: runs `shared-db-init`, `db-provision sitea` (capture pw_a), `db-provision siteb` (capture pw_b), then asserts:
  1. `vibe_sitea`/pw_a CAN `SELECT`/`CREATE TABLE` in `vibe_sitea`.
  2. `vibe_sitea` CANNOT `USE vibe_siteb` / `SELECT … FROM vibe_siteb.*` (access denied).
  3. `vibe_sitea` CANNOT `SELECT … FROM mysql.user` (access denied).
  4. `vibe_sitea` CANNOT `GRANT` anything (no GRANT OPTION → access denied).
  5. `vibe_sitea` CANNOT `SHOW DATABASES` revealing `vibe_siteb` (only its own + info_schema).
  6. `SHOW GRANTS FOR 'vibe_sitea'@…` contains ONLY the scoped grant + `WITH MAX_USER_CONNECTIONS` — NO `*.*`, NO `GRANT OPTION`, NO `SUPER`.
  7. After `db-deprovision sitea`: `vibe_sitea` DB + user are gone; `vibe_siteb` intact.
  Connect as the per-site user via `docker compose exec -T db mariadb -u vibe_sitea -p<pw> …` (the per-site creds, from inside the network). Each assertion prints PASS/FAIL; the harness exits non-zero on any FAIL.

- [ ] **Step 2:** `sh -n test/shared-db-isolation.sh`. (It RUNS on the VPS in Task 12 / the security-review round — it needs Docker + a real container; document that it is not a unit test.) Commit.

---

## 🔒 SECURITY REVIEW GATE (after Tasks 1-3, before Phase 2)

The controller MUST run an adversarial security review of: the grant SQL (Task 2), `bin/lib/shared-db.sh` root-cred handling + `sdb_mariadb_root` (Task 1), the slug validation (defense in depth), and the isolation test coverage (Task 3) — BEFORE building the wrapper/panel. The review must confirm: no SQL injection path (slug regex excludes all metacharacters; SQL is a fixed template), the root password never reaches `ps` on the host, the grant is exactly least-privilege, and the isolation tests actually prove cross-tenant denial (not just happy-path). Run the isolation harness on the VPS as part of this gate. Only proceed to Phase 2 once the review + the live isolation run are clean.

---

## PHASE 2 — Root wrapper (`bin/vibe-panel-run`)

### Task 4: `shared-db` wrapper subcommand + sudoers

**Files:** Modify `bin/vibe-panel-run`, `bin/panel`.

- [ ] **Step 1:** Add a new top-level `shared-db)` arm to the wrapper's `case "$sub"` dispatch (alongside `vibe`/`installer`/`siteinfo`). Form: `shared-db <op> [slug]` where `op ∈ {init,status,provision,deprovision,backup}`. The wrapper:
  - validates `op` against that fixed set (`die` otherwise);
  - for `provision`/`deprovision`: requires exactly one slug arg + re-validates it with the SAME regex (`sdb_validate_slug` logic, inlined or sourced) — defense in depth independent of the scripts;
  - asserts `/opt/vibe-wp-shared-db` is root-owned (reuse `assert_root_owned`) and `env/shared-db.env` is root-owned + 0600 (refuse otherwise);
  - execs the matching `bin/` script (`shared-db-init`/`shared-db-status`/`db-provision`/`db-deprovision`/`backup-shared-db`) as root.
  - NO free-form args beyond the validated slug reach any script.

- [ ] **Step 2:** `bin/panel` sudoers — add a rule allowing `vibe-panel` to run `vibe-panel-run shared-db *` (bounded by the wrapper's op+slug re-validation). Mirror the existing sudoers line style. NO new `panel_env_keep` entries (these ops inject no secret env — verify).

- [ ] **Step 3:** `sh -n bin/vibe-panel-run && sh -n bin/panel`. Add a wrapper unit-ish test (sh): invalid op rejected, invalid slug rejected, missing/world-readable env file rejected. Commit.

---

## PHASE 3 — Panel provisioning integration

### Task 5: Panel runner helpers (`exec.ts`)

- [ ] Add `wrapSharedDbArgv(sub: string, args: string[]): string[]` → `["sudo","-n",runner,"shared-db",sub,...args]` (when a runner is configured; else a direct local form for dev). Add `runSharedDb(sub, args, opts)` (non-stream, returns `{stdout,stderr,code}`, `redact()`-ed) and `streamSharedDb(sub, args, opts)` (for init). Mirror `runVibe`/`streamVibe`. **`db-provision` stdout is the per-site password — handle it as a secret: it is captured in-process and never logged; do NOT pass it through any path that prints it.** Typecheck. Commit.

### Task 6: `shared-db.ts` + provisioning procedures + state

- [ ] **`core-bridge/shared-db.ts`:** `sharedDbInit()`, `sharedDbStatus()` (parse the non-secret JSON), `provisionSiteDb(slug)` → returns `{ password }` (runs `db-provision`, captures the single stdout line), `deprovisionSiteDb(slug)`.
- [ ] **`provision-input.ts`:** `createSharedDbSchema` (domain, slug, title, admin, etc. — like createSite, minus external DB creds).
- [ ] **`provision-state.ts`:** `buildCreateSharedDbState(input)` → calls `provisionSiteDb(slug)`, then builds an external-mode `InstallerStateLike` with `extDbHost="db"`, `extDbName=vibe_<slug>`, `extDbUser=vibe_<slug>`, `extDbPassword=<captured>`, and the site's `compose.external.yaml` shared_db network attachment flagged. Reuse `applyExternalOverrides` shape.
- [ ] **`provisioning.ts`:** `createSharedDb` (adminProcedure → buildCreateSharedDbState → startProvisionJob), `sharedDbInit` (adminProcedure → streamSharedDb init job), `sharedDbStatus` (adminProcedure → runSharedDb status), `sharedDbRotateRoot` (adminProcedure, Task 10). Register. **The per-site password lives only in the InstallerState → installer headless (stdin) → site env file; it is never returned to the browser.** Typecheck + full api suite. Commit.
- [ ] **Per-site compose:** parametrize `compose.external.yaml` so an opted-in site declares `networks: shared_db: { external: true, name: vibe-wp-shared-db }` and `wordpress`+`cron` (NOT `nginx`) join it. (The installer/external-plan writes this; mirror how external mode renders compose.) Commit.

### Task 7: Panel UI — wizard "Database" step + server "Shared database" section

- [ ] Create-site wizard: a "Database" step with **Dedicated container (default)** vs **Shared database** (the latter shown only when `sharedDbStatus().healthy`). Selecting Shared routes to `createSharedDb` (no external-cred form). Server settings: a "Shared database" card — status (present/healthy/connections/mem), an admin-only **Initialize shared database** button (`sharedDbInit`), and a **Rotate root password** action (Task 10). Mirror the existing wizard step + settings-card patterns. Quality gate (typecheck+lint+build). Commit.

---

## PHASE 4 — Migration, backup, rotation, docs

### Task 8: `bin/migrate-to-shared-db` (reversible)

- [ ] Implement the spec §7b 12-step procedure as a scripted op: maintenance-mode → dump per-container DB → `db-provision <slug>` → import into shared → row-count verify → write new env (shared host values) → swap to `compose.external.yaml` + shared_db net → down per-container / up external → maintenance off → smoke → on FAIL roll back to per-container (env + compose restored, container restarted) → on PASS tag the old volume (keep 7 days). `sh -n`. Commit. (E2E migrate+rollback verified in Task 12.)

### Task 9: `bin/backup-shared-db` + `bin/shared-db-schedule-apply`

- [ ] `bin/backup-shared-db`: `docker compose exec -T db mariadb-dump … --all-databases` (root pw via the same off-`ps` path) → dated archive under `/opt/vibe-wp-shared-db/backups/`; optional R2 upload (own prefix `SHARED_DB_BACKUP_R2_PREFIX`) reusing the existing rclone path. `bin/shared-db-schedule-apply`: install `vibe-wp-shared-db-backup.timer`+`.service` (weekly `OnCalendar`), mirroring `bin/backup-schedule-apply`. `sh -n` both. Commit.

### Task 10: Root password rotation

- [ ] `bin/shared-db-rotate-root`: generate a new root pw → `ALTER USER 'root'@'localhost' IDENTIFIED BY '<new>'` (+ any other root hosts) via the current root cred → write the new pw to `env/shared-db.env` (0600) atomically → `docker compose up -d --force-recreate db` (or no recreate needed since the change is live) → verify a root connection with the new pw. Wire `sharedDbRotateRoot` (Task 6). Per-site users + passwords are UNAFFECTED (only root rotates). `sh -n`. Commit.

### Task 11: `docs/recovery.md`

- [ ] Document: shared-server full restore (stop sites → recreate container+volume → import all-databases dump → re-run `db-provision` per site → restart+smoke); migration rollback; root-rotation recovery. Commit.

---

## PHASE 5 — VPS validation (Task 12)

Controller-run on the test VPS, on a CORRECTLY-deployed insights→shared branch (don't validate a stale checkout — the #3 lesson). Deploy + `bin/panel update`, then:

- [ ] `shared-db-init` → the `vibe-wp-shared-db` project is up, healthy, NO published port (`docker ps`/`ss -ltn` shows no host MariaDB port), root pw file is 0600 root.
- [ ] **Run `test/shared-db-isolation.sh`** → all isolation assertions PASS (cross-tenant denial, no GRANT, no mysql.*, scoped SHOW GRANTS).
- [ ] Create **two** sites on the shared DB via the panel → both install + smoke pass; each uses `vibe_<slug>` DB+user; site A's creds CANNOT reach site B's tables (re-prove live).
- [ ] **Root pw never in `ps`:** during a `db-provision`, `ps aux | grep -i mariadb` (and the host process list) shows NO root password.
- [ ] `bin/backup-shared-db` → a complete all-databases dump; restore into a scratch container verifies.
- [ ] **Migration:** migrate a per-container test site → shared; smoke passes; then exercise the rollback path → site returns to per-container with no data loss.
- [ ] **Root rotation:** rotate → root connects with the new pw; per-site sites keep working (their passwords unchanged).
- [ ] `db-deprovision` on remove-with-purge drops the DB+user; the other site is intact.
- [ ] Tear down all test artifacts (sites + the shared-db project); leave the VPS clean.

---

## Self-Review (plan author)

**Spec coverage:** §2 decisions (container/opt-in/per-DB-user/no-Redis) → constraints; §3 topology → T1/T6; §4 isolation (grant/network/root-cred/blast/injection/fairness/migration) → T1-T4 + constraints + T8; §5 provision ops + wrapper → T1-T4; §6 backups → T9 + per-site unchanged; §7 migration → T8; §8 panel → T6/T7; §9 scope (full) → all tasks; §10 phase gate → the SECURITY REVIEW GATE after Phase 1; §11 decisions → resolved (subnet host-grant, root rotation IN scope per owner, max_user_connections=25, shared-db at /opt/vibe-wp-shared-db); §12 risks → the isolation tests + the review gate + VPS round.

**Owner decisions baked in:** shared container (not bare-metal); FULL feature (migration + shared backup + root rotation); plan → adversarial security review (the gate) → build → VPS cross-tenant validation.

**Security-first ordering:** the grant SQL + provision ops + isolation tests (Tasks 1-3) come FIRST and are GATED by an adversarial review + a live isolation run before any wrapper/panel code — exactly as the spec mandates. The least-privilege grant, slug-validation-before-SQL, fixed SQL template, root-cred-off-`ps`, and no-published-port are constraints that bind every relevant task.

**Host-boundary checklist (features #1/#2/#3):** new wrapper subcommand (T4); SQL runs in/against the container via `exec` (mariadb is container-only); root file perms asserted (T1/T4); no env injection → no `panel_env_keep` change (verify in review); shared volume backed up via `exec` not host paths (T9); VPS round budgeted (T12) on a correct checkout.

**Open implementation risk flagged:** the `sdb_mariadb_root` root-credential-off-`ps` mechanism (T1 Step 3) is the single fiddliest + most security-critical detail — it MUST be validated against a real container in Task 3 and blessed by the security review before anything depends on it; the note gives a fallback (`MYSQL_PWD` via `exec`).

**No placeholders:** complete code/SQL for the security core (grant SQL, slug validation, root-cred read, the compose project); the integration/migration/backup/UI tasks name exact mirror targets (external-plan, provisioning.ts, backup-schedule-apply, the wizard) with the specific deltas. The two genuinely-novel security mechanisms (the grant + the root-cred handling) carry full code + an explicit review gate.
