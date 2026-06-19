#!/bin/sh
set -eu

base_url="${VIBE_WP_INSTALLER_BASE_URL:-https://wp.vcode.sh}"
requested_version="${VIBE_WP_INSTALLER_VERSION:-}"
forward_args=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --installer-version)
      shift
      [ "$#" -gt 0 ] || {
        echo "--installer-version requires a value." >&2
        exit 2
      }
      requested_version="$1"
      ;;
    --version)
      if [ "$#" -gt 1 ] && [ "${2#-}" = "$2" ]; then
        shift
        requested_version="$1"
      else
        forward_args="${forward_args} --version"
      fi
      ;;
    *)
      quoted=$(printf "%s" "$1" | sed "s/'/'\\\\''/g")
      forward_args="${forward_args} '$quoted'"
      ;;
  esac
  shift
done

need_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

download() {
  url="$1"
  output="$2"
  curl -fsSL "$url" -o "$output"
}

json_value() {
  key="$1"
  file="$2"
  sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$file" | head -n 1
}

asset_block() {
  platform="$1"
  file="$2"
  sed -n "/\"$platform\"[[:space:]]*:/,/}/p" "$file"
}

sha256_file() {
  file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
    return
  fi
  echo "Missing sha256sum or shasum." >&2
  exit 1
}

need_command curl
need_command awk
need_command sed
need_command uname

os_name=$(uname -s | tr '[:upper:]' '[:lower:]')
arch_name=$(uname -m | tr '[:upper:]' '[:lower:]')

case "$os_name" in
  linux) os="linux" ;;
  *)
    echo "Unsupported OS: $os_name. Vibe WP installer currently supports Linux VPS hosts." >&2
    exit 1
    ;;
esac

case "$arch_name" in
  x86_64 | amd64) arch="x64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *)
    echo "Unsupported CPU architecture: $arch_name." >&2
    exit 1
    ;;
esac

platform="$os-$arch"
temp_dir=$(mktemp -d 2>/dev/null || mktemp -d -t vibe-wp-installer)
trap 'rm -rf "$temp_dir"' EXIT INT TERM

if [ -n "$requested_version" ]; then
  manifest_url="$base_url/releases/$requested_version/manifest.json"
else
  manifest_url="$base_url/manifest.json"
fi

manifest_file="$temp_dir/manifest.json"
download "$manifest_url" "$manifest_file"

version=$(json_value version "$manifest_file")
block=$(asset_block "$platform" "$manifest_file")
asset_path=$(printf "%s\n" "$block" | sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
asset_url=$(printf "%s\n" "$block" | sed -n 's/.*"url"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
expected_sha=$(printf "%s\n" "$block" | sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)

if [ -z "$version" ] || [ -z "$expected_sha" ]; then
  echo "Installer manifest is incomplete: $manifest_url" >&2
  exit 1
fi

if [ -n "$asset_path" ]; then
  asset_url="$base_url$asset_path"
elif [ -z "$asset_url" ]; then
  echo "No installer asset for platform $platform in $manifest_url" >&2
  exit 1
fi

binary_path="$temp_dir/vibe-wp-installer"
download "$asset_url" "$binary_path"
actual_sha=$(sha256_file "$binary_path")

if [ "$actual_sha" != "$expected_sha" ]; then
  echo "Checksum mismatch for $asset_url" >&2
  echo "Expected: $expected_sha" >&2
  echo "Actual:   $actual_sha" >&2
  exit 1
fi

chmod 0755 "$binary_path"

echo "Vibe WP installer $version"
echo "Platform: $platform"
echo "Verified: $actual_sha"

if [ "${VIBE_WP_INSTALLER_NO_EXEC:-}" = "1" ]; then
  echo "Downloaded and verified only: $binary_path"
  exit 0
fi

eval "set -- $forward_args"
exec "$binary_path" "$@"
