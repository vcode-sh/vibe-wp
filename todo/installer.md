# Vibe WP Installer TUI Plan

Date: 2026-06-19
Status: installer `0.1.2` released; management pass implemented; production readiness not complete
Primary decision: OpenTUI + React + Bun

## Current Audit - 2026-06-19

The public bootstrap and release host are working, but the installer is not complete against the done definition below.

Verified on a disposable test VPS:

- `curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_NO_EXEC=1 sh` downloads and verifies installer `0.1.2`.
- `curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --dry-run` writes valid JSON when stdout is redirected.
- The bootstrap now sends status messages to stderr and routes interactive execution through `/dev/tty`, so `curl | sh` can launch the TUI from an SSH session.
- GitHub Actions `Installer CI` and `Installer Release` pass for `0.1.2`.
- Dokploy serves the generated GitHub deploy branch, not a private GHCR image.

Important fixes made during the VPS audit:

- `0.1.0` should be treated as superseded because immutable `/releases/0.1.0/...gz` URLs were overwritten during testing and could be cached with mismatched checksums.
- `0.1.1` was the first usable public installer version after bootstrap terminal handling fixes.
- `0.1.2` is the current public installer version with the management/UI pass.
- Bootstrap status output must stay on stderr so `--dry-run`, `--version`, and automation modes keep clean stdout.
- Interactive `curl | sh` must keep using `/dev/tty`; otherwise OpenTUI receives pipe stdin and exits with terminal escape noise.

Implemented in the management/UI pass after the first VPS TUI audit:

- Added a `Sites` dashboard step before host configuration.
- Detect existing Vibe WP installations under `/opt` and `/srv` by scanning for `bin/vibe` and reading `env/prod.env` / `env/stage.env`.
- Added separate create, manage, and safe-remove modes.
- Added manage mode tasks for `ps`, production smoke, performance report, and optional staging smoke.
- Added safe-remove mode tasks that create a backup, stop staging/production containers, and disable this site's Caddy snippet without deleting files or volumes.
- Switched new sites to per-site slug, per-site Compose project names, and per-site localhost ports.
- Changed Caddy handling from overwriting `/etc/caddy/Caddyfile` to installing `/etc/caddy/sites-enabled/vibe-wp-<site>.caddy` and ensuring a global import.
- Reworked navigation around `Tab` for focus and `Up`/`Down` for list/form movement.
- Replaced OpenTUI selects with clearer numbered choice cards.
- Added a neutral dark theme pass and cleaner chrome copy.
- Reworked secret fields so password/API-key entry renders masked content instead of showing the raw input value.
- Wired the interactive Execute screen to the real task runner with typed confirmation.
- Added DNS preflight as the first create/install task and blocked placeholder domains/emails such as `example.com`.

## Current Capability Matrix - 2026-06-19

### Available in `0.1.2`

- Public `curl | sh` bootstrap downloads the current manifest, verifies SHA256, and executes the Linux installer from `/dev/tty`.
- `VIBE_WP_INSTALLER_NO_EXEC=1` verifies the artifact without execution.
- `--version` and `--dry-run` work without interactive TUI noise on stdout.
- The TUI opens over SSH and no longer exits immediately after `curl | sh`.
- New-site planning supports site slugs, per-site Compose project names, per-site loopback HTTP ports, production domain, optional staging, AI keys, backup policy, and performance preset.
- Existing Vibe WP installs are detected under `/opt` and `/srv` when they expose `bin/vibe` plus env files.
- Local macOS testing is available through `--local`, with deterministic host facts, sample existing sites, sandbox paths under `installer/.vibe-local/`, and simulated task execution.
- Manage mode can plan status, production smoke, performance report, and optional staging smoke tasks.
- Safe-remove mode can plan backup, stop production/staging containers, and disable the site's Caddy snippet.
- Caddy integration is site-scoped through `/etc/caddy/sites-enabled/vibe-wp-<site>.caddy`.
- Secrets are masked in form fields and redacted in generated previews.
- Execution requires a typed confirmation phrase.

### Partially Available

- The visual system has a first neutral dark-mode pass, but the SSH result has not been accepted as 2026-quality UI.
- Choice cards are clearer than native selects, but the dashboard still needs stronger hierarchy, better grouping, and better non-technical labels.
- The task runner is real, but execution state is still in-process only and cannot be resumed after interruption.
- Safe-remove is intentionally conservative and stop-only; there is no separate full-delete flow for removing files and Docker volumes.
- DNS validation exists, but the full DNS-not-ready guidance needs better copy, retry UX, and advanced override dialog treatment.
- Management mode exists, but it is not yet a full site operations console with backups, restore, update, staging refresh, logs, and removal grouped as first-class actions.
- Headless/export modes exist, but they need the same validation and resume story as interactive installs before being recommended for production.
- Local mode proves UI navigation and plan generation, but it does not prove real Docker, Caddy, DNS, WordPress, uploads, Redis, or FastCGI behavior.

### Not Implemented

- Persistent `.vibe-installer/state.json`, `install.log`, `summary.txt`, and support bundle export.
- Resume after failed or interrupted install.
- Dialog/layer system for destructive actions, advanced overrides, failure recovery, and support bundle export.
- Full-delete mode with files, Caddy snippets, Docker volumes, and backup confirmation.
- Terminal screenshot/snapshot acceptance for wide, medium, compact, and emergency layouts.
- Real end-to-end install proof on a clean Ubuntu 26.04 VPS with a real production domain.
- Real end-to-end production-plus-staging proof with isolated domains.
- Post-install proof for WordPress Site Health REST and loopback checks.
- Post-install proof for uploads year/month directory creation.
- Post-install proof for Redis Object Cache and FastCGI cache `HIT`.

