# Feature #6: Native Global / Shared MariaDB — Design Spec

**Status:** Pre-implementation design. Security review required before any code is written.
**Date:** 2026-06-23.
**Effort:** L (multi-week).
**Risk classification:** HIGHEST-STAKES feature in the control panel. Cross-tenant data-leak is the primary threat model. A security review of §4 (isolation model), §5 (provision ops + wrapper), and §10 (phase gate) MUST gate the build.

---

## 1. Context

### The problem: per-site MariaDB containers are the biggest RAM cost

Every site deployed with the standard mode gets its own MariaDB container. The
`docker/mariadb/entrypoint.sh` renders a full `MARIADB_*`-tuned config and
allocates a dedicated InnoDB buffer pool per site (default `256M`). On a host
running four sites, four buffer pools = 1 GiB of RAM committed before a single
PHP-FPM process starts. The WP workload for each site is a few MB of actual hot
data — the per-container isolation carries real, measurable overhead.

### The connection half already exists: external-services mode

`compose.external.yaml` + `env/external.env.example` + `installer/src/core/external-plan.ts`
define a mode where WordPress connects to a MariaDB (and Redis) that live
OUTSIDE the site's Compose project. The pattern is already load-bearing:
`WORDPRESS_DB_HOST`, `WORDPRESS_DB_NAME`, `WORDPRESS_DB_USER`,
`WORDPRESS_DB_PASSWORD` are hard-required with `:?` in `compose.external.yaml`;
`externalEnvValues()` writes them into `env/external.env`; `buildExternalTasks()`
drives checkout → env → caddy → start → install → smoke → perf-report.

**What external mode does NOT do today:** it assumes the database and user
already exist and does NOT create or isolate them. That assumption is fine when
the operator supplies their own managed DB (a Planetscale, an existing bare-metal
MariaDB, etc.). It is NOT fine for a shared container that multiple sites will
use on the same VPS, where per-site tenant isolation must be enforced
programmatically.

### What this feature adds

A **shared MariaDB container** running as its own Compose project on the VPS,
paired with a **root-gated provision op** that creates per-site
`database + user + scoped grant` tuples — then wires each new site into
external-services mode pointed at the shared container.

This is additive and opt-in. Existing per-container sites are untouched.

---

## 2. Decisions (settled)

### 2a. Shared container, not bare-metal

A bare-metal MariaDB install would break:
- **Config-from-env model**: The `docker/mariadb/` entrypoint renders the tuning
  config from `MARIADB_*` env vars at container start. Bare-metal config lives in
  `/etc/mysql/` and requires manual management across OS upgrades.
- **`bin/harden`**: The hardening script knows what services are containerized vs
  host-native; adding a bare-metal service breaks its assumptions.
- **Reproducibility**: A second VPS can replicate the full stack with
  `docker compose up`. A bare-metal MariaDB requires out-of-band setup.
- **Backup**: `bin/backup` already knows how to drive `mariadb-dump` inside the
  container; a bare-metal MariaDB requires a different invocation path.

Decision: shared MariaDB runs as a **Docker container in a dedicated Compose
project** (`vibe-wp-shared-db`), with a **managed named volume** (`shared_db_data`).
The existing `docker/mariadb/` image and tuning model are reused unchanged.

### 2b. Opt-in per site, not the default

Shared DB requires trust that the provision op ran correctly, that the per-site
grant is right, and that the operator has sized the shared container
appropriately. High-value, high-traffic, or security-sensitive sites should
retain dedicated containers. The shared path is an explicit choice in the
create-site wizard.

### 2c. Per-database + per-user grant now; MariaDB Catalogs later

MariaDB 11.x introduces **Catalogs** (logical database namespaces with per-catalog
privilege scope, similar to Postgres schemas), which would be the ideal long-term
multi-tenant primitive. As of 2026-06-23, Catalogs are early-adoption and the
Docker image (`wordpress:7.0-php8.5-fpm` targets MariaDB LTS 10.x/11.x) cannot
guarantee a Catalog-capable server version across deployments.

Decision: implement **per-database + per-user** isolation now (the OWASP
multi-tenant least-privilege model, well-proven). Track MariaDB Catalogs as a
future upgrade path when they reach LTS maturity and the upstream image pins to
a compatible version.

### 2d. External Redis is out of scope for this feature

Shared Redis has a separate isolation model (keyspace prefixes + `AUTH` +
`maxmemory-policy`). It is a distinct feature and is NOT bundled here.

---

## 3. Architecture & topology

### 3a. The shared-db Compose project

```
/opt/vibe-wp-shared-db/          # root-owned, 0755
  compose.yaml                   # the shared DB project
  env/shared-db.env              # MARIADB_ROOT_PASSWORD=<generated>, tuning
  docker/mariadb/                # symlink or copy of root docker/mariadb/
```

`compose.yaml` for the shared-db project:

```yaml
name: vibe-wp-shared-db

services:
  db:
    build:
      context: ./docker/mariadb
    image: vibe-wp-shared-db-mariadb
    restart: unless-stopped
    env_file: env/shared-db.env
    environment:
      MARIADB_ROOT_PASSWORD: ${MARIADB_ROOT_PASSWORD:?required}
      # NO MARIADB_DATABASE / MARIADB_USER / MARIADB_PASSWORD at the shared level
      # — per-site databases and users are created by db-provision, not by the
      # container init script.
    volumes:
      - shared_db_data:/var/lib/mysql
    networks:
      - shared_db
    # NEVER publish a port. No ports: section.
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
    name: vibe-wp-shared-db       # fixed name so per-site projects can attach
```

