# Recovery and Operations

Operator-facing runbooks for the Vibe WP platform. All commands run as root on the host unless stated otherwise.

---

## Shared MariaDB (vibe-wp-shared-db)

### What it is

A single `vibe-wp-shared-db` Compose project deployed to `/opt/vibe-wp-shared-db`. It runs one MariaDB container with:

- **No published port.** Access is via `docker compose exec` only. Never add a `ports:` entry.
- **Per-site least-privilege databases.** Each opted-in site gets its own `vibe_<slug>` database and `vibe_<slug>` MariaDB user, granted `ALL PRIVILEGES ON vibe_<slug>.*` and nothing else (no `*.*`, no `GRANT OPTION`, no server privileges). Sites connect over the `vibe-wp-shared-db` Docker network.
- **Root password in the env file only.** `MARIADB_ROOT_PASSWORD` lives in `/opt/vibe-wp-shared-db/env/shared-db.env` (owner `root:root`, mode `0600`). It is never passed via argv, never printed, never exported into the environment. The scripts refuse to read the file if the permissions are wrong.

**Key paths:**

| Path | Purpose |
|------|---------|
| `/opt/vibe-wp-shared-db/` | Deployed project root (`chmod 700 root:root`) |
| `/opt/vibe-wp-shared-db/compose.yaml` | Compose project file |
| `/opt/vibe-wp-shared-db/env/shared-db.env` | Runtime env file (`0600 root:root`) |
| `/opt/vibe-wp-shared-db/backups/` | Local dump archives (`chmod 700`) |

**Status check** (non-secret JSON, safe to run at any time):

```sh
bin/shared-db-status
```

The panel reaches all shared-db ops via `bin/vibe-panel-run shared-db <op> [slug]`.

---

### Backup

Run an on-demand all-databases dump (requires root):

```sh
bin/backup-shared-db
```

This writes a dated gzipped archive to `/opt/vibe-wp-shared-db/backups/shared-db-<YYYYMMDD-HHMMSS>.sql.gz` (mode `0600`). Archives older than `SHARED_DB_BACKUP_RETENTION` days (default 14) are pruned automatically. The root password is delivered to `mariadb-dump` inside the container via a randomized in-container temp file; it never appears in host or container process lists.

**Optional R2 offsite upload:** set `SHARED_DB_BACKUP_R2_PREFIX` (and the `RCLONE_CONFIG_R2_*` credentials) in `/opt/vibe-wp-shared-db/env/shared-db.env`. If `rclone` is not installed or the prefix is unset the local backup succeeds silently.

**Schedule a weekly automated backup** (installs a systemd timer):

```sh
bin/shared-db-schedule-apply          # install/refresh vibe-wp-shared-db-backup.timer
bin/shared-db-schedule-apply off      # disable and remove the timer
```

The timer uses `OnCalendar=weekly` with `Persistent=true` so a missed run catches up on the next boot.

---

### Full-server restore from an all-databases dump

Use this procedure when restoring the entire shared-db server (e.g. after data loss or VPS rebuild). For a single-site restore, restore only that site's `vibe_<slug>` database using `mysql`/`mariadb` targeted at that schema.

**Step 1 — Stop all opted-in sites** to prevent writes during import:

```sh
# For each site using the shared DB:
bin/vibe <env> down       # or docker compose -f /opt/vibe-wp/<slug>/compose.yaml down
```

**Step 2 — Ensure the shared-db container and its volume exist:**

```sh
bin/shared-db-init
```

`shared-db-init` is idempotent. If the `shared_db_data` volume already exists and the env file is present, it preserves the existing root password and just brings the container up. If the volume exists but the env file is missing, it hard-fails (SF-7) — restore the env file from a secure backup before re-running.

**Step 3 — Import the dump into the running container.**

The dump is a gzipped all-databases SQL file. Read the root password from the env file on the host, then decompress and pipe the SQL into `mariadb` inside the container using the same off-`ps` marker-split stdin pattern that the scripts use: cred section → marker → SQL, with the cred written to a randomized `umask 077` in-container temp file:

```sh
root_pw="$(grep -m1 '^MARIADB_ROOT_PASSWORD=' \
  /opt/vibe-wp-shared-db/env/shared-db.env | cut -d= -f2-)"

{
  printf '[client]\npassword=%s\n__VIBE_SQL_BEGIN__\n' "${root_pw}"
  gunzip -c /opt/vibe-wp-shared-db/backups/shared-db-<TIMESTAMP>.sql.gz
} \
  | docker compose -f /opt/vibe-wp-shared-db/compose.yaml \
      --env-file /opt/vibe-wp-shared-db/env/shared-db.env \
      exec -T db sh -c '
        umask 077; cf="$(mktemp)"
        while IFS= read -r l; do
          [ "$l" = "__VIBE_SQL_BEGIN__" ] && break
          printf "%s\n" "$l" >> "$cf"
        done
        mariadb --defaults-extra-file="$cf" -u root --batch
        rc=$?; rm -f "$cf"; exit $rc
      '

unset root_pw
```

