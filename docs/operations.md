# Operations

## Start

```sh
make init
make up
make install
```

## WP-CLI

```sh
make wp ARGS="core version"
make wp ARGS="plugin list"
make wp ARGS="theme list"
./bin/wp option get home
./bin/wp redis status
./bin/vibe stage wp plugin list
./bin/vibe prod wp redis status
```

Direct form:

```sh
./bin/wp plugin list
```

The wrapper uses the Compose `wp` service, so it does not use or require a host-installed `wp` binary.

WP-CLI commands execute as `www-data`, the same user that owns writable WordPress content. This avoids root-owned files after plugin installs, theme installs, imports, and media operations.

More examples are in [wp-cli.md](wp-cli.md).

## Enable Redis Object Cache

`make install` already installs and enables Redis Object Cache. To run it again:

```sh
make cache-enable
```

Verify:

```sh
make wp ARGS="redis status"
```

## Logs

```sh
make logs
docker compose logs -f nginx
docker compose logs -f wordpress
docker compose logs -f db
docker compose logs -f redis
```

`bin/vibe` exposes two log commands per environment:

```sh
./bin/vibe prod logs          # follow logs (-f), streams until interrupted
./bin/vibe prod logs-recent   # one-shot, prints the last ~200 lines and returns
```

Use `logs` for live tailing. Use `logs-recent` in non-interactive contexts (scripts, the installer Manage dashboard) where a following stream would hang forever; it prints the latest lines without `-f` and exits.

## Adminer

```sh
make tools
```

Then open:

```text
http://localhost:8081
```

Use:

- server: `db`
- username: value of `MARIADB_USER`
- password: value of `MARIADB_PASSWORD`
- database: value of `MARIADB_DATABASE`

## Backups

Create a backup:

```sh
make backup
./bin/vibe prod backup
./bin/vibe stage backup
```

This writes:

```text
backups/<environment>/<timestamp>/database.sql.gz
backups/<environment>/<timestamp>/wp-content.tar.gz
backups/<environment>/<timestamp>/manifest.txt
```

The backup command dumps the database and archives `wp-content` from the running WordPress container. This works for both local bind mounts and production/staging named volumes. Add `--label NAME` to suffix the directory (`<timestamp>-<label>/`).

### Off-server copy to Cloudflare R2

