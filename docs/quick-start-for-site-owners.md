# Quick Start For Site Owners

This guide is for people who want to run a WordPress site without learning Docker internals.

You only need to copy commands from the boxes below. If something fails, stop and ask a technical person before deleting files or volumes.

## What This Project Gives You

This project runs WordPress with:

- a public website
- a WordPress admin panel
- a database
- a fast cache layer
- WordPress AI plugins ready for setup
- backups
- a staging copy for testing changes before production

Think of it as a small WordPress hosting setup that lives on your VPS.

## Words Used In This Guide

Production means the real live website.

Staging means a private test copy of the live website. Use staging to test plugin updates, theme changes, and settings before touching production.

Backup means a saved copy of the database and WordPress files. Always make a backup before important changes.

Managed WordPress means you can update plugins and themes from WordPress admin, but WordPress core itself is updated by changing the Docker image.

AI connectors are the settings that connect WordPress to an AI provider such as OpenAI, Google, or Anthropic. The plugins are installed for you, but AI features need an API key before they can be used.

## Local Demo On Your Computer

Use this when you only want to try the project locally.

```sh
make init
make up
make install
```

Open:

```text
http://localhost:8080
```

Show running services:

```sh
make ps
```

Check if everything works:

```sh
make smoke
```

Stop the local site:

```sh
make down
```

## First VPS Setup

Use this when the site should run on a VPS.

Generate production settings:

```sh
make init-prod
```

Open this file and replace example values with your real domain, email, and passwords:

```text
env/prod.env
```

At minimum, change:

- `WP_HOME`
- `WP_SITEURL`
- `WP_INSTALL_ADMIN_EMAIL`
- all values that say `replace-with-generated-password`
- all values that say `replace-with-generated-secret`

Start production:

```sh
./bin/vibe prod up
./bin/vibe prod install
./bin/vibe prod smoke
```

After install, log in to WordPress admin at:

```text
https://your-domain.example/wp-admin
```

## Create Staging

Generate staging settings:

```sh
make init-stage
```

Open this file:

```text
env/stage.env
```

Set staging to a different domain, for example:

```env
WP_HOME=https://stage.example.com
WP_SITEURL=https://stage.example.com
```

Start staging:

```sh
./bin/vibe stage up
./bin/vibe stage install
./bin/vibe stage smoke
```

## Copy Production To Staging

Run this before testing plugin updates or theme changes:

```sh
./bin/vibe stage refresh-from-prod --yes
```

This does all of this automatically:

- creates a production backup
- copies production into staging
- changes the website URL to the staging URL
- blocks search engines on staging
- blocks normal outbound WordPress email on staging
- runs a smoke test

Use staging after this command finishes.

The local demo does not block search engines or email by default. Those safeguards are for staging.

## Safe Plugin And Theme Updates

Recommended workflow:

1. Refresh staging from production.
2. Log in to staging WordPress admin.
3. Update plugins or themes on staging.
4. Click around and test the site.
5. Promote staging files to production.

Refresh staging:

```sh
./bin/vibe stage refresh-from-prod --yes
```

After testing, promote plugin/theme files to production:

```sh
./bin/vibe stage promote-files-to-prod --yes
```

This copies plugins, themes, and MU plugins from staging to production. It does not copy posts, pages, orders, users, comments, or uploads.

## Backups

Create a production backup:

```sh
./bin/vibe prod backup
```

Create a staging backup:

```sh
./bin/vibe stage backup
```

Backups are stored here:

```text
backups/prod/
backups/stage/
```

Keep important backups outside the VPS too. A VPS failure can destroy local backups stored on the same machine.

Check a backup before depending on it:

```sh
./bin/vibe prod backup-verify backups/prod/<backup-folder>
```

For a deeper check that still does not touch the running site:

```sh
./bin/vibe prod backup-verify backups/prod/<backup-folder> --deep
```

## Restore

Restore is destructive. It replaces the current site data.

Production restore example:

```sh
./bin/vibe prod restore backups/prod/<backup-folder> --yes
```

Staging restore example:

```sh
./bin/vibe stage restore backups/prod/<backup-folder> --yes --old-url https://example.com --new-url https://stage.example.com --staging
```

Do not run restore on production unless you are sure you selected the correct backup.

## Daily Commands

Check production:

```sh
./bin/vibe prod ps
./bin/vibe prod smoke
./bin/vibe prod perf-report
```

Check staging:

```sh
./bin/vibe stage ps
./bin/vibe stage smoke
./bin/vibe stage perf-report
```

`perf-report` only prints diagnostic information. It does not change the website.

See logs:

```sh
./bin/vibe prod logs
```

Flush caches:

```sh
./bin/vibe prod cache-flush
```

Run a WordPress command:

```sh
./bin/vibe prod wp plugin list
```

## What Not To Do

Do not commit real `.env` files.

Do not delete Docker volumes unless you have a verified backup.

Do not push the staging database to production as a normal workflow.

Do not update WordPress core from the admin panel in production. In this template, WordPress core is updated through the Docker image.

Do not use the same Redis prefix for production and staging.

Do not use the same public domain for production and staging.

## When To Ask For Help

Ask a technical person if:

- `make smoke` or `./bin/vibe prod smoke` fails
- a restore is needed on production
- the VPS disk is almost full
- the site domain or HTTPS certificate changes
- you need to update the WordPress core image
- you need to move the site to another server