The root password never appears in `ps` on the host or inside the container. The in-container temp file is removed before the shell exits.

**Step 4 — Re-provision per-site users if needed.**

A full `--all-databases` dump includes `mysql.*` (the grant tables), so per-site `vibe_<slug>` users and their grants are normally restored with the data. Re-run `db-provision` for a site **only** if the user grants were lost (e.g. you imported a data-only dump, or the dump predates the user being created):

```sh
bin/db-provision <slug>
# Prints the new per-site password to stdout. Update the site's env file accordingly.
```

`db-provision` is idempotent: it uses `CREATE USER IF NOT EXISTS` followed by `ALTER USER` so the printed password is always the live one, even on re-runs.

**Step 5 — Restart sites and smoke-test:**

```sh
bin/vibe <env> up -d
make smoke   # or your per-site smoke check
```

---

### Migration rollback (per-container → shared, reversible)

`bin/migrate-to-shared-db` handles the per-container-to-shared migration. During a migration the script:

1. Dumps the site's per-container database.
2. Provisions a `vibe_<slug>` DB+user on the shared server.
3. Imports the dump.
4. Verifies row counts (and checksums where feasible).
5. Swaps the site to `compose.external.yaml` pointed at the shared container.
6. Brings the site up in external mode and runs a smoke test.

**On a failed smoke test the script rolls back automatically**: the old per-container compose and env are restored and the container is restarted — no data is lost. The old per-container DB volume is tagged (not immediately deleted) and scheduled for operator prune after 7 days once the migration is confirmed healthy.

The migration script is the authoritative source of truth for the exact rollback procedure. Do not manually recreate rollback steps from this document.

---

### Root password rotation recovery

**Normal rotation** — rotate the root password, verify the old one is rejected, and confirm per-site users are unaffected:

```sh
bin/shared-db-rotate-root
```

This script:
1. Generates a new root password (`openssl rand -hex 32`).
2. Issues `ALTER USER` for every `root@*` host entry in `mysql.user`.
3. Writes the new password atomically into `/opt/vibe-wp-shared-db/env/shared-db.env` (0600).
4. Verifies the new password works (`SELECT 1;`).
5. Verifies the old password is rejected (SF-4). If the old password still works, the script dies with a security error.

Per-site `vibe_<slug>` users and their passwords are **not touched** by this script.

**Recovery when the env file and grant tables disagree** (e.g. an interrupted rotation):

If the env file holds a password that no longer matches the grant tables (or vice versa), the scripts will fail to connect. Recovery options in order of preference:

1. **If you know the correct current root password:** update `MARIADB_ROOT_PASSWORD` in the env file to the known-good value, then re-run `bin/shared-db-rotate-root` to complete the rotation cleanly.

   ```sh
   # Edit the env file — perms must stay 0600 root:root
   vi /opt/vibe-wp-shared-db/env/shared-db.env
   # Then rotate to a fresh password
   bin/shared-db-rotate-root
   ```

2. **Force-recreate the container** after correcting the env file. MariaDB reads `MARIADB_ROOT_PASSWORD` on first boot only — for an existing data volume it does not reset the root password automatically. Use `mariadb-admin` or a recovery container instead:

   ```sh
   # Stop the container
   docker compose -f /opt/vibe-wp-shared-db/compose.yaml \
     --env-file /opt/vibe-wp-shared-db/env/shared-db.env \
     down

   # Start with --skip-grant-tables (recovery mode) temporarily,
   # then reset the root password and restart normally.
   # This is a manual low-level step; prefer restoring from a backup.
   ```

3. **Worst case — restore from backup.** If the grant tables are unrecoverable, restore from the most recent `bin/backup-shared-db` archive (see [Full-server restore](#full-server-restore-from-an-all-databases-dump) above), then immediately run `bin/shared-db-rotate-root` to establish a known-good root password.

---

### Safety rules (never violate)

- Never add a `ports:` entry to `/opt/vibe-wp-shared-db/compose.yaml`. MariaDB must not be reachable from the host network.
- The env file must always be `root:root 0600`. The scripts refuse to read the root password if the file is world- or group-readable.
- Never pass the root password via command-line arguments (it appears in `ps`). Use the `--defaults-extra-file` pattern as implemented in `bin/lib/shared-db.sh`.
- Never log or print the root password or any per-site password. Use `bin/shared-db-status` for non-secret runtime info.
- Per-site users get `GRANT ALL PRIVILEGES ON vibe_<slug>.*` only — no `*.*`, no `GRANT OPTION`, no `mysql.*`, no cross-site access. This is enforced by `bin/db-provision` and is non-negotiable.