Key constraints:
- `MARIADB_DATABASE` / `MARIADB_USER` / `MARIADB_PASSWORD` are intentionally
  absent from the container init — the container starts empty. Per-site
  databases+users are created ONLY by the `db-provision` op (§5).
- No `ports:` binding. The `shared_db` network is internal; no host port is
  published, ever.
- `MARIADB_ROOT_PASSWORD` is the ONLY bootstrap secret. It is stored in
  `env/shared-db.env` (0600, root-owned). It is used ONLY by `db-provision` and
  NEVER passed to any site's env file or WordPress container.

### 3b. Per-site wiring (external-services mode + shared network)

When a site is created with "use shared DB":

1. `db-provision` creates `vibe_<slug>` database and `vibe_<slug>` user (§5).
2. The site's env file is `env/external.env` (identical to today's external mode),
   with these values set by the provisioning bridge:

   ```
   WORDPRESS_DB_HOST=db          # service name on the shared_db network
   WORDPRESS_DB_NAME=vibe_<slug>
   WORDPRESS_DB_USER=vibe_<slug>
   WORDPRESS_DB_PASSWORD=<generated-per-site>
   ```

3. The site's `compose.external.yaml` gains a **network attachment** to
   `vibe-wp-shared-db` (declared as `external: true`):

   ```yaml
   networks:
     backend:
       driver: bridge
     shared_db:
       external: true
       name: vibe-wp-shared-db
   ```

   The `wordpress` and `cron` services join both `backend` and `shared_db`.
   The `nginx` service joins ONLY `backend` (it must never reach the DB).