## UI/UX 2026 Upgrade Backlog

### P0 - Required Before Production Readiness

- Add persistent installer state, resumable execution, install log, and final summary under `.vibe-installer/`.
- Add a support bundle export that redacts secrets and includes host facts, selected options, command list, recent logs, Docker status, and Caddy validation output.
- Add a real dialog/layer system for destructive actions, failure recovery, support bundle export, DNS override, and quit-during-execution confirmation.
- Rework the first screen into a true site dashboard with clear actions: create site, manage detected site, safe remove, full delete when implemented, and open docs.
- Add a visual progress timeline with current task, completed tasks, skipped tasks, failed task, retry action, and log drawer.
- Run and record real SSH visual checks at wide, medium, compact, and emergency terminal sizes.
- Run and record disposable real-domain production and production-plus-staging installs.

### P1 - Required For "Wow" Quality

- Improve visual hierarchy with a calmer top bar, stronger step titles, quieter metadata, and clearer primary/secondary actions.
- Add a contextual side panel that explains the selected action in non-technical language and shows detected facts.
- Add inline field validation with exact next steps, not generic error messages.
- Add a keyboard help overlay reachable with `?`.
- Add a command palette or quick action layer for advanced users without cluttering the primary path.
- Add better empty states for "no sites detected", "DNS not ready", "Docker missing", and "Caddy conflict".
- Make management mode feel like an operations console: status, smoke, performance report, backup, restore, staging refresh, update, logs, safe remove.
- Add terminal capability fallback for 256-color and ASCII border modes.
- Add polished compact-mode layouts that still show current context, footer actions, and one focused decision.

### P2 - Later Polish

- Mouse support for selecting actions in terminals that support it.
- QR code or short URL handoff for opening the WordPress admin URL after install.
- External backup target wizard for S3/R2-compatible storage.
- Optional DNS automation for Cloudflare or another provider.
- Secret-manager mode for AI provider keys instead of storing all optional keys in env files.
- Plugin/theme bundle selection after the baseline WordPress AI plugin set is installed.

Remaining P0 implementation work:

- Add persistent installer state, resumable execution, and an install log under `.vibe-installer/`.
- Add first-class modal/dialog flows for destructive actions, support bundle export, and failure recovery.
- Decide whether safe-remove should remain stop-only or add a separate full-delete mode that removes files and Docker volumes after a stronger confirmation.
- Run and record a real production install on a disposable Ubuntu 26.04 VPS with a real domain.
- Run and record a production-plus-staging install on a disposable Ubuntu 26.04 VPS with real domains.
- Verify post-install WordPress Site Health REST and loopback, uploads year/month creation, Redis Object Cache, and FastCGI cache HIT.

Remaining P1 quality work:

- Improve the OpenTUI visual polish after another SSH run; the UI has had a first neutral dark-mode pass but has not been accepted visually.
- Add terminal-size snapshot checks for wide, medium, compact, and emergency layouts.
- Add better non-technical copy for failure states and next actions.

