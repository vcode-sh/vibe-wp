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

The backup command dumps the database and archives `wp-content` from the running WordPress container. This works for both local bind mounts and production/staging named volumes.

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