4. Within the `shared_db` network, the site's WP container addresses the shared
   MariaDB as `db` (the container's service name on that network). Because
   Docker's internal DNS resolves service names within the network, no IP
   hard-coding is required.

### 3c. Provisioning lifecycle

```
Panel: "Create site with shared DB"
  │
  ├─ db-provision <slug>            ← NEW root-gated op (§5)
  │    Connects to shared MariaDB as root
  │    Creates: database vibe_<slug>
  │             user vibe_<slug>@<wp-container-host-pattern>
  │             GRANT ALL PRIVILEGES ON vibe_<slug>.* TO vibe_<slug>@...
  │    Returns: generated password (written to site env by provisioning bridge)
  │
  ├─ buildExternalTasks() / externalEnvValues()   ← existing path, untouched
  │    Writes env/external.env including WORDPRESS_DB_HOST=db,
  │    WORDPRESS_DB_NAME=vibe_<slug>, WORDPRESS_DB_USER=vibe_<slug>,
  │    WORDPRESS_DB_PASSWORD=<generated>
  │
  ├─ Site compose.external.yaml gains shared_db network attachment
  │
  └─ Standard external-mode task sequence (checkout → caddy → up → install → smoke)
```

Deprovision:

```
Panel: "Remove site (purge)"
  │
  ├─ db-deprovision <slug>          ← NEW root-gated op (§5)
  │    DROP DATABASE IF EXISTS vibe_<slug>;
  │    DROP USER IF EXISTS 'vibe_<slug>'@'%';    ← or per-pattern
  │
  └─ Standard remove-site sequence (compose down, Caddy snippet removed, dirs removed)
```

### 3d. Cross-cutting invariant

**All per-site identifiers (database name, user name) are derived from `vibe_<slug>`
using a FIXED template. The slug is validated against a strict regex BEFORE any
SQL is constructed. The identifiers are NEVER interpolated from user input.**

---

## 4. Security & isolation model

This section is the heart of the spec. Every point is a required control, not a
nice-to-have. A reviewer should verify each control is enforced at the
implementation layer.

### 4.1 Per-site least privilege at the grant level

Each site gets ONE MariaDB user (`vibe_<slug>`) granted `ALL PRIVILEGES` on
exactly ONE database (`vibe_<slug>.*`) and NOTHING ELSE.

Explicitly PROHIBITED grants:
- No global privileges (`GRANT ALL PRIVILEGES ON *.*`).
- No `GRANT OPTION` (a site user can NEVER re-grant its own privileges).
- No `SUPER`, `PROCESS`, `FILE`, `RELOAD`, `SHUTDOWN`, `CREATE USER`,
  `REPLICATION SLAVE/CLIENT`, or any other server-level privilege.
- No cross-database access. `SELECT` on `mysql.*`, `information_schema.*`, or any
  other site's `vibe_<otherslug>.*` is impossible with this grant.
- No `EXECUTE` on stored procedures in other databases.

The grant SQL (§5) enforces this. There is no separate step that could
accidentally add a broader grant.

**Why `ALL PRIVILEGES` on `vibe_<slug>.*` is safe:** `ALL PRIVILEGES` scoped to a
single named database gives `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CREATE`,
`DROP`, `INDEX`, `ALTER`, `CREATE TEMPORARY TABLES`, `LOCK TABLES`, `EXECUTE`,
`CREATE VIEW`, `SHOW VIEW`, `CREATE ROUTINE`, `ALTER ROUTINE`, `EVENT`, `TRIGGER`
— all on `vibe_<slug>.*` only. It gives NO server-level access and NO ability to
touch other databases. This is the standard WordPress multi-tenant grant pattern
and the OWASP principle of least privilege per tenant.

### 4.2 Network segmentation

Three layers:

**Layer 1 — no published port.** The shared MariaDB container has no `ports:`
entry. It is unreachable from outside the Docker network. It is unreachable from
the VPS host itself on a TCP port. The ONLY way to reach it is from a container
on the `vibe-wp-shared-db` network.

**Layer 2 — explicit network attachment.** Only site Compose projects that have
been provisioned with `db-provision` gain the `shared_db` network attachment.
A new site created in per-container mode NEVER joins `shared_db`.

**Layer 3 — user host-grant pinning.** The `CREATE USER` statement uses a
host-grant pattern that restricts which container IP can authenticate. The
Docker bridge network assigns container IPs from a predictable subnet (e.g.
`172.28.0.0/16` for the `vibe-wp-shared-db` bridge). The initial implementation
uses the Docker network subnet as the host-grant pattern:

```sql
CREATE USER 'vibe_<slug>'@'172.28.0.%' IDENTIFIED BY '<password>';
```

This means:
- A site's credentials only work from an IP within the shared Docker network.
- If the shared network subnet is known (it is, because `db-provision` reads it
  via `docker network inspect vibe-wp-shared-db --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'`),
  the host pattern can be as narrow as the subnet.
- A compromised site A's credentials CANNOT be used from a host-level process,
  from outside the VPS, or from a container on a different network.

**Open decision (§11):** Whether to narrow further to the specific container IP
at provision time (more precise isolation, but requires reprovisioning when the
container restarts and gets a new IP) or to use the subnet (simpler, still
substantially reduces blast radius). The subnet approach is recommended for v1.

**What host-grant pinning does NOT prevent:** If site A's WP container is
compromised, an attacker who can run arbitrary code inside it can attempt to
connect to the shared MariaDB. The credentials for `vibe_A` only access
`vibe_A.*` (layer 1 of isolation). They CANNOT access `vibe_B.*` because the
grant is scoped. This is the primary cross-tenant protection.

### 4.3 Root credential handling

The root password (`MARIADB_ROOT_PASSWORD`) is the most sensitive credential in
this feature. It grants full access to the shared MariaDB server.

Controls:

- **Storage:** `env/shared-db.env`, owned root:root, mode 0600. Not readable by
  the `vibe-panel` user.
- **Access:** Only the `db-provision` and `db-deprovision` ops read this file,
  and they do so running as root (via the `vibe-panel-run` wrapper).
- **Never in argv:** The provision op reads the root password from the file via
  `grep -m1 '^MARIADB_ROOT_PASSWORD=' env/shared-db.env` and passes it to
  `mariadb` via a HERE document or `--password=` read from stdin with `--batch`.
  It is NEVER passed as a command-line argument (visible to `ps`).
- **Never logged:** The op's output is always passed through `redact()` before
  leaving the exec layer (same contract as all other vibe ops).
- **Never returned:** `db-provision` returns ONLY the generated per-site
  password. The root password is not echoed, logged, or included in any response.
- **Rotation:** Root password rotation is an admin-only panel operation (§11 open
  decision: implement in v1 or v2). It requires restarting the shared container
  with the new password.

### 4.4 Blast radius containment

The shared MariaDB is a single failure domain: if it goes down, all sites using
it lose database access simultaneously. This is the primary operational risk.

Mitigations:

- **Opt-in.** The operator chooses which sites use the shared container. A
  customer whose site cannot tolerate shared-DB downtime can use a dedicated
  container or a managed external DB.
- **Per-site grant isolation.** A compromised shared-DB credential (for site A)
  can destroy `vibe_A.*` but CANNOT read, modify, or destroy `vibe_B.*`. The
  blast radius of a credential leak is per-site, not per-server.
- **Shared-server-level safety dump.** `bin/backup` gains an optional
  `--shared-db` flag that performs a full-server dump (`mariadb-dump --all-databases`)
  from the shared container, stored separately from per-site dumps. This catches
  any sites that were missed in per-site backup schedules. (§6 details.)
- **`max_user_connections`.** Each per-site user is created with a
  `max_user_connections` limit (§4.6) so one runaway site cannot exhaust the
  shared server's connection pool.
- **Per-site per-container option always available.** An operator can migrate a
  site back to a dedicated container at any time using the migration procedure (§7).

### 4.5 SQL injection prevention

The `db-provision` op is the only code in the system that executes privileged SQL.
It is a shell script (`bin/db-provision`) that receives a single argument: the
site slug.

Injection prevention:

1. **Slug validation first.** The slug is validated against the regex
   `^[a-z][a-z0-9-]{0,47}$` (same character class the installer uses for
   COMPOSE_PROJECT_NAME, minus the `vibe-wp-` prefix). Any input that does not
   match aborts with an error before any SQL is touched.

2. **Fixed identifier templates.** The database name is ALWAYS `vibe_${slug}`
   (with hyphens converted to underscores). The user name is ALWAYS
   `vibe_${slug}`. These are constructed from the VALIDATED slug using fixed
   string templates — `sed 's/-/_/g'` — not by interpolating arbitrary user
   input.

3. **SQL is a fixed heredoc.** The `mariadb` client receives the SQL via a
   heredoc or `--execute` with the constructed (already-safe) identifiers
   substituted. The SQL template does not evaluate shell variables from user input.

4. **No `eval`.**  The provision op never calls `eval` on any input.

5. **`vibe-panel-run` re-validates the slug** at the root boundary before
   `db-provision` executes (§5c).

### 4.6 Resource fairness

One site's runaway queries or connection storms can starve all other sites sharing
the MariaDB server. Controls:

- **`max_user_connections`** per per-site user: set to `25` (configurable via a
  `SHARED_DB_MAX_USER_CONNECTIONS` env var in the shared-db env file). This is
  enforced by MariaDB at the grant level:
  ```sql
  GRANT ALL PRIVILEGES ON vibe_<slug>.* TO 'vibe_<slug>'@'...'
    WITH MAX_USER_CONNECTIONS 25;
  ```
- **`max_connections`** at the server level: `MARIADB_MAX_CONNECTIONS` (defaults
  `150` in `docker/mariadb/entrypoint.sh`). For a shared-DB scenario with many
  sites, this should be tuned up (e.g. `300`). The shared-db env file sets an
  appropriate default.
- **`MARIADB_INNODB_BUFFER_POOL_SIZE`**: one buffer pool shared across all sites
  is the core RAM saving. Size it at `512M–1G` for a multi-site VPS (vs. `256M ×
  N` per-container). The shared-db env file sets a recommended default.
- **No `MARIADB_PERFORMANCE_SCHEMA=ON` by default**: keeping it off (the
  docker/mariadb default) avoids the fixed memory overhead.

### 4.7 Migration safety

Moving a site from per-container to shared DB involves:

1. Dumping the site's data (`mariadb-dump`),
2. Importing into the shared DB,
3. Repointing the site env to the shared container.

This is a multi-step operation with a window where the site is either in
read-only mode or briefly offline. Controls:

- **Reversibility:** The old per-container DB data volume is NOT deleted until the
  migration is verified (smoke test passes). It is tagged with a label and a
  manual prune step follows.
- **Tested procedure:** The migration is a tested, scripted op (§7), not
  ad-hoc SQL.
- **No data loss path:** If the smoke test fails after migration, the site's env
  is rolled back to the per-container path and the old container is restarted.

---

## 5. The `db-provision` and `db-deprovision` ops

### 5a. Grant SQL

`db-provision <slug>` runs the following SQL against the shared MariaDB as root:

```sql
-- db-provision vibe_SLUG (hyphens converted to underscores)
CREATE DATABASE IF NOT EXISTS `vibe_SLUG`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'vibe_SLUG'@'HOST_PATTERN'
  IDENTIFIED BY 'GENERATED_PASSWORD';

GRANT ALL PRIVILEGES ON `vibe_SLUG`.* TO 'vibe_SLUG'@'HOST_PATTERN'
  WITH MAX_USER_CONNECTIONS MAX_CONNS;

FLUSH PRIVILEGES;
```

Where:
- `vibe_SLUG` = `vibe_` + slug with hyphens converted to underscores.
- `HOST_PATTERN` = Docker network subnet (e.g. `172.28.0.%`), determined at
  provision time by `docker network inspect vibe-wp-shared-db`.
- `GENERATED_PASSWORD` = 32 random hex bytes generated by `openssl rand -hex 32`
  inside the provision op (NOT by the panel). The password is written to STDOUT
  (and ONLY stdout) by `db-provision`. The root-gated wrapper captures it and the
  panel's provisioning bridge writes it into the site env under
  `WORDPRESS_DB_PASSWORD`.
- `MAX_CONNS` = value of `SHARED_DB_MAX_USER_CONNECTIONS` from shared-db env
  (default `25`).

**Critical: no `GRANT OPTION`, no `SUPER`, no `PROCESS`, no `FILE`, no
global grants.** The SQL template is fixed. It cannot be modified by any
caller-supplied input.

`db-deprovision <slug>` runs:

```sql
DROP DATABASE IF EXISTS `vibe_SLUG`;
DROP USER IF EXISTS 'vibe_SLUG'@'HOST_PATTERN';
FLUSH PRIVILEGES;
```

Where `HOST_PATTERN` is re-derived from `docker network inspect` at deprovision
time (it may have changed if the network was recreated — hence querying live).

### 5b. Slug validation

Both ops validate the slug BEFORE constructing any identifier:

```sh
validate_slug() {
  slug="$1"
  # Must match: lowercase letter, then 0-47 lowercase letters, digits, or hyphens.
  # This is the same character class as COMPOSE_PROJECT_NAME minus the vibe-wp- prefix.
  case "$slug" in
    [a-z][a-z0-9-]*) : ;;  # prefix OK
    *) die "invalid slug: must start with a lowercase letter" ;;
  esac
  # Length check: 1-48 characters (max 48 gives DB name 'vibe_' + 48 = 53 chars,
  # within MariaDB's 64-char identifier limit with room for future prefixes).
  if [ ${#slug} -gt 48 ]; then
    die "slug too long (max 48 characters)"
  fi
  # Character check: only lowercase, digits, hyphens.
  case "$slug" in
    *[!a-z0-9-]*) die "slug contains invalid characters (allowed: a-z 0-9 -)" ;;
  esac
}
```

### 5c. Wrapper subcommand: `vibe-panel-run db-provision`

`bin/vibe-panel-run` gains a new `db-provision` subcommand:

```
db-provision <slug>         Create per-site DB + user; print generated password.
db-deprovision <slug>       Drop per-site DB + user.
```

The wrapper validates:
1. Exactly one argument (the slug).
2. Slug passes `validate_slug` (identical regex, enforced at the root boundary
   independently of the provision script — defence in depth).
3. The shared-db env file (`/opt/vibe-wp-shared-db/env/shared-db.env`) is
   root-owned and 0600 (refuse to proceed if not, as reading a world-readable
   root-password file is itself a security failure).
4. The shared-db Compose project directory is root-owned (same `assert_root_owned`
   guard used for site dirs).

Then execs `bin/db-provision "$slug"` (or `bin/db-deprovision "$slug"`), which
runs as root.

**Sudoers entry addition:**

```
vibe-panel ALL=(root) NOPASSWD: /opt/vibe-wp-panel/bin/vibe-panel-run db-provision *
vibe-panel ALL=(root) NOPASSWD: /opt/vibe-wp-panel/bin/vibe-panel-run db-deprovision *
```

The glob `*` is bounded by the slug validation inside the wrapper — the sudoers
rule cannot be exploited to pass arbitrary arguments because the wrapper re-validates.

**Root credential access in the provision script:**

```sh
# Read root password from 0600 file — NEVER from argv, env var, or named pipe.
root_password="$(grep -m1 '^MARIADB_ROOT_PASSWORD=' \
  /opt/vibe-wp-shared-db/env/shared-db.env | sed 's/^MARIADB_ROOT_PASSWORD=//')"

# Pass to mariadb via --password= without exposing it on the command line:
# Use a temporary credentials file (deleted on EXIT trap) rather than --password= argv.
cred_file="$(mktemp)"
trap 'rm -f "$cred_file"' EXIT
chmod 0600 "$cred_file"
printf '[client]\npassword=%s\n' "$root_password" > "$cred_file"

mariadb --defaults-extra-file="$cred_file" \
  --host=127.0.0.1 --port=3306 -u root \
  --batch --skip-column-names \
  <<SQL
  ... grant SQL ...
SQL
unset root_password
```

Note: connecting via `127.0.0.1:3306` requires the shared-db container to expose
a port to `127.0.0.1` ONLY (not `0.0.0.0`). Alternatively, the provision script
can run the SQL via `docker compose exec -T db mariadb -u root ...` to avoid
publishing any port:

```sh
docker compose -f /opt/vibe-wp-shared-db/compose.yaml \
  --env-file /opt/vibe-wp-shared-db/env/shared-db.env \
  exec -T db mariadb -u root --defaults-extra-file=/dev/stdin <<SQL
  ...
SQL
```

The `--defaults-extra-file=/dev/stdin` with a heredoc that includes the password
keeps the root credential off `ps`. The `exec -T` form avoids allocating a TTY.

**Recommended approach:** use `docker compose exec -T db` so the shared container
never needs a published port even on `127.0.0.1`. The provision op runs as root
and has access to the Docker socket.

### 5d. Output contract

`db-provision <slug>` prints EXACTLY ONE LINE to stdout: the generated password
(32 hex characters). Nothing else. The panel's core-bridge captures this line and
writes it to `WORDPRESS_DB_PASSWORD` in the site's env file (via the existing
`env-writer.ts` path). This is the ONLY transfer of the per-site password.

