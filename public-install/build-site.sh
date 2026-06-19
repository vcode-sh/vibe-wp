#!/bin/sh
set -eu

version="${1:-}"
base_url="${VIBE_WP_INSTALLER_BASE_URL:-https://wp.vcode.sh}"
root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
dist_dir="${VIBE_WP_INSTALLER_DIST_DIR:-$root_dir/installer/dist}"
site_dir="${VIBE_WP_INSTALLER_SITE_DIR:-$root_dir/public-install/site}"
release_dir="$site_dir/releases/$version"

[ -n "$version" ] || {
  echo "Usage: public-install/build-site.sh <version>" >&2
  exit 2
}

case "$site_dir" in
  "$root_dir"/public-install/site) ;;
  *)
    echo "Refusing to clean unexpected site directory: $site_dir" >&2
    exit 1
    ;;
esac

sha256_file() {
  file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return
  fi
  shasum -a 256 "$file" | awk '{print $1}'
}

asset_x64="vibe-wp-installer-linux-x64"
asset_arm64="vibe-wp-installer-linux-arm64"
asset_x64_download="$asset_x64.gz"
asset_arm64_download="$asset_arm64.gz"

[ -f "$dist_dir/$asset_x64" ] || {
  echo "Missing $dist_dir/$asset_x64" >&2
  exit 1
}
[ -f "$dist_dir/$asset_arm64" ] || {
  echo "Missing $dist_dir/$asset_arm64" >&2
  exit 1
}

rm -rf "$site_dir"
mkdir -p "$release_dir"
: >"$site_dir/.gitkeep"

cp "$root_dir/public-install/install.sh" "$site_dir/install.sh"
gzip -c -9 "$dist_dir/$asset_x64" > "$release_dir/$asset_x64_download"
gzip -c -9 "$dist_dir/$asset_arm64" > "$release_dir/$asset_arm64_download"
chmod 0644 "$site_dir/install.sh" "$release_dir/$asset_x64_download" "$release_dir/$asset_arm64_download"

sha_x64=$(sha256_file "$dist_dir/$asset_x64")
sha_arm64=$(sha256_file "$dist_dir/$asset_arm64")
download_sha_x64=$(sha256_file "$release_dir/$asset_x64_download")
download_sha_arm64=$(sha256_file "$release_dir/$asset_arm64_download")
published_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat >"$release_dir/checksums.txt" <<EOF
$sha_x64  $asset_x64
$sha_arm64  $asset_arm64
$download_sha_x64  $asset_x64_download
$download_sha_arm64  $asset_arm64_download
EOF

cat >"$release_dir/manifest.json" <<EOF
{
  "version": "$version",
  "publishedAt": "$published_at",
  "assets": {
    "linux-x64": {
      "path": "/releases/$version/$asset_x64_download",
      "url": "$base_url/releases/$version/$asset_x64_download",
      "sha256": "$sha_x64",
      "downloadSha256": "$download_sha_x64",
      "compression": "gzip"
    },
    "linux-arm64": {
      "path": "/releases/$version/$asset_arm64_download",
      "url": "$base_url/releases/$version/$asset_arm64_download",
      "sha256": "$sha_arm64",
      "downloadSha256": "$download_sha_arm64",
      "compression": "gzip"
    }
  }
}
EOF

cp "$release_dir/checksums.txt" "$site_dir/checksums.txt"
cp "$release_dir/manifest.json" "$site_dir/manifest.json"

cat >"$site_dir/index.html" <<EOF
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Vibe WP Installer</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 3rem; line-height: 1.5; }
      code { background: #f3f4f6; padding: .2rem .35rem; border-radius: .3rem; }
      pre { background: #111827; color: #f9fafb; padding: 1rem; overflow: auto; }
    </style>
  </head>
  <body>
    <h1>Vibe WP Installer</h1>
    <p>Install a managed WordPress stack on an Ubuntu VPS.</p>
    <pre><code>curl -fsSL https://wp.vcode.sh/install.sh | sh</code></pre>
    <p>Latest installer version: <code>$version</code></p>
  </body>
</html>
EOF

printf "Built %s for %s\n" "$site_dir" "$version"
