# Guided VPS Installer

The guided installer is the recommended path for non-technical VPS owners.

```sh
curl -fsSL https://wp.vcode.sh/install.sh | sh
```

The public `wp.vcode.sh` host is a small static service. It serves the bootstrap script, the latest manifest, checksums, and immutable versioned installer binaries. It does not host WordPress and it does not store secrets.

## Safety Model

The bootstrap script:

- detects Linux CPU architecture
- downloads `manifest.json`
- selects the matching installer binary
- verifies SHA256 before execution
- forwards user arguments to the installer
- supports `VIBE_WP_INSTALLER_NO_EXEC=1` for download and verify only

The bootstrap script does not install Docker, edit host reverse-proxy configuration, clone the repository, write env files, or run Compose. Those actions happen only inside the reviewed TUI flow or through headless `--yes`.

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
curl -fsSL https://wp.vcode.sh/install.sh | sh -s -- --installer-version 0.1.0
```

Use a staging installer host:

```sh
curl -fsSL https://wp.vcode.sh/install.sh | VIBE_WP_INSTALLER_BASE_URL=https://staging.wp.vcode.sh sh
```

## Release Flow

Create a release by pushing a tag:

```sh
git tag installer-v0.1.0
git push origin installer-v0.1.0
```

The release workflow:

1. installs Bun dependencies
2. runs `bun run quality`
3. compiles Linux x64 and arm64 installer binaries
4. builds `public-install/site`
5. uploads release assets
6. pushes `ghcr.io/vcode-sh/vibe-wp-installer-site`
7. optionally triggers a Dokploy deploy through the Dokploy API

## Dokploy

Use a Dokploy application, not Compose, for `wp.vcode.sh`.

Dokploy owns the public layer: Traefik routers, HTTP to HTTPS redirect, Let's Encrypt certificate, and the domain mapping. The container must not run its own TLS proxy. It only needs to serve static files over plain HTTP on the internal port configured in the Dokploy domain.

Recommended settings:

- source type: Docker image
- image: `ghcr.io/vcode-sh/vibe-wp-installer-site:latest`
- internal port: `8080`
- domain: `wp.vcode.sh`
- HTTPS: enabled
- memory limit: 128 MB
- CPU limit: 0.25
- volumes: none
- secrets: none

The Docker image is hosted in GitHub Container Registry, not Docker Hub. A Docker Hub account is not required.

For `wp.vcode.sh`, the preferred setup is to make only the `vibe-wp-installer-site` GHCR package public. The container contains only public installer assets, and public GHCR packages can be pulled without authentication. In GitHub, open the package, go to Package settings, change visibility to Public, and confirm the package name. GitHub warns that a public package cannot be made private again.

If the GHCR package stays private, configure private registry access in Dokploy:

- registry URL: `ghcr.io`
- username: the GitHub account that can read the package
- password: a GitHub personal access token classic with `read:packages`
- image: `ghcr.io/vcode-sh/vibe-wp-installer-site:latest`

The current `wp-vcode-bootstrap` Dokploy application intentionally uses the public image path. If no registry credentials are configured and the package is private, Docker pull fails with `denied`.

For automatic deployment after the GHCR image is pushed, add these GitHub Actions secrets:

- `DOKPLOY_API_URL`: `https://srv.vcode.sh`
- `DOKPLOY_API_KEY`: a Dokploy API token with permission to deploy the application

If those secrets are not present, the workflow stops after publishing the image and the Dokploy deployment must be triggered manually.

Current production Dokploy target:

- project: `wp vcode`
- project ID: `CG0xv7dCV4c5rdBCZOEYn`
- environment: `production`
- environment ID: `i4R7pSm4G7A0e2MHP3DVG`
- application: `wp-vcode-bootstrap`
- application ID: `M0RhmNczoK7D9mBMoG9_G`
- Dokploy app name: `wp-vcode-bootstrap-ig5k8g`
- domain ID: `BcoinbnHY75vP2e-aK5D-`

The application is intentionally left idle until the first `ghcr.io/vcode-sh/vibe-wp-installer-site:latest` image is published.