`db-deprovision <slug>` prints nothing on success; error messages go to stderr.

---

## 6. Backups & restore

### 6a. Per-site logical dump (unchanged)

`bin/backup` already handles the external-services case: when the `db` service
does not exist in the site's Compose project, it falls through to:

```sh
vibe_wp_stdin db export - --single-transaction --routines --triggers > "${database_sql}"
```

This uses WP-CLI's `db export` command, which reads `WORDPRESS_DB_*` from the
site's env, connects to the shared MariaDB as the per-site user (`vibe_<slug>`),
and dumps only `vibe_<slug>.*`. Per-site isolation at the dump level is FREE
because the per-site user can ONLY see `vibe_<slug>.*`.

No changes to `bin/backup` are required for per-site backups.

### 6b. Shared-server safety dump (new)

A new `bin/backup-shared-db` script dumps the ENTIRE shared MariaDB server
(`mariadb-dump --all-databases`) to a time-stamped archive under
`/opt/vibe-wp-shared-db/backups/`. This is:
- Not a replacement for per-site backups (those are site-scoped).
- An additional safety net that captures all per-site databases in one shot
  from root, at a lower frequency (weekly rather than daily).
- Triggered by a systemd timer: `vibe-wp-shared-db-backup.timer`.

The dump runs via `docker compose exec -T db mariadb-dump -u root --all-databases`
with the root password passed via `--defaults-extra-file=/dev/stdin` (same
credential handling as `db-provision`).