Safe commands today:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_NO_EXEC=1 sh
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --dry-run
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --version
```

Do not run `--headless plan.json --yes` or complete a TUI install on a real server until a real domain is configured and the generated plan has been reviewed.

## Goal

Build a polished, guided terminal installer for Vibe WP that a non-technical VPS owner can run from a single command, configure step by step, and finish with a working production WordPress site plus optional staging.

The installer must not replace the existing Vibe WP runtime model. It must generate the existing env files, run the existing `bin/vibe` workflows, install host prerequisites when approved, configure HTTPS reverse proxying, validate the result, and leave the user with clear next actions.

Target one-liner:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

The one-liner must run only a small bootstrap script. The real installer must be versioned, released, integrity-checked, and auditable.

## Verified Research

### t1code reference

- `maria-rcks/t1code` is a Bun workspace written in TypeScript and React.
- Its TUI package is published as `@maria_rcks/t1code` version `0.0.24`.
- The TUI package exposes `t1` and `t1code` binaries.
- The public run model is `bunx @maria_rcks/t1code`.
- The TUI package depends on `@opentui/core`, `@opentui/react`, `react`, `react-devtools-core`, `web-tree-sitter`, and `ws`.
- The root package declares Bun and Node engine constraints.

Evidence:

- https://github.com/maria-rcks/t1code
- https://raw.githubusercontent.com/maria-rcks/t1code/main/apps/tui/package.json
- https://raw.githubusercontent.com/maria-rcks/t1code/main/package.json
- `npm view @maria_rcks/t1code version dist-tags dependencies engines bin license repository --json`

### OpenTUI

- OpenTUI is a native terminal UI core written in Zig with TypeScript bindings.
- It provides first-class React and Solid bindings.
- It provides built-in terminal components that match this installer: `Text`, `Box`, `Input`, `Textarea`, `Select`, `TabSelect`, `ScrollBox`, `ScrollBar`, `Slider`, `Markdown`, `Code`, `Diff`, and `QR Code`.
- It includes focus and keyboard input handling.
- It uses familiar layout concepts, including Flexbox/Yoga-style layout.
- The official docs show Bun as the primary runtime for renderer examples.
- Node.js can import packages without Bun, but creating the native renderer in Node requires Node.js 26.3.0 with experimental FFI. For this project, Bun is the simpler runtime.
- OpenTUI supports standalone executable builds through `bun build --compile` when native packages are statically analyzable.
- OpenTUI standalone Linux builds need the right native package set installed before compilation. Linux glibc and musl must be handled deliberately.
- Current npm facts checked on 2026-06-19:
  - `@opentui/core` latest is `0.4.1`.
  - `@opentui/react` latest is `0.4.1`.
  - `@opentui/react` peers include React `>=19.2.0`.
  - `@opentui/core` publishes optional native packages for linux x64, linux arm64, linux x64 musl, linux arm64 musl, darwin, and win32.

Evidence:

- https://opentui.com/
- https://opentui.com/docs/getting-started/
- https://opentui.com/docs/reference/standalone-executables/
- https://opentui.com/docs/components/input/
- https://opentui.com/docs/components/select/
- https://opentui.com/docs/components/scrollbox/
- `npm view @opentui/core version dist-tags dependencies optionalDependencies engines license repository --json`
- `npm view @opentui/react version dist-tags dependencies peerDependencies optionalDependencies engines license repository --json`

### Textualize/Textual

- Textual is a Python framework for sophisticated terminal UIs and can also run apps in a web browser.
- It is MIT licensed and cross-platform.
- Textual is a strong fallback for Python-heavy teams, but it is not the primary choice for Vibe WP because the desired reference style is t1code/OpenTUI, and a fresh VPS installer should avoid Python virtualenv/pip complexity when the selected TUI can ship as a versioned executable.

Evidence:

- https://textual.textualize.io/
- https://www.textualize.io/
- https://github.com/textualize/textual

### Bun runtime

- Bun ships as a single executable and supports installation through an official script, package managers, Docker, npm, and direct downloads.
- Bun's official Linux/macOS install command is `curl -fsSL https://bun.com/install | bash`.
- Linux installation requires `unzip`.
- Bun supports direct downloads and version-specific installation.

Evidence:

- https://bun.com/docs/installation

### Docker on Ubuntu 26.04

- Docker's official Ubuntu documentation lists Ubuntu Resolute 26.04 LTS as supported.
- Docker recommends using its apt repository for installation.
- Docker documents firewall implications: published container ports can bypass `ufw`/`firewalld`, so the installer must bind WordPress only to localhost behind Caddy in production.
- Docker's convenience script is documented as not recommended for production.
- The official package set includes `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, and `docker-compose-plugin`.

Evidence:

- https://docs.docker.com/engine/install/ubuntu/

### Caddy for HTTPS

- Caddy provides official Debian/Ubuntu packages and runs as a systemd service after package install.
- Caddy's `reverse_proxy` directive supports proxying to local upstreams, transport tuning, and health checks.
- Vibe WP should keep the Docker Nginx service bound to loopback and use Caddy as the host-level HTTPS entrypoint.

Evidence:

- https://caddyserver.com/docs/install
- https://caddyserver.com/docs/caddyfile/directives/reverse_proxy

### Release integrity

- GitHub release assets expose SHA256 digests generated at upload time.
- The installer should still publish its own signed or generated `checksums.txt` because a static bootstrap can verify without depending on GitHub UI parsing.

Evidence:

- https://github.blog/changelog/2025-06-03-releases-now-expose-digests-for-release-assets/

## Product Decision

Use OpenTUI + React + Bun as the primary installer UI.

Rationale:

- It matches the t1code design direction the user explicitly referenced.
- React is a good fit for a multi-step stateful wizard.
- OpenTUI has enough native components for forms, menus, scrollable logs, reviews, progress, and diagnostics.
- Bun gives TypeScript execution and standalone binary compilation without requiring Node 26 experimental FFI on the VPS.
- The installer can still expose a non-interactive shell fallback for unsupported terminals and CI.

Non-primary options:

- Textual: technically strong, but adds Python packaging friction for the target one-command VPS flow.
- Go Bubble Tea: best simple-binary fallback, but weaker match for the requested t1code/OpenTUI visual direction.
- Plain shell: required as a fallback and for bootstrap, but not enough for the desired "wow" experience.

## User Promise

The user should be able to buy a clean Ubuntu 26.04 LTS VPS, point DNS at it, SSH in, run the one-liner, answer clear questions, and end with:

- production WordPress reachable at `https://example.com`
- optional staging reachable at `https://stage.example.com`
- automatic HTTPS through Caddy
- Docker Engine and Compose plugin installed or verified
- Vibe WP cloned or updated in `/opt/vibe-wp`
- `env/prod.env` generated with safe secrets and tuned defaults
- optional `env/stage.env` generated with isolated project names and ports
- production stack up, installed, smoke-tested, and performance-reported
- Redis Object Cache enabled
- baseline AI plugins installed and default WordPress cruft removed by existing install workflow
- backup and backup-verify workflows available
- a final summary with admin URL, generated admin password location, staging status, and next recommended command

## Non-Goals

- Do not build a hosted WordPress control panel.
- Do not create a new runtime stack parallel to `bin/vibe`.
- Do not automate DNS provider login in the first implementation.
- Do not store third-party AI API keys outside the generated env files unless a secret manager mode is added later.
- Do not open MariaDB, Redis, or Docker service ports to the public internet.
- Do not make Caddy optional for production unless the user chooses an advanced reverse-proxy mode.