When `VIBE_BACKUP_R2_ENABLED=1`, each backup is also uploaded to S3-compatible object storage (Cloudflare R2 by default) via [rclone](https://rclone.org), then verified with `rclone check` so a corrupt or partial upload fails loudly. rclone is configured entirely from `RCLONE_CONFIG_R2_*` environment variables loaded from the env file, so no separate rclone config file ever holds the secrets. The R2 endpoint follows the form `https://<account-id>.r2.cloudflarestorage.com`.

rclone must be installed on the host for off-server backups. Install it with:

```sh
curl https://rclone.org/install.sh | sudo bash
```

### Retention

After every backup, both local and remote backups beyond `VIBE_BACKUP_RETENTION` are pruned, keeping only the newest N. Leave `VIBE_BACKUP_RETENTION` empty to keep all backups.

### Environment keys

These keys live in `env/<env>.env` (templates in `env/*.env.example`):

| Key | Purpose |
| --- | --- |
| `VIBE_BACKUP_DIR` | Local backup root (default `backups/<env>/` when empty) |
| `VIBE_BACKUP_RETENTION` | Keep only the newest N backups locally and remotely (empty = keep all) |
| `VIBE_BACKUP_R2_ENABLED` | Set to `1` to also upload each backup to object storage |
| `VIBE_BACKUP_R2_BUCKET` | Target bucket name (e.g. `your-bucket`) |
| `VIBE_BACKUP_R2_PREFIX` | Path prefix inside the bucket (default: the env name) |
| `RCLONE_CONFIG_R2_TYPE` | rclone backend type (`s3`) |
| `RCLONE_CONFIG_R2_PROVIDER` | S3 provider (`Cloudflare`) |
| `RCLONE_CONFIG_R2_ACCESS_KEY_ID` | R2 access key ID |
| `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `RCLONE_CONFIG_R2_ENDPOINT` | `https://your-account-id.r2.cloudflarestorage.com` |
| `RCLONE_CONFIG_R2_ACL` | Object ACL (`private`) |
| `RCLONE_CONFIG_R2_NO_CHECK_BUCKET` | `true` to skip a bucket-create check on upload |

List existing backup directories for an environment (newest last, one per line):

```sh
./bin/vibe prod backups
./bin/vibe stage backups
```

Verify a backup before relying on it:

```sh
make backup-verify BACKUP=backups/local/20260618T195728Z
./bin/vibe prod backup-verify backups/prod/20260618T195728Z
```

The verifier is read-only for the current environment. It validates `manifest.txt`, checks the declared database and `wp-content` files, tests compressed SQL, inspects the SQL dump shape, lists the `wp-content` tarball, and rejects unsafe archive paths.

For a deeper non-mutating check, add `--deep`:

```sh
./bin/backup-verify backups/local/20260618T195728Z --deep
```

`--deep` decompresses the database and extracts `wp-content` into a temporary directory only. It does not import the database, start services, replace volumes, or modify the running local, staging, or production environment.

## Restore

Restore requires an explicit `--yes` because it replaces the current database and `wp-content`.

```sh
make restore BACKUP=backups/local/20260618T195728Z ARGS="--yes"
./bin/vibe stage restore backups/prod/20260618T195728Z --yes --old-url https://example.com --new-url https://stage.example.com --staging
```

With URL migration:

```sh
make restore BACKUP=backups/local/20260618T195728Z ARGS="--yes --old-url https://old.example.com --new-url https://new.example.com"
```

If the named backup directory is not present locally and off-server backups are enabled (`VIBE_BACKUP_R2_ENABLED=1`), restore first fetches it from R2 by name, then restores the database and `wp-content` as usual.

`./bin/vibe <env> backups-remote` lists the off-server (R2) backups as restorable paths. The installer's Manage dashboard "Restore a backup" picker merges these with the local backups, so you can restore an off-server backup even after local copies have been pruned — restore fetches it from R2 automatically.

## Staging

Refresh staging from production:

```sh
./bin/vibe stage refresh-from-prod --yes
```

Promote managed plugin/theme files from staging to production:

```sh
./bin/vibe stage promote-files-to-prod
```

The interactive command prints staging and production identity, plugin and theme inventories, and production-to-staging diffs. To continue, type the exact confirmation shown by the command, for example:

```text
PROMOTE stage TO prod
```

Use `--yes` only after reviewing the preflight or from automation:

```sh
./bin/vibe stage promote-files-to-prod --yes
```

This promotes `plugins`, `themes`, and `mu-plugins` only. It does not promote uploads or the database. The command refuses identical staging/production `WP_HOME` or `COMPOSE_PROJECT_NAME` values, creates and verifies a production safety backup before replacing files, restarts PHP-FPM/Nginx, flushes caches, and runs the production smoke test.

## Runtime Checks

```sh
make doctor-runtime
make perf-report
make smoke
```

`doctor-runtime` checks service health, WordPress installation, baseline plugins, unwanted bundled plugin/theme cleanup, Redis Object Cache, REST self-requests, loopback requests, filesystem constants, and writable content surfaces.

`perf-report` prints a non-mutating performance snapshot for OPcache, Redis, MariaDB, PHP-FPM memory, Nginx FastCGI cache, and WordPress plugin/theme baseline state. It skips missing services instead of failing, which is useful for `external` mode where MariaDB or Redis may be managed outside this Compose project. The HTTP cache check sends anonymous GET requests and does not purge or flush caches.

`smoke` additionally verifies HTTP 200, FastCGI cache HIT, future upload year/month folder creation, and upload file ownership.

## Health monitoring & alerts

Run a one-shot set of health checks against the running stack for an environment:

```sh
./bin/vibe prod monitor
./bin/vibe prod monitor --quiet
./bin/vibe stage monitor
```

Each check prints `ok:` / `warn:` / `fail:`. The command exits non-zero when any check **fails** (so a systemd service marks the unit failed); warnings alone still exit `0`. `--quiet` suppresses the per-check lines (used by the scheduled timer). The checks are:

1. **HTTP uptime** — `WP_HOME` answers with an HTTP status `< 400`.
2. **Disk space** — the backup-root filesystem and `/` have headroom (warn at the threshold, fail at `>= 95%`).
3. **TLS certificate** — the production domain certificate is not near expiry.
4. **Backup freshness** — a recent backup directory exists under the backup root.
5. **Container health** — the expected services (`wordpress`, `nginx`, and `db`/`redis` when defined) are running.

### Alerts

When alert channels are configured, `monitor` sends an alert on any **failure** (or also on **warnings** when `VIBE_MONITOR_ALERT_ON_WARN=1`). Each sender is a no-op until its required keys are set, and tokens are only ever passed to `curl` — never printed:

- **Telegram** — `VIBE_MONITOR_TELEGRAM_TOKEN` + `VIBE_MONITOR_TELEGRAM_CHAT_ID`.
- **Webhook** — `VIBE_MONITOR_WEBHOOK_URL` (JSON `POST` with `env`, `status`, `summary`, `details`).
- **Email** — `VIBE_MONITOR_EMAIL_TO` (uses the `mail` command when present; otherwise skipped).

### Configuration keys

These keys live in `env/<env>.env` (templates in `env/*.env.example`):

| Key | Purpose | Default |
| --- | --- | --- |
| `VIBE_MONITOR_DISK_WARN_PCT` | Warn when a filesystem reaches this % used (fail at `>= 95`) | `85` |
| `VIBE_MONITOR_CERT_WARN_DAYS` | Warn when the TLS certificate expires within N days | `14` |
| `VIBE_MONITOR_BACKUP_MAX_AGE_HOURS` | Warn when the newest backup is older than N hours | `26` |
| `VIBE_MONITOR_ALERT_ON_WARN` | Set to `1` to alert on warnings, not just failures | `0` |
| `VIBE_MONITOR_TELEGRAM_TOKEN` | Telegram bot token (never printed) | empty |
| `VIBE_MONITOR_TELEGRAM_CHAT_ID` | Telegram chat id | empty |
| `VIBE_MONITOR_WEBHOOK_URL` | Generic JSON webhook URL | empty |
| `VIBE_MONITOR_EMAIL_TO` | Alert recipient address | empty |

### Hourly timer

The installer schedules monitoring by default: it installs a systemd service + timer named `vibe-wp-monitor-<slug>-<env>` whose service runs `./bin/vibe <env> monitor --quiet` on an `OnCalendar=hourly`, `Persistent=true` schedule. Inspect or run it manually with:

```sh
systemctl status vibe-wp-monitor-<slug>-<env>.timer
systemctl start  vibe-wp-monitor-<slug>-<env>.service
journalctl -u vibe-wp-monitor-<slug>-<env>.service
```

The installer Manage dashboard also exposes monitoring on demand via the **Health check & alerts** action. See [installer.md](installer.md).

## Server hardening

Apply idempotent host-level baseline hardening for the Ubuntu VPS that runs the stack:

```sh
./bin/vibe prod harden
./bin/harden                 # equivalent; host-level, not per-env
./bin/harden --dry-run       # preview without changing anything
```

`harden` is safe to run repeatedly — each step detects already-applied state and skips it. It applies:

1. **Firewall (`ufw`)** — default deny incoming / allow outgoing, then allows SSH (the `OpenSSH` profile or port `22`) **before** enabling so you are never locked out, allows `80/tcp` and `443/tcp`, then enables `ufw`.
2. **fail2ban** — installs, enables and starts it, and writes a minimal `sshd` jail at `/etc/fail2ban/jail.d/vibe-wp.local`.
3. **Automatic security updates** — installs `unattended-upgrades` and writes `/etc/apt/apt.conf.d/20auto-upgrades`.
4. **Kernel/network `sysctl` basics** — writes `/etc/sysctl.d/99-vibe-wp.conf` (`rp_filter`, `tcp_syncookies`) and applies it.

Flags:

- `--dry-run` — print what would be done without changing anything.
- `--ssh-key-only` — **DANGEROUS, off by default.** Also disables SSH password authentication and sets `PermitRootLogin prohibit-password` via `/etc/ssh/sshd_config.d/99-vibe-wp.conf`, validating the config with `sshd -t` before reloading. Key-based SSH **must already work** for your user or root, or you can lock yourself out of the server with no remote recovery.
- `-h`, `--help` — show usage.

The guided installer runs hardening as the **final** install step (secure by default). The Manage dashboard exposes it via the **Secure the server** action. See [installer.md](installer.md).

## Update Images

Pull and rebuild:

```sh
docker compose pull
docker compose build --pull
docker compose up -d
```

Then run:

```sh
make wp ARGS="core version"
make wp ARGS="plugin update --all"
make wp ARGS="theme update --all"
```

In managed WordPress mode, update plugins and themes through wp-admin or WP-CLI. Upgrade WordPress core by changing `WORDPRESS_IMAGE`, rebuilding, and running smoke tests. Review plugin compatibility before changing `WORDPRESS_IMAGE` to a newer PHP line.

After changing the WordPress image, run the installer once so baseline plugins and default-content cleanup are reconciled:

```sh
make install
make smoke
```

## Clear Caches

Flush Redis object cache:

```sh
make cache-flush
```

Clear Nginx FastCGI cache:

```sh
docker compose down
docker volume rm vibe-wp_nginx_cache
docker compose up -d
```

If `COMPOSE_PROJECT_NAME` is changed, adjust the volume name.

## Installer Manage Dashboard

The guided installer's Manage screen (`manage-existing` mode) is a friendly front end for the same `bin/vibe` commands documented here. It runs them against the selected site directory and never bypasses the scripts. Its operations map to:

| Dashboard action | `bin/vibe` command |
| --- | --- |
| Check it's healthy | `smoke` |
| Health check & alerts | `monitor` |
| Secure the server | `harden` |
| Speed report | `perf-report` |
| What's running | `ps` |
| Check the server itself | `doctor-runtime` |
| Recent logs | `logs-recent` |
| Double-check your settings | `config` |
| Back up now | `backup` |
| Clear the cache | `cache-flush` |
| Restart the site | `restart` |
| Copy live to staging | `refresh-from-prod` |
| Publish staging to live | `promote-files-to-prod` |
| Restore a backup | `restore` |
| Stop the site | `down` |

Staging actions appear only when the selected site has staging configured. See [installer.md](installer.md).

## Installer Retry Safety

Two installer behaviors make repeated runs against the same host safe:

- Env-file writes are idempotent. Re-running an install reconciles the env files instead of duplicating or corrupting keys.
- Install secrets (DB and Redis passwords) are preserved on retry. Regenerating them would desync from the credentials already baked into the persisted Docker volumes, so existing secrets are read back and kept.