R2 upload: the shared-db backup follows the same rclone path as site backups,
using its own prefix (`SHARED_DB_BACKUP_R2_PREFIX`).

### 6c. Restore

Per-site restore is unchanged: `bin/restore` imports `database.sql.gz` back into
the site's database via `vibe_wp_stdin db import -`, which uses the per-site
user credentials. The per-site user has `CREATE TABLE`, `DROP`, etc. on
`vibe_<slug>.*`, so standard WP-CLI import works.

Full shared-server restore is an emergency operation:
1. Stop all sites sharing the container.
2. Drop and recreate the shared container with a fresh volume.
3. Import the shared-server dump.
4. Re-run `db-provision` for each site (to recreate the per-site users with
   their current passwords from each site's env).
5. Restart all sites and run smoke tests.

This procedure is documented in `docs/recovery.md` (out of scope for this spec
to write; flagged as a required deliverable for the implementation phase).

---

## 7. Migration: per-container → shared MariaDB

### 7a. Pre-conditions

- The shared MariaDB container is running and healthy.
- `db-provision <slug>` has NOT yet been run for this site (no conflict).
- The site is healthy (passing smoke test) before migration starts.
- The operator has a recent backup.

### 7b. Migration procedure (scripted as `bin/migrate-to-shared-db`)

```
Step 1: Put site in maintenance (wp maintenance-mode activate)
Step 2: Dump current DB from per-container MariaDB
  → vibe_compose exec -T db mariadb-dump ... > /tmp/vibe_<slug>_migrate.sql
Step 3: db-provision <slug>  (creates DB + user on shared, returns password)
Step 4: Import dump into shared DB
  → Connect as root to shared DB, SELECT INTO vibe_<slug> via docker compose exec -T
  → Or: set WORDPRESS_DB_* temporarily to shared-DB values, run vibe_wp db import
Step 5: Verify import (row count cross-check: wp db query "SELECT COUNT(*) FROM wp_posts")
Step 6: Write new env (WORDPRESS_DB_HOST=db, NAME/USER/PASSWORD from step 3)
Step 7: Swap compose file to compose.external.yaml, add shared_db network attachment
Step 8: docker compose down (per-container MariaDB container + network stop)
         docker compose up -d (starts in external mode)
Step 9: wp maintenance-mode deactivate
Step 10: Run smoke test
Step 11: If smoke FAILS:
         - Roll back env to per-container values
         - Restore compose.yaml (per-container mode)
         - docker compose up -d (per-container starts again)
         - Notify operator
Step 12: If smoke PASSES:
         - Tag the old DB volume: docker volume label <vol> migrated-to-shared=<timestamp>
         - Leave it in place for 7 days (operator prune)
```

### 7c. Reversibility window

The old per-container data volume is NOT pruned automatically. The operator has a
7-day window to verify the migrated site in production and then manually prune
the old volume (`docker volume rm vibe-wp-<slug>_db_data`). This provides a
data-loss-free recovery path if a problem is discovered after maintenance mode
ends.

---

## 8. Panel integration

### 8a. Host-level setup (admin-only, one-time per VPS)

A new **"Shared database"** section in the panel's server settings:

- **Status**: shows whether the shared-db Compose project exists and is healthy.
- **"Initialize shared database"** button (admin-only): runs a new
  `vibe-panel-run shared-db-init` op that:
  1. Creates `/opt/vibe-wp-shared-db/` with the compose file and a generated
     `MARIADB_ROOT_PASSWORD`.
  2. Runs `docker compose up -d` for the shared-db project.
  3. Waits for the healthcheck to pass.
  4. Reports success (the shared DB is ready to accept sites).
- **Resource usage**: shows the shared container's `docker stats` (memory,
  connections used vs. configured max).