## Repository Additions

Add these files and directories:

```text
installer/
  package.json
  bun.lock
  tsconfig.json
  src/
    main.tsx
    app/
      App.tsx
      theme.ts
      keymap.ts
      screens/
        WelcomeScreen.tsx
        SystemCheckScreen.tsx
        DomainScreen.tsx
        InstallModeScreen.tsx
        AdminScreen.tsx
        PerformanceScreen.tsx
        AiScreen.tsx
        BackupScreen.tsx
        StagingScreen.tsx
        ReviewScreen.tsx
        ExecuteScreen.tsx
        SuccessScreen.tsx
        ErrorScreen.tsx
    core/
      wizard-state.ts
      validation.ts
      defaults.ts
      redaction.ts
      install-plan.ts
      task-runner.ts
      command.ts
      logger.ts
      env-writer.ts
      caddyfile.ts
      dns.ts
      host.ts
      ports.ts
      secrets.ts
      repo.ts
      docker.ts
      caddy.ts
      vibe.ts
      smoke.ts
    components/
      Frame.tsx
      StepRail.tsx
      Field.tsx
      SecretField.tsx
      ChoiceList.tsx
      ToggleRow.tsx
      ProgressTimeline.tsx
      LogPane.tsx
      HelpPane.tsx
      StatusBadge.tsx
      ConfirmDanger.tsx
      SummaryTable.tsx
    cli/
      args.ts
      headless.ts
      export-plan.ts
  scripts/
    build-release.ts
    smoke-headless.ts
    smoke-terminal.ts
    generate-fixtures.ts
  fixtures/
    ubuntu-26.04-x64.json
    ubuntu-26.04-arm64.json
public-install/
  install.sh
  manifest.example.json
.github/workflows/
  installer-ci.yml
  installer-release.yml
docs/
  installer.md
```

Update existing files:

- `README.md`: add a short "guided VPS installer" section after Quick Start.
- `docs/quick-start-for-site-owners.md`: mention the guided installer as the recommended VPS path.
- `docs/deployment.md`: document the manual path and installer path side by side.
- `Makefile`: add installer targets after implementation.
- `.gitignore`: ignore installer build outputs only, not sources or locks.

Do not modify runtime Compose files unless an installer requirement exposes a real missing config.

## TUI Experience Requirements

### Visual Direction

The installer should feel like a modern deployment console, not a questionnaire printed line by line.

Design language:

- dark background with restrained contrast
- one accent color for active focus and progress
- semantic colors only for success, warning, and destructive actions
- stable three-column desktop layout when terminal width allows it
- compact two-panel layout for narrower terminals
- single-column fallback for very small terminals
- no oversized ASCII art that pushes useful content below the fold
- no decorative clutter
- crisp borders, clear focus rings, and consistent spacing
- all copy in plain English

Recommended palette:

```text
background: #0B0F14
panel:      #111827
panel2:     #16202D
text:       #E5E7EB
muted:      #94A3B8
accent:     #38BDF8
success:    #34D399
warning:    #FBBF24
danger:     #F87171
border:     #273244
```

Terminal capability fallback:

- If truecolor is unavailable, degrade to 256-color equivalents.
- If Unicode borders render poorly, switch to ASCII borders.
- If terminal height is below 24 rows, show a compact mode with a persistent footer and scrollable main pane.

### Layout

Wide layout, at least 110 columns:

```text
+-------------------+---------------------------------------+--------------------------+
| Vibe WP           | Main form or progress                 | Context help             |
| step rail         |                                       | detected facts           |
|                   |                                       | warnings                 |
+-------------------+---------------------------------------+--------------------------+
| footer: Back / Next / Run / Quit / shortcuts                                         |
+-------------------------------------------------------------------------------------+
```

Medium layout, 80-109 columns:

```text
+-------------------+---------------------------------------------------------------+
| step rail         | Main form or progress                                         |
+-------------------+---------------------------------------------------------------+
| contextual hint line                                                               |
+-----------------------------------------------------------------------------------+
```

Small layout, below 80 columns:

```text
+---------------------------------------------+
| step title                                  |
| main form or progress                       |
| scrollable details                          |
+---------------------------------------------+
| Back  Next  Help  Quit                      |
+---------------------------------------------+
```

### Controls

Use OpenTUI components deliberately:

- `Select` for install mode, performance preset, and backup policy.
- `Input` for domain, email, username, paths, and ports.
- secret input component for admin password and API keys.
- toggle rows for staging, AI keys, backups, and host prerequisite installation.
- scrollable log pane for command output.
- review table before execution.
- confirmation input for destructive or privileged actions.
- badges for detected, missing, installing, passed, failed, and skipped states.

### Keyboard Model

Required shortcuts:

- `Tab` and `Shift+Tab`: move between fields
- arrow keys or `j`/`k`: move in lists
- `Enter`: select or continue
- `Esc`: go back or close help
- `Ctrl+C`: ask for confirmation before quitting during execution
- `?`: toggle help pane
- `Ctrl+L`: toggle log pane during execution
- `Ctrl+R`: retry failed task

### Copy Rules

The UI is for non-technical users. Avoid implementation jargon in primary copy.

Good:

- "Your domain points to this VPS."
- "Staging is a private test copy."
- "Backups will be stored on this server. Keep an external copy too."

