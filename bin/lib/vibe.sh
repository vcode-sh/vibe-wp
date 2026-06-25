#!/usr/bin/env sh

if [ -z "${VIBE_BIN_DIR:-}" ]; then
  VIBE_BIN_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
fi

VIBE_ROOT="$(CDPATH= cd -- "${VIBE_BIN_DIR}/.." && pwd)"
cd "${VIBE_ROOT}"

VIBE_ENV="${VIBE_ENV:-local}"

vibe_default_env_file() {
  case "${VIBE_ENV}" in
    local) printf '.env' ;;
    prod|production) printf 'env/prod.env' ;;
    stage|staging) printf 'env/stage.env' ;;
    external) printf 'env/external.env' ;;
    *) printf 'env/%s.env' "${VIBE_ENV}" ;;
  esac
}

vibe_default_compose_args() {
  case "${VIBE_ENV}" in
    local)
      printf '%s' '-f compose.yaml'
      ;;
    prod|production)
      printf '%s' '-f compose.yaml -f compose.prod.yaml'
      ;;
    stage|staging)
      printf '%s' '-f compose.yaml -f compose.prod.yaml -f compose.stage.yaml'
      ;;
    external)
      printf '%s' '-f compose.external.yaml'
      ;;
    shared-db)
      # WordPress + Nginx + per-site Redis; the database comes from the shared
      # vibe-wp-shared-db container via the external shared_db network.
      printf '%s' '-f compose.shared-db.yaml'
      ;;
    *)
      printf '%s' '-f compose.yaml'
      ;;
  esac
}

VIBE_ENV_FILE="${VIBE_ENV_FILE:-$(vibe_default_env_file)}"
VIBE_COMPOSE_ARGS="${VIBE_COMPOSE_ARGS:-$(vibe_default_compose_args)}"

vibe_env_file_arg() {
  if [ -f "${VIBE_ENV_FILE}" ]; then
    printf -- '--env-file %s' "${VIBE_ENV_FILE}"
  fi
}

vibe_require_env_file() {
  if [ ! -f "${VIBE_ENV_FILE}" ]; then
    echo "Missing env file for ${VIBE_ENV}: ${VIBE_ENV_FILE}" >&2
    echo "Create it from the matching example under env/ or pass VIBE_ENV_FILE=..." >&2
    exit 1
  fi
}

vibe_load_env() {
  vibe_require_env_file
  set -a
  # POSIX `.` searches $PATH when the operand has no slash (dash on Ubuntu),
  # so a bare ".env" fails. Force a path with a slash.
  case "${VIBE_ENV_FILE}" in
    /*|*/*) env_path="${VIBE_ENV_FILE}" ;;
    *) env_path="./${VIBE_ENV_FILE}" ;;
  esac
  # shellcheck disable=SC1090
  . "${env_path}"
  set +a
}

vibe_compose() {
  env_arg="$(vibe_env_file_arg)"

  # shellcheck disable=SC2086
  docker compose ${env_arg} ${VIBE_COMPOSE_ARGS} "$@"
}

vibe_compose_service_exists() {
  vibe_compose config --services 2>/dev/null | grep -qx "$1"
}

vibe_compose_service_running() {
  vibe_compose ps --status running --services 2>/dev/null | grep -qx "$1"
}

vibe_wp() {
  vibe_require_env_file
  vibe_compose run --rm wp "$@"
}

vibe_wp_stdin() {
  vibe_require_env_file
  vibe_compose run --rm -T wp "$@"
}

vibe_clear_nginx_cache() {
  if vibe_compose_service_exists nginx && vibe_compose_service_running nginx; then
    vibe_compose exec -T nginx sh -c 'rm -rf /var/cache/nginx/wordpress/*' >/dev/null 2>&1 || true
  fi
}

vibe_restart_php_and_nginx() {
  if vibe_compose_service_exists wordpress; then
    vibe_compose up -d --force-recreate wordpress cron >/dev/null
  fi

  if vibe_compose_service_exists nginx && vibe_compose_service_running nginx; then
    vibe_compose restart nginx >/dev/null
  elif vibe_compose_service_exists nginx; then
    vibe_compose up -d nginx >/dev/null
  fi
}

vibe_env_value() {
  key="$1"
  vibe_load_env
  eval "printf '%s' \"\${${key}:-}\""
}

vibe_wp_home() {
  value="$(vibe_env_value WP_HOME)"
  if [ -z "${value}" ]; then
    value="$(vibe_env_value WP_SITEURL)"
  fi
  printf '%s' "${value}"
}