### 8b. Create-site wizard: "use shared DB" option

The existing `createSite` and `createExternal` wizard flows gain a new optional
step: **"Database"** with two choices:

1. **Dedicated container (default)** — existing behavior, no change.
2. **Shared database** — shown only when the shared-db container is running and
   healthy (the panel checks before showing the option).

When "Shared database" is selected:
- The wizard skips the "external DB credentials" form (there are none to enter —
  the provisioning bridge generates them).
- The `createSharedDb` provisioning path (new handler in `provisioning.ts`)
  calls `db-provision <slug>` via the wrapper, captures the generated password,
  then calls `buildExternalTasks()` / `externalEnvValues()` with the shared-DB
  host values filled in automatically.
- The job's progress tray shows "Provision database" as a distinct step before
  the standard external-mode install tasks.

### 8c. Remove-site flow

When a site using the shared DB is removed:
- If `purge: true`: after compose down and directory removal, `db-deprovision <slug>`
  is run. This drops `vibe_<slug>` database and user.
- If `purge: false` (keep files): DB is NOT deprovisioned (the data stays).
  The operator can manually deprovision via a panel action.

### 8d. Contract changes (new procedures and ops)

New entries in `VIBE_OPS` (exec.ts):

```typescript
sharedDbStatus: { argv: ["shared-db-status"], stream: false },
sharedDbInit:   { argv: ["shared-db-init"],   stream: true  },
```

New entries in `vibe-panel-run` allowlist:

```
db-provision <slug>
db-deprovision <slug>
shared-db-init
shared-db-status
```

New provisioning router procedure:

```typescript
createSharedDb: adminProcedure
  .input(createSharedDbSchema)
  .handler(async ({ input, context }): Promise<ProvisionJobRef> => {
    // 1. Call db-provision via vibe-panel-run, capture password.
    // 2. Build state with shared-DB values.
    // 3. Start provision job (external-mode task sequence).
  })
```

---

## 9. Scope / out-of-scope

### In scope (this feature)

- `vibe-wp-shared-db` Compose project (compose file, env template, MariaDB image reuse).
- `bin/db-provision` + `bin/db-deprovision` scripts.
- `vibe-panel-run` additions: `db-provision`, `db-deprovision`, `shared-db-init`,
  `shared-db-status`.
- Shared-db network attachment in `compose.external.yaml` (parametrized).
- `bin/backup-shared-db` + systemd timer.
- Panel: server settings "Shared database" section.
- Panel: create-site wizard "use shared DB" option.
- Panel: remove-site deprovision path.
- Migration script `bin/migrate-to-shared-db`.
- Isolation tests (TDD — see §10).
- `docs/recovery.md` additions for shared-server restore.

### Out of scope (explicitly deferred)

- **MariaDB Catalogs**: deferred until LTS maturity. The per-DB+per-user model
  is the upgrade path FROM, not the replacement FOR, Catalogs.
- **Bare-metal MariaDB**: kept out-of-scope because it breaks the
  config-from-env reproducible model.
- **Shared Redis**: a separate feature with its own isolation model.
- **Cross-VPS shared DB** (e.g. one Planetscale instance for multiple VPSes):
  this spec covers only same-VPS shared container. Managed external DB via the
  existing external-services mode is already available.
- **Automatic per-user resource limit enforcement via `PROCESS` kill**: MariaDB
  kills long-running queries via `wait_timeout` and `max_statement_time`; per-user
  quotas via `max_user_connections` are enough for v1. A query governor is a v2
  enhancement.
- **Root password rotation UI**: flagged as an open decision (§11).

---

## 10. Phased build outline

### Phase 1: Shared-db Compose project (no sites yet)

- Write `compose/shared-db/compose.yaml` + `env/shared-db.env.example`.
- Write `bin/db-provision` and `bin/db-deprovision` as standalone scripts
  (testable without the panel).
- Write `bin/shared-db-init` (brings up the shared-db project, generates root
  password).
- **TDD first**: write isolation tests that verify:
  - `vibe_<slug>` user CAN connect to `vibe_<slug>.*`.
  - `vibe_<slug>` user CANNOT read `mysql.*`.
  - `vibe_<slug>` user CANNOT read or write any other `vibe_<otherslug>.*`.
  - `vibe_<slug>` user CANNOT grant any privileges.
  - Root password is not present in any process's argv after provision.
- These tests run against a real (test-only) shared-db container.

**GATE: Security review of `bin/db-provision` + grant SQL + wrapper additions
before proceeding to Phase 2.**

### Phase 2: `vibe-panel-run` additions

- Add `db-provision`, `db-deprovision`, `shared-db-init`, `shared-db-status`
  subcommands to `bin/vibe-panel-run`.
- Slug validation in the wrapper (re-validate independently of the scripts).
- Ownership/permission checks for the shared-db env file.
- Unit test: wrapper rejects invalid slugs, rejects missing shared-db dir,
  rejects non-root-owned env file.

### Phase 3: Provisioning integration

- `VIBE_OPS` additions in `exec.ts`.
- `createSharedDb` procedure in `provisioning.ts`.
- `createSharedDbSchema` in `provision-input.ts`.
- `buildCreateSharedDbState()` in `provision-state.ts` (builds external-mode
  state from shared-DB host values + `db-provision` output).
- Panel wizard "Database" step.
- Panel server settings "Shared database" section.

### Phase 4: Migration + backup

- `bin/migrate-to-shared-db` with rollback path.
- `bin/backup-shared-db` + systemd timer.
- `docs/recovery.md` additions.
- End-to-end test: migrate a test site, verify smoke, roll back to per-container.

### Phase 5: VPS validation

- Deploy to the test VPS (`ssh -i /Users/tomrobak/.ssh/vcode_sh root@178.104.10.126`).
- Create two sites on the shared DB.
- Verify tenant isolation: site A's credentials cannot access site B's tables.
- Run `bin/backup-shared-db` + verify dump is complete.
- Run migration: per-container → shared, verify smoke, roll back, verify recovery.
- Confirm root password never appears in `ps aux` output during provision.

---

## 11. Open decisions for the owner

1. **Shared-DB opt-in default**: Should "shared database" ever become the default
   for new sites on a VPS where the shared container is initialized? Recommendation:
   no — keep dedicated-container as the always-default. The operator opts in
   per-site. But this should be confirmed.

2. **Host-grant pattern: subnet vs. per-IP**: Use the Docker network subnet
   (`172.28.0.%`) for the user host-grant (simpler, survives container restarts)
   or pin to the specific WP container IP at provision time (more precise, requires
   reprovisioning on restart)? Recommendation: subnet for v1, with a note to
   explore per-IP for high-security sites in v2.

3. **Root password rotation**: Should the panel UI expose a "rotate root password"
   action for the shared DB in v1, or is this an out-of-band admin operation? If a
   root password is compromised, the ability to rotate it without downtime is
   important.

