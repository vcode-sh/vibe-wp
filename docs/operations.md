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
```

This writes:

```text
backups/<timestamp>/database.sql.gz
backups/<timestamp>/wp-content.tar.gz
backups/<timestamp>/manifest.txt
```

The backup command uses `mariadb-dump --single-transaction --routines --triggers`.

## Restore

Restore requires an explicit `--yes` because it replaces the current database and `wp-content`.

```sh
make restore BACKUP=backups/20260618T195728Z ARGS="--yes"
```

With URL migration:

```sh
make restore BACKUP=backups/20260618T195728Z ARGS="--yes --old-url https://old.example.com --new-url https://new.example.com"
```

## Runtime Checks

```sh
make doctor-runtime
make smoke
```

`doctor-runtime` checks service health, WordPress installation, Redis Object Cache, filesystem constants, and writable content surfaces.

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

Review plugin compatibility before changing `WORDPRESS_IMAGE` to a newer PHP line.

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
