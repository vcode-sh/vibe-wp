# control-panel

Vibe WP Control Panel is the web operations surface for Vibe WP. It is intentionally
thin: the panel calls a typed Hono/oRPC server, and the server delegates real work to
the Vibe WP headless core and `bin/vibe` workflows instead of duplicating runtime logic.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **oRPC** - End-to-end type-safe APIs with OpenAPI integration
- **Bun** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **SQLite** - Local control-plane metadata
- **Authentication** - Better Auth
- **Biome** - Linting and formatting
- **Tauri** - Future desktop shell
- **Turborepo** - Optimized monorepo build system

## Backend wiring (per-VPS)

The control-panel server delegates all real work through a typed **exec layer** rather than re-implementing host logic.

### Exec-layer chokepoint (`packages/api/src/core-bridge/`)

`exec.ts` is the **only** module that spawns host processes. It maintains an explicit `VIBE_OPS` allowlist for site health, lifecycle, backup/restore, staging, logs, settings, security, performance, inventory, plugin/theme, and WordPress-user operations. It always passes an argv array — never a shell-interpolated string. Every byte of captured output passes through `redact.ts` before it is stored, logged, or sent to a client.

- `runVibe(siteDir, env, op)` — runs one `<siteDir>/bin/vibe <env> <op>` call and returns buffered stdout/stderr (redacted, with a configurable timeout).
- `streamVibe(siteDir, env, op)` — returns a live `AsyncIterable<string>` of redacted output lines for long-running ops (used by the backup job).

### Sites, backups, and operations over `bin/vibe`

`sites.ts` scans the colon-separated `PANEL_SITES_ROOTS` env var (default `/opt:/srv`) for Vibe WP install directories, reading each site's `env/prod.env` to extract the domain and staging presence.

oRPC procedures in `packages/api/src/routers/` expose this over the typed contract:

| Procedure | Auth | What it does |
|---|---|---|
| `sitesList` | viewer | Detect all sites + run `smoke` per site |
| `siteOverview` | viewer | Run `smoke` for one site, return verdict + tiles |
| `backupsList` | viewer | Run `backups`, parse paths into `BackupRecord[]` |
| `backupsRun` | operator | Start an async backup job, return `jobId` |
| `operationsStream` | viewer | Subscribe to a running job's redacted output via oRPC event iterator (SSE) |

Long-running jobs are managed by `jobs.ts` (in-memory registry backed by a `jobs` DB table); `line-stream.ts` is a broadcast buffer that replays buffered lines to late subscribers then follows live.

### better-auth roles

Three roles are defined via the admin plugin + access control: `viewer` (read sites/server), `operator` (read + run backups/operations), `admin` (full site/server/team management). The first user to register is automatically promoted to `admin` via a DB hook. Sign-in is rate-limited (5 attempts per 10 s window).

### Installing on a VPS (`bin/panel install`)

`bin/panel` is a POSIX sh script at the repo root that deploys the control panel host-natively:

```sh
./bin/panel install --domain panel.yourdomain.com --admin-email you@example.com
```

It: installs Bun if absent, builds `control-panel/`, writes `server/.env` with a generated secret, applies the DB schema, creates a least-privilege `vibe-panel` system user that reaches the host **only** through the root-owned, sudoers-gated `bin/vibe-panel-run` wrapper (a fixed op/arg allowlist — never broad host access), runs the `vibe-wp-panel.service` systemd unit **as `vibe-panel`**, drops a Caddy snippet so the panel is served over HTTPS, and bootstraps the owner account. After install, `bin/panel status` and `bin/panel uninstall [--purge]` are available.

No domain? `--access magic-dns` (default when no `--domain`) serves the panel over a real Let's Encrypt cert on `panel.<ip-dashed>.sslip.io`; `--access ip-port` falls back to `https://<ip>:8443` (self-signed). On a bare VPS, the installer's "Set up your control panel" flow installs Docker/Caddy/Bun and runs this for you (`curl -fsSL https://wp.vcode.sh/install.sh | sh`).

For break-glass account recovery on the VPS, reset a panel user's password over
SSH instead of using email delivery:

```sh
./bin/panel reset-password --email you@example.com
```

The command prompts for the new password without echoing it, asks for explicit
confirmation, updates the local Better Auth credential account, and revokes that
user's existing sessions. For automation, pipe the secret on stdin:

```sh
printf '%s\n' "$NEW_PANEL_PASSWORD" | ./bin/panel reset-password --email you@example.com --password-stdin --yes
```

Real-VPS bootstrap validation was completed on 2026-06-23: magic-DNS install with a real Let's Encrypt cert, off-root `vibe-panel` service, owner sign-in + session, host ops through the wrapper, and site detection. A 2026-06-26 VPS pass additionally covered panel install, break-glass password reset, support-bundle generation through the wrapper with no secret leak, clean update, failed-update rollback, production+staging site install, staging refresh, safe push-to-live, and authenticated browser GUI/realtime proof for the staging publish flow; see `docs/superpowers/ROADMAP.md` for the current status.

## Getting Started

First, install the dependencies:

```bash
bun install
```

## Database Setup

This project uses SQLite with Drizzle ORM.

1. Start the local SQLite database (optional):

```bash
bun run db:local
```

2. Copy `server/.env.example` to `server/.env` and update secrets if needed.
   Local SQLite URLs are resolved from the `server` directory, so `file:../local.db`
   points at `control-panel/local.db`.

3. Apply the schema to your database:

```bash
bun run db:push
```

Then, run the development server:

```bash
bun run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@control-panel/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `web`.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `web/Dockerfile` and `server/Dockerfile`)
- Build images: bun run docker:build
- Start: bun run docker:up
- Logs: bun run docker:logs
- Stop: bun run docker:down

Environment variables are read from each app's `.env` file (baked into web builds for public variables) and overridden in `docker-compose.yml` for container networking.

## Git Hooks and Formatting

- Run checks: `bun run check`

## Project Structure

```
control-panel/
├── web/             # Frontend application (React + TanStack Router)
├── server/          # Backend API (Hono, ORPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # Typed API procedures over the control core
│   ├── auth/        # Authentication configuration & logic
│   └── db/          # Database schema & queries
```

## Available Scripts

- `bun run dev`: Start all applications in development mode
- `bun run build`: Build all applications
- `bun run dev:web`: Start only the web application
- `bun run dev:server`: Start only the server
- `bun run check-types`: Check TypeScript types across all apps
- `bun run db:push`: Push schema changes to database
- `bun run db:generate`: Generate database client/types
- `bun run db:migrate`: Run database migrations
- `bun run db:studio`: Open database studio UI
- `bun run db:local`: Start the local SQLite database
- `bun run check`: Run Biome formatting and linting
- `cd web && bun run desktop:dev`: Start Tauri desktop app in development
- `cd web && bun run desktop:build`: Build Tauri desktop app
- `bun run docker:build`: Build the Docker Compose images
- `bun run docker:up`: Build and start the Docker Compose stack
- `bun run docker:logs`: Tail logs from the Docker Compose stack
- `bun run docker:down`: Stop the Docker Compose stack
