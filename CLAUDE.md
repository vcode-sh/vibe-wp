# CLAUDE.md

This file provides guidance when working with code in this repository.

## What this is

`vibe-wp` is a production-shaped WordPress Docker template (WordPress 7.0+ / PHP-FPM, Nginx with FastCGI page cache, MariaDB LTS, Redis 8 object cache) plus a guided TypeScript TUI installer (`installer/`). Almost everything is configured through `.env`, not by editing container files — custom Docker images render their config from environment variables at container start.

## Two codebases, two toolchains

- **Root stack** — shell scripts (`bin/`), Docker images (`docker/`), and Compose files (`compose*.yaml`), driven by `make` and `bin/vibe`. POSIX `sh`, no Node.
- **`installer/`** — a Bun + React + OpenTUI terminal installer. Has its own `package.json`, Biome config, and quality gate. When working inside `installer/`, follow `docs/project-rules.md`.

## Common commands

### Stack (root)
```sh
make init            # generate .env with local secrets (./bin/init-env)
make up              # build + start full stack
make install         # install WP, baseline plugins, AI connectors, enable Redis cache, remove defaults
make doctor          # check host prerequisites + Compose config
make doctor-runtime  # check running WP/DB/Redis/cache/permissions
make smoke           # end-to-end runtime smoke tests
make wp ARGS="plugin list"   # WP-CLI inside the WordPress runtime image
make backup
make restore BACKUP=backups/local/<timestamp> ARGS="--yes"
make down / make clean       # stop / stop + drop volumes
```

`make` targets default to `ENV=local`. Override per-call: `make up ENV=stage`. The underlying multi-environment entrypoint is `./bin/vibe <local|stage|prod|external> <command>` — `make` is a thin wrapper over it.

### Installer (`cd installer/`)
```sh
bun run dev          # run the TUI
bun run quality      # check:loc + typecheck + lint + test — run before considering installer changes complete
bun test             # tests only (bun's built-in runner)
bun run lint:fix     # Biome autofix
bun run dry-run      # run installer without host changes
```
Run a single test: `bun test src/core/validation.test.ts` (or `-t "<name>"` to filter).

## Architecture

### Stack service graph
`Browser → nginx:8080 → wordpress:9000 (PHP-FPM) → db:3306 (MariaDB) + redis:6379`. Supporting services: `cron` (runs `wp cron event run --due-now` on an interval instead of request-triggered WP-Cron), `wp` (on-demand WP-CLI sharing the WordPress image/env/mounts), and `adminer` (optional `tools` Compose profile).

Key invariants when changing the stack:
- **Config is rendered from env, not baked in.** Each custom image (`docker/{wordpress,mariadb,redis,nginx}/`) has an `entrypoint.sh` that renders a `*.template` into the real config from environment variables. To add a tunable, thread it through the `.env*` examples → Compose env → the template, not by hardcoding in the image.
- **Content is a host mount.** `content/` mounts to `/var/www/html/wp-content`. The WordPress image seeds defaults with `rsync --ignore-existing`, so first boot is valid without clobbering user files. Custom code belongs in `content/{themes,plugins,mu-plugins}`; WordPress core stays image-managed (managed-WordPress model).
- **MU plugins are duplicated.** `content/mu-plugins/vibe-wp-*.php` and `docker/wordpress/mu-plugins/vibe-wp-*.php` mirror each other (the latter is the image seed). Edit both when changing one.
- **Nginx FastCGI cache deliberately skips** authenticated users, wp-admin, login, REST, query-strings, no-cache requests, WooCommerce cart/checkout/account, and authorization-header requests. See `docs/architecture.md` and `docs/web-tier.md`.

### Environments
`bin/vibe` selects an env by layering Compose files and an env file: `compose.yaml` is the base; `compose.stage.yaml`, `compose.prod.yaml`, and `compose.external.yaml` are overrides (external = bring-your-own MariaDB/Redis). Per-env values live in `env/{stage,prod,external}.env`. Shared logic is in `bin/lib/vibe.sh`. Staging supports `refresh-from-prod` and `promote-files-to-prod` workflows — see `docs/staging.md`.

### Installer
Bun executable (`bun build --compile`) targeting a `curl | sh` one-liner. Structure (`installer/src/`):
- `core/` — all business logic: planning (`install-plan.ts`), shell execution (`shell.ts`, `task-runner.ts`), `env-writer.ts`, `caddyfile.ts`, `secrets.ts`, `redaction.ts`, `validation.ts`, `host.ts`.
- `screens/`, `components/`, `app/` — React/OpenTUI presentation. Keep these mostly presentational.

Installer rules (`docs/project-rules.md`, `AGENTS.md`):
- TypeScript/TSX files stay **≤220 lines** (enforced by `check:loc` in the quality gate). Split into narrow modules rather than growing monoliths.
- Business logic goes in `core/`; **never run shell commands directly from screen components** — go through the centralized executors.
- All host-changing actions stay behind an explicit review step or a headless `--yes` flag.
- **Never print secrets.** Use `redaction.ts` for logs, previews, support bundles, and dry-run output.
- Prefer type-only imports; isolate any unavoidable `any` near the external boundary.

## Repo conventions

- English for all code, docs, comments, commit messages, and UI copy.
- Multiple agents may work here concurrently — don't edit unrelated files or revert work you didn't create (`AGENTS.md`). Prefer focused, operationally verifiable changes.
- Secrets live only in untracked `.env` / `env/*.env` (generated by `bin/init-env`); `*.example` files are the tracked templates. `.env*` files print DB/Redis passwords, WP salts, and the local admin password.