Bad:

- "A record resolution failed against recursive resolver."
- "Compose project collision detected."
- "FastCGI upstream did not pass health check."

Technical details belong in the right-side help pane and logs.

## Wizard Screens

### 1. Welcome

Purpose:

- explain what will be installed
- show that changes require confirmation
- show detected OS, user, CPU, RAM, disk, public IP, and terminal capability

Actions:

- continue
- export a dry-run plan
- quit

### 2. System Check

Checks:

- OS is Ubuntu 26.04 LTS or a supported Ubuntu fallback
- architecture is x86_64/amd64 or arm64
- user has root or sudo
- `curl`, `ca-certificates`, `gnupg`, `lsb-release` or `/etc/os-release`, `tar`, `gzip`, `unzip`, and `git` availability
- Docker Engine availability and version
- Docker Compose plugin availability
- Caddy availability and service state
- ports 80 and 443 availability
- ports 8080 and 8082 availability on loopback
- `/opt` writable or selected install path writable
- enough disk space for images, backups, and uploads
- DNS tools availability

Decisions:

- If Docker is missing, ask to install using Docker's official apt repository.
- If Caddy is missing, ask to install using Caddy's official apt repository.
- If `ufw` is enabled, show Docker firewall warning and force loopback binding for app ports.

### 3. Domain

Inputs:

- production domain
- optional `www` alias
- optional staging domain
- contact email for admin and HTTPS

Validation:

- domain syntax
- public A/AAAA records resolve to detected VPS IP
- `www` either resolves to same IP or is intentionally skipped
- staging domain resolves if staging is enabled
- Caddy can bind 80/443

If DNS is not ready:

- show exact DNS records to create
- allow recheck
- allow continue only with explicit advanced override

### 4. Install Mode

Choices:

- "New site on this VPS" default
- "Update existing Vibe WP checkout"
- "Create staging for an existing production site"
- "External MariaDB/Redis" advanced

Default path:

- clone or update Vibe WP into `/opt/vibe-wp`
- generate `env/prod.env`
- optionally generate `env/stage.env`

### 5. WordPress Admin

Inputs:

- site title
- admin username
- admin email
- generated admin password with copy/save guidance
- locale

Rules:

- generate a strong password by default
- warn if username is `admin`, but allow it because WordPress users may expect it
- write credentials only to env files and final local summary, never to logs
- redact secrets in every execution log

### 6. Performance Preset

Inputs:

- detected RAM and CPU
- expected site type: blog, business site, WooCommerce, media-heavy
- performance preset: conservative, balanced, high-memory

Outputs:

- `WP_MEMORY_LIMIT`
- `WP_MAX_MEMORY_LIMIT`
- `PHP_MEMORY_LIMIT`
- `PHP_FPM_PM_MAX_CHILDREN`
- `PHP_FPM_PM_START_SERVERS`
- `PHP_FPM_PM_MIN_SPARE_SERVERS`
- `PHP_FPM_PM_MAX_SPARE_SERVERS`
- `REDIS_MAXMEMORY`
- `REDIS_IO_THREADS`
- `MARIADB_INNODB_BUFFER_POOL_SIZE`
- `MARIADB_MAX_CONNECTIONS`
- `NGINX_FASTCGI_CACHE_MAX_SIZE`

Initial deterministic presets:

```text
1 GB RAM:
  PHP_MEMORY_LIMIT=192M
  WP_MEMORY_LIMIT=192M
  WP_MAX_MEMORY_LIMIT=256M
  PHP_FPM_PM_MAX_CHILDREN=6
  REDIS_MAXMEMORY=128mb
  MARIADB_INNODB_BUFFER_POOL_SIZE=192M
  NGINX_FASTCGI_CACHE_MAX_SIZE=512m

2 GB RAM:
  PHP_MEMORY_LIMIT=256M
  WP_MEMORY_LIMIT=256M
  WP_MAX_MEMORY_LIMIT=512M
  PHP_FPM_PM_MAX_CHILDREN=12
  REDIS_MAXMEMORY=256mb
  MARIADB_INNODB_BUFFER_POOL_SIZE=512M
  NGINX_FASTCGI_CACHE_MAX_SIZE=1g

4 GB RAM:
  PHP_MEMORY_LIMIT=384M
  WP_MEMORY_LIMIT=256M
  WP_MAX_MEMORY_LIMIT=768M
  PHP_FPM_PM_MAX_CHILDREN=24
  REDIS_MAXMEMORY=512mb
  MARIADB_INNODB_BUFFER_POOL_SIZE=1G
  NGINX_FASTCGI_CACHE_MAX_SIZE=2g

8 GB RAM:
  PHP_MEMORY_LIMIT=512M
  WP_MEMORY_LIMIT=256M
  WP_MAX_MEMORY_LIMIT=1G
  PHP_FPM_PM_MAX_CHILDREN=40
  REDIS_MAXMEMORY=1gb
  MARIADB_INNODB_BUFFER_POOL_SIZE=2G
  NGINX_FASTCGI_CACHE_MAX_SIZE=4g
```

These are installer presets, not hidden magic. Show the user a plain label and write exact env values to the review screen.

### 7. AI Plugins

Default:

- keep Vibe WP's baseline AI plugins enabled
- ask whether to add provider API keys now

Inputs:

- OpenAI API key
- Google API key
- Anthropic API key

