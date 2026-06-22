#!/usr/bin/env sh
# Backup helpers: local retention plus off-server copies to an S3-compatible
# object store (Cloudflare R2 by default) via rclone. rclone is configured
# entirely from RCLONE_CONFIG_R2_* environment variables loaded from the env
# file, so no separate rclone config file ever holds the secrets.

# Root directory that holds one sub-directory per backup for this environment.
backup_root() {
  root="$(vibe_env_value VIBE_BACKUP_DIR)"
  if [ -z "${root}" ]; then
    root="backups/$(printf '%s' "${VIBE_ENV}" | tr -c 'A-Za-z0-9_.-' '-')"
  fi
  printf '%s' "${root}"
}

backup_remote_enabled() {
  [ "$(vibe_env_value VIBE_BACKUP_R2_ENABLED)" = "1" ]
}

# rclone reads its remote from the environment; export the keys it needs so the
# child rclone process can see them after the env file has been sourced.
backup_export_rclone() {
  vibe_load_env
  for suffix in TYPE PROVIDER ACCESS_KEY_ID SECRET_ACCESS_KEY ENDPOINT ACL NO_CHECK_BUCKET REGION; do
    eval "value=\"\${RCLONE_CONFIG_R2_${suffix}:-}\""
    if [ -n "${value}" ]; then
      export "RCLONE_CONFIG_R2_${suffix}=${value}"
    fi
  done
}

backup_require_rclone() {
  if ! command -v rclone >/dev/null 2>&1; then
    echo "rclone is required for off-server (R2) backups but is not installed." >&2
    echo "Install it with: curl https://rclone.org/install.sh | sudo bash" >&2
    return 1
  fi
}

# Remote base path: R2:<bucket>/<prefix> where prefix defaults to the env name.
backup_remote_base() {
  bucket="$(vibe_env_value VIBE_BACKUP_R2_BUCKET)"
  prefix="$(vibe_env_value VIBE_BACKUP_R2_PREFIX)"
  if [ -z "${prefix}" ]; then
    prefix="$(printf '%s' "${VIBE_ENV}" | tr -c 'A-Za-z0-9_.-' '-')"
  fi
  printf 'R2:%s/%s' "${bucket}" "${prefix}"
}

# Upload one backup directory to the remote, fast (parallel multipart).
backup_upload() {
  target="$1"
  backup_require_rclone || return 1
  backup_export_rclone
  base="$(backup_remote_base)"
  name="$(basename "${target}")"
  echo "Uploading to ${base}/${name} ..."
  rclone copy --transfers 4 --checkers 8 --s3-no-check-bucket --s3-chunk-size 32M \
    --stats 2s --stats-one-line --stats-log-level NOTICE \
    "${target}" "${base}/${name}"
  echo "Verifying remote copy ..."
  rclone check "${target}" "${base}/${name}" --one-way
}

# Keep only the newest <keep> backup directories under <root>.
backup_prune_local() {
  root="$1"
  keep="$2"
  [ -n "${keep}" ] || return 0
  [ "${keep}" -gt 0 ] 2>/dev/null || return 0
  ls -1dt "${root}"/*/ 2>/dev/null | tail -n "+$((keep + 1))" | while IFS= read -r dir; do
    echo "Pruning old local backup: ${dir}"
    rm -rf "${dir}"
  done
}

# Keep only the newest <keep> backup directories on the remote.
backup_prune_remote() {
  keep="$1"
  [ -n "${keep}" ] || return 0
  [ "${keep}" -gt 0 ] 2>/dev/null || return 0
  backup_remote_enabled || return 0
  backup_require_rclone || return 0
  backup_export_rclone
  base="$(backup_remote_base)"
  rclone lsf --dirs-only "${base}/" 2>/dev/null | sed 's#/*$##' | sort | head -n "-${keep}" |
    while IFS= read -r dir; do
      [ -n "${dir}" ] || continue
      echo "Pruning old remote backup: ${dir}"
      rclone purge "${base}/${dir}" 2>/dev/null || true
    done
}

# List remote backups as local-equivalent paths (newest last), so a restore can
# use the same path it would for a local backup; the restore auto-fetches it.
backup_list_remote() {
  backup_remote_enabled || return 0
  backup_require_rclone || return 0
  backup_export_rclone
  root="$(backup_root)"
  base="$(backup_remote_base)"
  rclone lsf --dirs-only "${base}/" 2>/dev/null | sed 's#/*$##' | sort | while IFS= read -r name; do
    [ -n "${name}" ] || continue
    printf '%s/%s\n' "${root}" "${name}"
  done
}

# Pull a named backup directory down from the remote into <dest>.
backup_fetch_remote() {
  name="$1"
  dest="$2"
  backup_require_rclone || return 1
  backup_export_rclone
  base="$(backup_remote_base)"
  echo "Fetching ${base}/${name} from remote ..."
  mkdir -p "${dest}"
  rclone copy --stats 2s --stats-one-line --stats-log-level NOTICE \
    "${base}/${name}" "${dest}"
}
