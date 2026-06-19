# Guided VPS Installer

The guided installer is the recommended path for non-technical VPS owners.

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

The public `wp.vcode.sh` host is a small static service. It serves the bootstrap script, the latest manifest, checksums, and immutable versioned installer binaries. It does not host WordPress and it does not store secrets.

Current public installer version: `0.1.2`.

Current status: usable for bootstrap verification, dry-run planning, and interactive TUI review. It is not yet certified as a completed unattended production installer. The remaining production gates are documented below and in [../todo/installer.md](../todo/installer.md).

## Safety Model

The bootstrap script:

- detects Linux CPU architecture
- downloads `manifest.json`
- selects the matching installer binary
- verifies SHA256 before execution
- forwards user arguments to the installer
- supports `VIBE_WP_INSTALLER_NO_EXEC=1` for download and verify only

The bootstrap script does not install Docker, edit host reverse-proxy configuration, clone the repository, write env files, or run Compose. Those actions happen only inside the reviewed TUI flow or through headless `--yes`.

## What The Installer Has Now

Installer `0.1.2` includes:

- integrity-checked public bootstrap through `https://wp.vcode.sh/install.sh`
- Linux x64 and arm64 release artifacts
- interactive OpenTUI/React wizard launched correctly from `curl | sh` over SSH
- clean stdout for `--dry-run`, `--version`, and automation modes
- site inventory that scans `/opt` and `/srv` for existing Vibe WP installs
- create, manage, and safe-remove flows
- per-site slugs, Compose project names, and localhost HTTP ports
- Caddy snippets under `/etc/caddy/sites-enabled/vibe-wp-<site>.caddy`
- global Caddy import management instead of overwriting the whole host Caddyfile
- DNS preflight for new installs
- blocking for placeholder domains and emails such as `example.com`
- numbered choice cards instead of cramped native selects
- a neutral dark visual pass
- masked secret fields for passwords and API keys
- typed confirmation before execution
- a real task runner wired to the interactive Execute screen
- manage tasks for `ps`, production smoke, performance report, and optional staging smoke
- safe-remove tasks that back up, stop containers, and disable the site's Caddy snippet without deleting files or Docker volumes

## What The Installer Does Not Have Yet

The installer is not complete until these gaps are closed:

- persistent state, resumable execution, and install logs under `.vibe-installer/`
- support bundle export with redacted logs and detected host facts
- first-class modal/dialog layers for destructive actions, failure recovery, and advanced overrides
- full-delete mode for intentionally removing files and Docker volumes
- terminal snapshot checks for wide, medium, compact, and emergency layouts
- real production install proof on a disposable Ubuntu 26.04 VPS with a real domain
- real production-plus-staging install proof on a disposable Ubuntu 26.04 VPS with real domains
- post-install proof for WordPress Site Health REST and loopback checks
- post-install proof for uploads year/month directory creation
- post-install proof for Redis Object Cache connectivity
- post-install proof for FastCGI cache `HIT`

## Production Readiness Gate

Do not mark the installer complete or recommend unattended `--headless --yes` production usage until all of these are true:

- the user can install a production WordPress site from a clean Ubuntu 26.04 VPS without reading Docker documentation
- the same flow can add staging with isolated domains, ports, project names, volumes, and secrets
- every privileged host change appears in review before execution
- interruption can be resumed from `.vibe-installer/state.json`
- failures show plain-English next steps and allow retry or support bundle export
- secrets are redacted from UI, logs, plans, summaries, and support bundles
- the TUI has been visually checked on real SSH terminals, not only local terminal sessions

## Useful Commands

Run the guided installer:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

Download and verify without executing:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_NO_EXEC=1 sh
```

Run a specific installer version:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --installer-version 0.1.2
```

Use a staging installer host:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_BASE_URL=https://staging.wp.vcode.sh sh
```

## Release Flow

Create a release by pushing a tag:

```sh
git tag installer-v0.1.2
git push origin installer-v0.1.2
```

The release workflow:

1. installs Bun dependencies
2. runs `bun run quality`
3. compiles Linux x64 and arm64 installer binaries
4. builds `public-install/site`
5. uploads release assets
6. force-publishes the generated static host to the `dokploy/wp-vcode-bootstrap` branch

Installer binaries are published as gzip-compressed downloads. The bootstrap script verifies the compressed download checksum, extracts the binary, and verifies the executable checksum before running it.

## Dokploy

Use a Dokploy application, not Compose, for `wp.vcode.sh`.

Dokploy owns the public layer: Traefik routers, HTTP to HTTPS redirect, Let's Encrypt certificate, and the domain mapping. The container must not run its own TLS proxy. It only needs to serve static files over plain HTTP on the internal port configured in the Dokploy domain.

Recommended settings:

- source type: GitHub
- repository: `vcode-sh/vibe-wp`
- branch: `dokploy/wp-vcode-bootstrap`
- build path: `/`
- build type: Dockerfile
- Dockerfile: `Dockerfile`
- internal port: `8080`
- domain: `wp.vcode.sh`
- HTTPS: enabled
- memory limit: 128 MB
- CPU limit: 0.25
- volumes: none
- secrets: none

The deploy branch is generated by GitHub Actions and should not be edited by hand. Dokploy should auto-deploy on push to this branch.

Current production Dokploy target:

- project: `wp vcode`
- project ID: `CG0xv7dCV4c5rdBCZOEYn`
- environment: `production`
- environment ID: `i4R7pSm4G7A0e2MHP3DVG`
- application: `wp-vcode-bootstrap`
- application ID: `M0RhmNczoK7D9mBMoG9_G`
- Dokploy app name: `wp-vcode-bootstrap-ig5k8g`
- domain ID: `BcoinbnHY75vP2e-aK5D-`