Rules:

- all keys optional
- redact values
- do not validate keys by making provider API calls in the default flow
- show that the plugins work only after a valid provider key is configured

### 8. Backups

Choices:

- local-only backups under `backups/prod`
- local backups plus reminder to copy off-server
- advanced external backup hook, placeholder for future S3/R2 target

Required first implementation:

- schedule guidance only, unless a systemd timer is implemented in the same phase
- expose `./bin/vibe prod backup`
- expose `./bin/vibe prod backup-verify`
- create first backup after install only if the user chooses it

### 9. Staging

Default:

- recommend staging for non-technical users

Inputs:

- staging domain
- staging enable toggle

Generated staging defaults:

- `COMPOSE_PROJECT_NAME=vibe-wp-stage`
- `HTTP_PORT=127.0.0.1:8082`
- `WP_ENVIRONMENT_TYPE=staging`
- `VIBE_WP_FORCE_NOINDEX=1`
- `VIBE_WP_DISABLE_OUTBOUND_MAIL=1`
- `NGINX_ENABLE_HSTS=0`
- unique Redis prefix and cache salt

Actions:

- install staging fresh
- optionally refresh staging from production after production install

### 10. Review

Show:

- domain and staging domain
- install path
- host packages to install
- ports and public exposure model
- generated env files
- Docker/Caddy changes
- selected performance preset and exact generated values
- AI plugin/key status
- backup choice
- commands that will run

Require typed confirmation:

```text
INSTALL VIBE WP
```

### 11. Execute

Show:

- progress timeline
- current command
- elapsed time
- latest output summary
- expandable full log
- retry action for safe failed steps

Task order:

1. install missing host prerequisites
2. install Docker from official apt repository if approved
3. install Caddy from official apt repository if approved
4. clone or update Vibe WP checkout
5. generate production env with secrets
6. generate staging env if enabled
7. render Caddyfile
8. validate Caddy config
9. reload Caddy
10. run `./bin/vibe prod config`
11. run `./bin/vibe prod up`
12. run `./bin/vibe prod install`
13. run `./bin/vibe prod smoke`
14. run `./bin/vibe prod perf-report`
15. run staging setup if enabled
16. run backup if selected
17. write install summary

### 12. Success

Show:

- production URL
- WordPress admin URL
- staging URL if enabled
- exact install directory
- where the generated env files live
- where the final summary lives
- daily commands:
  - `cd /opt/vibe-wp`
  - `./bin/vibe prod smoke`
  - `./bin/vibe prod perf-report`
  - `./bin/vibe prod backup`
  - `./bin/vibe prod backup-verify backups/prod/<backup-folder>`
- next recommended human action: log in to WordPress admin and change profile details

### 13. Error

Show:

- what failed in plain English
- exact command that failed
- short log excerpt
- retry, open logs, export support bundle, or quit

Support bundle:

- no secrets
- OS info
- installer version
- selected options with secrets redacted
- command list
- last 300 log lines
- `docker compose ps` output if available
- Caddy validation output if relevant

## Bootstrap Design

`https://wp.vcode.sh/install.sh` must be small and readable.

Responsibilities:

1. detect OS and architecture
2. create a temp directory
3. download `manifest.json`
4. select the matching release asset
5. download the installer executable
6. verify SHA256 from `checksums.txt` or release manifest
7. mark executable
8. run it with forwarded args

It must not:

- install Docker
- edit Caddy
- clone the repo
- write env files
- run Compose
- hide commands from the user

Example public contract:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --dry-run
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --version 0.1.0
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --headless plan.json
```

Required bootstrap safety:

- `set -eu`
- fail on unsupported OS/arch
- use `mktemp -d`
- cleanup temp dir on exit
- verify checksum before execution
- print the installer version and asset URL
- support `VIBE_WP_INSTALLER_BASE_URL` for staging the installer host
- support `VIBE_WP_INSTALLER_NO_EXEC=1` to only download and verify

## Installer CLI Modes

Interactive default:

```sh
vibe-wp-installer
```

Dry run:

```sh
vibe-wp-installer --dry-run
```

Export plan without running:

```sh
vibe-wp-installer --export-plan install-plan.json
```

Headless install from a reviewed plan:

```sh
vibe-wp-installer --headless install-plan.json
```

Resume failed install:

```sh
vibe-wp-installer --resume /opt/vibe-wp/.vibe-installer/state.json
```

Advanced flags:

```sh
vibe-wp-installer --install-dir /opt/vibe-wp
vibe-wp-installer --repo https://github.com/<owner>/vibe-wp.git
vibe-wp-installer --ref main
vibe-wp-installer --no-caddy
vibe-wp-installer --no-host-install
vibe-wp-installer --compact
vibe-wp-installer --ascii
```

## Host Install Details

### Docker

Use Docker's official apt repository.

Implementation steps:

1. remove conflicting old packages if present and approved
2. install `ca-certificates` and `curl`
3. install Docker GPG key into `/etc/apt/keyrings/docker.asc`
4. write `/etc/apt/sources.list.d/docker.sources`
5. install `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, `docker-compose-plugin`
6. verify `docker run hello-world`
7. verify `docker compose version`

Do not use Docker's convenience script in production mode.

### Caddy

Use Caddy's official Debian/Ubuntu package repository.

Implementation steps:

