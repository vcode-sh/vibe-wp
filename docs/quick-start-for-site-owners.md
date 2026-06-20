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

### Before you start

You need two things ready:

1. A VPS you can log in to as `root` (a fresh Ubuntu or Debian server is ideal).
2. A domain name whose DNS already points to your VPS IP address. Create an `A` record for your domain (for example `your-domain.com`) pointing at the server IP (for example `203.0.113.10`). HTTPS certificates can only be issued once DNS points at the server.

If you also want a `www.your-domain.com` alias, point that at the same IP too.

### Recommended guided path

Log in to your VPS, then run:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

This opens a guided terminal installer. It asks for your domain and admin email, lets you choose options (such as staging), and then shows you the exact list of actions before it touches the server. Nothing changes until you approve the plan.

When you choose to create a new site, the guided flow:

- installs anything missing on the server (Docker, and Caddy for HTTPS)
- creates the site's settings files with strong, generated passwords
- starts the WordPress stack (web server, database, cache)
- sets up HTTPS automatically with a free Let's Encrypt certificate
- optionally creates a staging site on a separate domain
- runs a quick health check at the end

Several sites can live on one VPS side by side. The installer keeps their ports and folders separate.

### Managing a site later

Run the same command again and choose "Manage detected site". This opens a friendly dashboard for a site already installed on the server. From it you can:

- check it's healthy, see a speed report, see what's running, check the server, view recent logs, and double-check settings
- back up now, clear the cache, and restart the site
- copy live to staging, and publish staging to live (when staging exists)
- restore a backup, or stop the site (these are clearly marked in a danger zone)

Each action explains what it does before it runs.

### Manual path

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

Each backup is saved in its own dated folder. By default they live here:

```text
backups/prod/
backups/stage/
```

You can keep backups in two places at once:

- **Locally on the VPS** — every backup goes into a folder you choose (the installer suggests one and creates it for you). Only the newest few are kept; older ones are deleted automatically so the disk does not fill up. How many to keep is up to you.
- **Off-server on Cloudflare R2** — the safest option. If you turn this on, every backup is also copied to your own Cloudflare R2 storage and checked to confirm the copy is complete. This protects you even if the whole server is lost, which a local-only backup cannot do. Old copies on R2 are pruned the same way as local ones.

The installer can also run backups for you automatically on a **daily or weekly schedule**, so you do not have to remember to run them. You set the backup folder, how many to keep, the schedule, and your R2 details during install — or with the `--backup-dir`, `--backup-schedule`, and `--r2-*` options.

When you restore (see below), if a backup is only on R2 and not on the server any more, it is fetched back from R2 for you automatically.

Even with R2 enabled, keeping a copy of truly important backups somewhere else as well is good practice. A single storage location can always fail.

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

See just the recent log lines (no live follow):

```sh
./bin/vibe prod logs-recent
```

List existing backups for a site:

```sh
./bin/vibe prod backups
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
