# Vibe WP Public Installer Host

This directory builds the static content served from `https://wp.vcode.sh`.

The public host intentionally does not run WordPress and does not keep secrets. It serves:

- `install.sh`, the small bootstrap script users run with `curl`.
- `manifest.json`, the latest installer manifest.
- `checksums.txt`, the latest checksums.
- `releases/<version>/...`, immutable versioned gzip-compressed installer binaries and manifests.

Build a local site after compiling installer binaries:

```sh
cd installer
bun run build:linux-x64
bun run build:linux-arm64
cd ..
public-install/build-site.sh 0.1.2
docker build -t vibe-wp-installer-site:test public-install
```

The release workflow publishes the generated host to the `dokploy/wp-vcode-bootstrap` branch. The Dokploy application should use that branch as a GitHub source, build the Dockerfile at the branch root, run the container on internal port `8080`, and expose `wp.vcode.sh` through HTTPS.

Dokploy/Traefik owns TLS, redirects, certificates, and public routing. The image only serves static files over plain HTTP inside the Dokploy network.