1. install repository prerequisites
2. add Caddy stable keyring and source list
3. install `caddy`
4. write a managed Caddyfile block or managed `/etc/caddy/Caddyfile`
5. run `caddy validate --config /etc/caddy/Caddyfile`
6. reload `systemctl reload caddy`

Default production Caddyfile shape:

```text
example.com, www.example.com {
    reverse_proxy 127.0.0.1:8080 {
        health_uri /
        health_interval 30s
        health_timeout 5s
        transport http {
            dial_timeout 2s
            response_header_timeout 120s
        }
    }
}

stage.example.com {
    reverse_proxy 127.0.0.1:8082 {
        health_uri /
        health_interval 30s
        health_timeout 5s
        transport http {
            dial_timeout 2s
            response_header_timeout 120s
        }
    }
}
```

Vibe WP production env must use loopback binding:

```env
HTTP_PORT=127.0.0.1:8080
```

Vibe WP staging env must use loopback binding:

```env
HTTP_PORT=127.0.0.1:8082
```

## Env Generation Contract

The installer must call existing repo logic where possible.

Recommended sequence:

```sh
cd /opt/vibe-wp
make init-prod
make init-stage
```

Then update generated env files through a structured parser, preserving comments when practical.

Production env values to set:

- `COMPOSE_PROJECT_NAME=vibe-wp-prod`
- `HTTP_PORT=127.0.0.1:8080`
- `WP_HOME=https://<domain>`
- `WP_SITEURL=https://<domain>`
- `WP_ENVIRONMENT_TYPE=production`
- `WP_INSTALL_TITLE`
- `WP_INSTALL_ADMIN_USER`
- `WP_INSTALL_ADMIN_PASSWORD`
- `WP_INSTALL_ADMIN_EMAIL`
- `WP_INSTALL_LOCALE`
- all MariaDB and WordPress passwords
- all WordPress salts
- Redis password, prefix, and cache salt
- performance preset values
- `FORCE_SSL_ADMIN=1`
- `NGINX_ENABLE_HSTS=1` only after HTTPS is confirmed
- `VIBE_WP_INTERNAL_URL=http://nginx:8080`
- optional AI provider keys

Staging env values to set:

- `COMPOSE_PROJECT_NAME=vibe-wp-stage`
- `HTTP_PORT=127.0.0.1:8082`
- `WP_HOME=https://<stage-domain>`
- `WP_SITEURL=https://<stage-domain>`
- `WP_ENVIRONMENT_TYPE=staging`
- unique database, Redis, and WordPress secrets
- unique Redis prefix and cache salt
- `VIBE_WP_FORCE_NOINDEX=1`
- `VIBE_WP_DISABLE_OUTBOUND_MAIL=1`
- `NGINX_ENABLE_HSTS=0`

Secrets:

- generate with cryptographically secure randomness
- redact in UI and logs
- write only to env files and install summary
- never send to external services

## State, Resume, And Idempotency

Write installer state to:

```text
/opt/vibe-wp/.vibe-installer/state.json
/opt/vibe-wp/.vibe-installer/install.log
/opt/vibe-wp/.vibe-installer/summary.txt
```

State must include:

- installer version
- repo URL/ref
- selected options with secrets redacted
- generated file paths
- task status
- last successful task
- failure details

Idempotency rules:

- If `/opt/vibe-wp` exists and is a git checkout, detect remote and current branch before modifying it.
- If env files exist, ask whether to reuse, backup, or regenerate.
- Before overwriting Caddyfile, backup current file to `/etc/caddy/Caddyfile.vibe-wp.<timestamp>.bak`.
- Before restarting production, run config validation.
- If production already runs, require explicit confirmation before changing env or Caddy.

## Security Requirements

Required:

- bind Vibe WP HTTP ports to `127.0.0.1`
- do not expose MariaDB or Redis publicly
- do not print secrets in logs
- default `DISALLOW_FILE_EDIT=1`
- default `FORCE_SSL_ADMIN=1`
- enable HSTS only after public HTTPS works
- keep staging noindexed and outbound mail disabled
- warn that Docker group access is root-equivalent if the installer offers non-root Docker access
- respect Docker firewall warnings and avoid relying on `ufw` as the only protection for published container ports
- verify release asset integrity before running downloaded binaries

Optional later:

- cosign signatures for release assets
- external backup target
- unattended security update setup
- fail2ban profile
- Cloudflare API DNS automation

## Testing Plan

### Unit tests

Test:

- domain validation
- DNS result parsing
- public IP detection parsing
- env update logic
- secret redaction
- Caddyfile rendering
- performance preset selection
- command plan generation
- task retry semantics

### Headless integration tests

Use fixture JSON to simulate:

- clean Ubuntu 26.04 x64
- clean Ubuntu 26.04 arm64
- Docker already installed
- Caddy already installed
- DNS mismatch
- port 80 busy
- existing `/opt/vibe-wp`
- existing env files
- staging enabled and disabled

### Terminal UI tests

Required snapshots:

- 140x40 wide layout
- 100x32 medium layout
- 78x24 compact layout
- 60x20 emergency compact layout
- truecolor mode
- 256-color mode
- ASCII fallback mode

For each screen:

- no overlapping text
- focused control visible
- footer visible
- help pane scrollable
- long domain and email values clipped or wrapped cleanly
- secret values redacted

### Real VPS smoke

Run on disposable Ubuntu 26.04 LTS VPS:

1. one-liner install
2. production only
3. production plus staging
4. DNS not ready path
5. failed Caddy validation path
6. resume after interrupted install

Required success evidence:

- `docker compose ps` healthy enough for services
- `./bin/vibe prod smoke` passes
- `./bin/vibe prod perf-report` completes
- public HTTPS production URL returns 200 or expected WordPress response
- `/wp-admin/` reachable
- WordPress REST API and loopback Site Health pass
- upload directory year/month creation passes through existing smoke test
- Redis Object Cache connected
- Nginx FastCGI cache reaches HIT
- staging noindex and outbound mail safeguards active if staging enabled

### Release tests

CI must prove:

- typecheck passes
- unit tests pass
- headless smoke passes
- compiled linux x64 and linux arm64 artifacts start with `--version`
- checksums generated
- bootstrap script downloads and verifies fixture artifacts in a test server

## Release Plan

Use GitHub Actions:

- `installer-ci.yml` on pull request and main
- `installer-release.yml` on tags like `installer-v0.1.0`

Release assets:

```text
vibe-wp-installer-linux-x64
vibe-wp-installer-linux-arm64
checksums.txt
manifest.json
install.sh
```

`manifest.json` shape:

```json
{
  "version": "0.1.0",
  "publishedAt": "2026-06-19T00:00:00Z",
  "assets": [
    {
      "os": "linux",
      "arch": "x64",
      "libc": "glibc",
      "url": "https://github.com/<owner>/vibe-wp/releases/download/installer-v0.1.0/vibe-wp-installer-linux-x64",
      "sha256": "<sha256>"
    },
    {
      "os": "linux",
      "arch": "arm64",
      "libc": "glibc",
      "url": "https://github.com/<owner>/vibe-wp/releases/download/installer-v0.1.0/vibe-wp-installer-linux-arm64",
      "sha256": "<sha256>"
    }
  ]
}
```

Hosting on `wp.vcode.sh`:

- serve `install.sh`
- serve latest `manifest.json`
- optionally serve a simple human page with the command and source links
- use HTTPS only
- set cache headers so `install.sh` and `manifest.json` update quickly
- keep versioned assets immutable

## Implementation Phases

### Phase 1: TUI foundation

Deliver:

- `installer/` Bun package
- OpenTUI React app booting locally
- theme, frame, step rail, footer, help pane
- first four screens wired to state
- `--dry-run`, `--version`, and `--compact`

Acceptance:

- `bun install`
- `bun run typecheck`
- `bun run test`
- `bun run dev`
- no layout overlap at required terminal sizes

### Phase 2: planning engine

Deliver:

- host detection
- DNS checks
- domain/admin/staging/performance state
- command plan generation
- env file rendering against existing examples
- secret generation and redaction
- exportable `install-plan.json`

Acceptance:

- unit tests for every validator
- generated prod/stage envs pass `./bin/vibe prod config` and `./bin/vibe stage config` in fixture mode or real checkout

### Phase 3: executor

Deliver:

- task runner
- streaming logs
- retry handling
- state persistence
- resume
- Docker install task
- Caddy install task
- repo clone/update task
- production install task
- staging install task

Acceptance:

- interrupted install can resume
- failed safe task can retry
- secrets do not appear in logs
- real local VM install succeeds

### Phase 4: release and bootstrap

Deliver:

- compiled Linux x64 and arm64 binaries
- `public-install/install.sh`
- manifest and checksums
- GitHub Actions CI/release
- `wp.vcode.sh` deployment instructions

Acceptance:

- one-liner downloads the correct artifact
- checksum verification fails closed on mismatch
- `VIBE_WP_INSTALLER_NO_EXEC=1` downloads and verifies only
- release artifacts pass `--version`

### Phase 5: docs and non-technical quick start

Deliver:

- `docs/installer.md`
- README installer section
- site-owner quick start update
- troubleshooting guide
- screenshots or terminal recordings

Acceptance:

- a non-technical VPS path can be followed without reading Docker docs
- manual path remains documented for advanced users

## Engineering Notes

- Keep the installer as a thin orchestration layer over existing `bin/vibe` commands.
- Keep all command execution centralized so logs, redaction, retries, and dry-runs are consistent.
- Keep env writes deterministic and reviewable.
- Avoid hidden background changes. Every privileged host change must appear in the review screen.
- Prefer exact official install commands over copied blog snippets.
- Treat user-owned existing files as sacred: backup before changing, show diffs where practical, and require confirmation for overwrite.
- Do not call `process.exit()` from random UI components. Route exits through the app/task lifecycle so OpenTUI can clean up the renderer.

## Done Definition

The installer work is done only when all of this is true:

- the OpenTUI React wizard is implemented
- the bootstrap one-liner is implemented and integrity-checks the real artifact
- production-only install succeeds on a clean Ubuntu 26.04 VPS
- production-plus-staging install succeeds on a clean Ubuntu 26.04 VPS
- generated env files use loopback app ports behind Caddy
- Docker and Caddy installs use official repositories
- Vibe WP install, smoke, and perf-report pass after installer execution
- Site Health REST and loopback checks pass in WordPress
- upload permissions pass existing smoke tests
- Redis Object Cache is connected
- Nginx FastCGI cache reaches HIT
- secrets are redacted from logs and support bundles
- terminal layouts have been checked at wide, medium, compact, and emergency sizes
- docs explain the installer path for non-technical users
- CI builds and verifies release artifacts
