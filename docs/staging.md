# Staging And Managed WordPress Workflow

This template uses a managed WordPress model:

- WordPress core is image-managed through `WORDPRESS_IMAGE`.
- Plugins, themes, uploads, and MU plugins are managed in persistent `wp-content`.
- The WordPress file editor is disabled.
- Plugin and theme installs/updates are allowed.
- Production backups are mandatory before staging refreshes and file promotion.

This avoids the weakest Docker/WordPress mix: updating core inside a running container and then losing that change on the next image recreate.

## Environments

Use separate Compose project names and env files on the same VPS:

```text
env/prod.env   -> COMPOSE_PROJECT_NAME=vibe-wp-prod   -> https://example.com
env/stage.env  -> COMPOSE_PROJECT_NAME=vibe-wp-stage  -> https://stage.example.com
```

Generate env files:

```sh
make init-prod
make init-stage
```

Then edit the domains, ports, and secrets.

## Start

```sh
./bin/vibe prod up
./bin/vibe prod install
./bin/vibe prod smoke

./bin/vibe stage up
./bin/vibe stage install
./bin/vibe stage smoke
```

## Refresh Staging From Production

```sh
./bin/vibe stage refresh-from-prod --yes
```

This runs:

1. Production backup.
2. Restore into staging.
3. URL migration from production `WP_HOME` to staging `WP_HOME`.
4. `blog_public=0`.
5. Cache flush.
6. Staging smoke test.

The URL migration uses WP-CLI search-replace with serialized-data-safe mode and skips the `guid` column.

## Staging Safeguards

Staging uses:

- `WP_ENVIRONMENT_TYPE=staging`
- noindex/no-follow headers
- `robots.txt` disallow all
- `blog_public=0`
- outbound `wp_mail()` interception by default

These are enforced by `content/mu-plugins/vibe-wp-environment.php`.

Local development does not enable these staging safeguards unless you set `VIBE_WP_FORCE_NOINDEX=1` or `VIBE_WP_DISABLE_OUTBOUND_MAIL=1` explicitly.

## Promote Staging Files To Production

```sh
./bin/vibe stage promote-files-to-prod --yes
```

This copies only managed code surfaces:

- `wp-content/plugins`
- `wp-content/themes`
- `wp-content/mu-plugins`

It does not copy the database, uploads, or cache. The command creates a production backup first, restarts PHP-FPM/Nginx, flushes caches, and runs the production smoke test.

## Database Promotion

Do not push the full staging database to production as a routine workflow. A full DB restore can overwrite comments, form entries, orders, users, passwords, plugin runtime settings, and editorial changes made after the staging refresh.

Use full DB promotion only during a maintenance window with a content freeze:

```sh
./bin/vibe prod restore backups/stage/<timestamp> --yes --old-url https://stage.example.com --new-url https://example.com
```

For normal work, promote files and make production configuration changes deliberately through wp-admin or WP-CLI.

## Backups

```sh
./bin/vibe prod backup
./bin/vibe stage backup
```

Backups are environment-scoped:

```text
backups/prod/<timestamp>/
backups/stage/<timestamp>/
```

Each backup contains:

- `database.sql.gz`
- `wp-content.tar.gz`
- `manifest.txt`

The archive is created from the running WordPress container, so it works for both bind mounts and Docker named volumes.