4. **`max_user_connections` default**: `25` is a reasonable default for a
   WordPress site. Does the operator need a per-site override (different limit for
   a high-traffic site)? If so, should it be a wizard input or a post-creation
   panel setting?

5. **Managed external DB as an alternative**: Should the wizard also offer "use a
   managed external DB (e.g. PlanetScale, Aiven)" as a third database option,
   distinct from the shared on-VPS container? The existing external-services mode
   already supports this technically; the question is whether to surface it
   explicitly in the panel wizard.

6. **Shared-db project location**: `/opt/vibe-wp-shared-db/` is the proposed path.
   Should it be configurable (e.g. via a panel setting stored in the panel's
   SQLite)? Or fixed at install time?

7. **Shared-server backup frequency and retention**: Weekly full-server dump is
   proposed. Should this be configurable? What R2 prefix / bucket should it use
   (separate from per-site prefixes)?

---

## 12. Risks

### Risk 1: Cross-tenant data leak (HIGHEST)

**Scenario:** Site A's per-site user credential (`vibe_A` / `vibe_A.*`) is
obtained by an attacker (e.g. via a PHP exploit that reads the site env file).
The attacker uses this credential to reach data from Site B.

**Mitigation:** The grant model (§4.1) makes this impossible at the MariaDB level:
`vibe_A` has no privileges on `vibe_B.*`. The host-grant pattern (§4.2) further
limits where the credential can be used from. The attacker would need to (a) read
the root password (which is in a separate 0600 file, not the site env), (b) run
code from within the `vibe-wp-shared-db` network, and (c) bypass Docker network
isolation — a much harder attack.

**Residual risk:** The shared MariaDB root password, if leaked, gives full access
to all per-site databases. Root password handling (§4.3) is the highest-value
hardening target. The isolation tests (§10 Phase 1) verify the grant model
independently of the application.

### Risk 2: Single failure domain

**Scenario:** The shared MariaDB container crashes, has a corrupt volume, or is
killed by an OOM event. All sites using it lose database access simultaneously.

**Mitigation:** Per-site `max_user_connections` (§4.6) prevents one site from
exhausting the connection pool. The shared-server safety dump (§6b) provides
point-in-time recovery. The opt-in model (§2b) ensures that the operator can
route high-value sites to dedicated containers. Docker's `restart: unless-stopped`
policy handles transient crashes.

**Residual risk:** Volume corruption or a host-level OOM kill of the MariaDB
container affects all shared-DB sites simultaneously. For VPSes where this risk
is unacceptable, the per-container model remains available.

### Risk 3: Privilege escalation via the provision op

**Scenario:** A malicious SQL injection or a bug in `bin/db-provision` causes
the provision op (which runs as root) to execute unintended SQL — e.g., granting
`SUPER` to a per-site user or creating a backdoor root account.

**Mitigation:** Slug validation before any SQL (§4.5), fixed SQL template with no
user-controlled string interpolation (§5a), and the wrapper's independent
re-validation (§5c). The SQL is a heredoc with substituted (already-safe)
identifiers — not a dynamically assembled string. The isolation tests (§10 Phase 1)
verify the final grant state.

**Residual risk:** A bug in the heredoc substitution could theoretically be
exploited if the slug validation regex has a gap. The regex `^[a-z][a-z0-9-]{0,47}$`
excludes all SQL metacharacters (backtick, apostrophe, semicolon, backslash, NUL).
This should be verified by the security reviewer.

### Risk 4: Shared-db env file permission drift

**Scenario:** The shared-db env file (`env/shared-db.env`, 0600 root:root) has
its permissions changed (e.g. by a misconfigured deploy script) to world-readable.
The root password is now exposed to any user on the VPS.

**Mitigation:** The `vibe-panel-run` wrapper asserts the env file is 0600 and
root-owned before reading it (§5c). The `shared-db-status` op reports the current
permissions. A future hardening check can add this to `bin/doctor`.

---

## 13. References

- `installer/src/core/external-plan.ts` — external-services mode connection wiring and task sequence.
- `compose.external.yaml` — the Compose template for external-mode sites (DB host pattern).
- `env/external.env.example` — the env template for external-mode sites.
- `docker/mariadb/entrypoint.sh` — MariaDB config-from-env rendering (reused for shared container).
- `compose.yaml` — per-site MariaDB container definition (what shared DB replaces for opted-in sites).
- `control-panel/packages/api/src/core-bridge/exec.ts` — `VIBE_OPS` allowlist and spawn model.
- `bin/vibe-panel-run` — root-gated wrapper (the model for new `db-provision` subcommand).
- `control-panel/packages/api/src/routers/provisioning.ts` — the provisioning router (where `createSharedDb` is added).
- `control-panel/packages/api/src/core-bridge/provision.ts` — the headless bridge (unchanged; `createSharedDb` uses the same pattern).
- `bin/backup` — per-site backup logic (shows external-mode dump path via WP-CLI).
- MariaDB documentation: `GRANT` statement, `CREATE USER`, `max_user_connections`, `WITH MAX_USER_CONNECTIONS`.
- OWASP Multi-tenant Application Security Testing Guide: least-privilege per tenant.
- Docker documentation: bridge networks, `external: true` network references.
