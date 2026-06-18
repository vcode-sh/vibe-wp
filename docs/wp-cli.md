# WP-CLI

WP-CLI is a first-class part of this template. It is installed in the custom WordPress runtime image and exposed through:

```sh
./bin/wp
make wp ARGS="..."
```

Both forms run inside Docker Compose. They do not use a host-installed `wp` binary.

## Why This Shape

The `wp` service uses the same image, environment, database network, Redis network, and `content/` mount as the `wordpress` PHP-FPM service. That keeps CLI behavior aligned with runtime behavior.

The service also bootstraps the official WordPress files and `wp-config.php` before running commands, then executes WP-CLI as `www-data`. That prevents CLI-created uploads, plugins, themes, and cache drop-ins from becoming root-owned.

## Common Commands

```sh
./bin/wp core version
./bin/wp cli info
./bin/wp option get home
./bin/wp plugin list
./bin/wp theme list
./bin/wp user list
```

## Plugins And Themes

```sh
./bin/wp plugin install redis-cache --activate
./bin/wp plugin update --all
./bin/wp theme update --all
```

## Redis Object Cache

```sh
./bin/wp redis status
./bin/wp redis enable
./bin/wp cache flush
```

## Database Operations

```sh
./bin/wp db check
./bin/wp db size
./bin/wp db tables
./bin/wp db query "SHOW TABLE STATUS;"
```

Use `make backup` for a file-based database and `wp-content` backup.

## URL Migration

For a local import or domain move:

```sh
./bin/wp search-replace "https://old.example.com" "https://new.example.com" --all-tables --precise --skip-columns=guid
```

Run a dry run first when migrating production data:

```sh
./bin/wp search-replace "https://old.example.com" "https://new.example.com" --all-tables --precise --skip-columns=guid --dry-run
```

## Admin User Recovery

```sh
./bin/wp user update admin --user_pass="new-secure-password"
```

## Runtime Shell

```sh
make wp-shell
```

Inside the shell, WordPress is available at:

```text
/var/www/html
```

Run WP-CLI manually as:

```sh
wp --path=/var/www/html plugin list
```
