# Security Notes

## Secrets

Do not commit `.env`. Run:

```sh
make init
```

to generate local secrets.

For VPS environments, generate and keep these files off Git:

```sh
make init-prod
make init-stage
```

This creates:

- `env/prod.env`
- `env/stage.env`

The repository tracks only `env/*.env.example`.

The generated values include:

- MariaDB user password
- MariaDB root password
- Redis password
- WordPress salts
- local admin password

## File Editing

The default disables WordPress theme and plugin editing in the dashboard:

```env
DISALLOW_FILE_EDIT=1
```

This still allows plugin and theme installation unless `DISALLOW_FILE_MODS=1`.

## Uploads

Nginx denies PHP execution under upload/cache/upgrade-style paths. This reduces the risk of a malicious uploaded PHP file being executed through the web server.

The WordPress runtime keeps `wp-content` owned by `www-data` by default through `WP_CONTENT_FIX_PERMISSIONS=1`. New upload year/month folders are created by PHP-FPM as `www-data`, and WP-CLI commands are also dropped to `www-data` before execution.

## HTTPS

For production:

```env
WP_HOME=https://example.com
WP_SITEURL=https://example.com
FORCE_SSL_ADMIN=1
```

Enable HSTS only after HTTPS is permanently configured:

```env
NGINX_ENABLE_HSTS=1
```

## Redis

Redis is internal to the Compose network and password-protected. Do not publish port `6379` to the internet.

The custom Redis entrypoint also supports `REDIS_PASSWORD_FILE` for secret-file based deployments.

## Database

MariaDB is internal to the Compose network by default. Do not publish port `3306` unless you have a specific administrative need and network controls.
