#!/bin/sh
set -eu

export PHP_MEMORY_LIMIT="${PHP_MEMORY_LIMIT:-256M}"
export PHP_UPLOAD_MAX_FILESIZE="${PHP_UPLOAD_MAX_FILESIZE:-128M}"
export PHP_POST_MAX_SIZE="${PHP_POST_MAX_SIZE:-128M}"
export PHP_MAX_EXECUTION_TIME="${PHP_MAX_EXECUTION_TIME:-120}"
export PHP_MAX_INPUT_TIME="${PHP_MAX_INPUT_TIME:-120}"
export PHP_MAX_INPUT_VARS="${PHP_MAX_INPUT_VARS:-5000}"
export PHP_REALPATH_CACHE_SIZE="${PHP_REALPATH_CACHE_SIZE:-4096K}"
export PHP_REALPATH_CACHE_TTL="${PHP_REALPATH_CACHE_TTL:-600}"
export PHP_OPCACHE_ENABLE="${PHP_OPCACHE_ENABLE:-1}"
export PHP_OPCACHE_ENABLE_CLI="${PHP_OPCACHE_ENABLE_CLI:-1}"
export PHP_OPCACHE_MEMORY_CONSUMPTION="${PHP_OPCACHE_MEMORY_CONSUMPTION:-256}"
export PHP_OPCACHE_INTERNED_STRINGS_BUFFER="${PHP_OPCACHE_INTERNED_STRINGS_BUFFER:-32}"
export PHP_OPCACHE_MAX_ACCELERATED_FILES="${PHP_OPCACHE_MAX_ACCELERATED_FILES:-65000}"
export PHP_OPCACHE_VALIDATE_TIMESTAMPS="${PHP_OPCACHE_VALIDATE_TIMESTAMPS:-1}"
export PHP_OPCACHE_REVALIDATE_FREQ="${PHP_OPCACHE_REVALIDATE_FREQ:-2}"
export PHP_OPCACHE_JIT="${PHP_OPCACHE_JIT:-0}"
export PHP_OPCACHE_JIT_BUFFER_SIZE="${PHP_OPCACHE_JIT_BUFFER_SIZE:-0}"

export PHP_FPM_PM="${PHP_FPM_PM:-dynamic}"
export PHP_FPM_PM_MAX_CHILDREN="${PHP_FPM_PM_MAX_CHILDREN:-24}"
export PHP_FPM_PM_START_SERVERS="${PHP_FPM_PM_START_SERVERS:-4}"
export PHP_FPM_PM_MIN_SPARE_SERVERS="${PHP_FPM_PM_MIN_SPARE_SERVERS:-2}"
export PHP_FPM_PM_MAX_SPARE_SERVERS="${PHP_FPM_PM_MAX_SPARE_SERVERS:-8}"
export PHP_FPM_PM_MAX_REQUESTS="${PHP_FPM_PM_MAX_REQUESTS:-500}"
export PHP_FPM_REQUEST_TERMINATE_TIMEOUT="${PHP_FPM_REQUEST_TERMINATE_TIMEOUT:-120s}"
export PHP_FPM_PM_PROCESS_IDLE_TIMEOUT="${PHP_FPM_PM_PROCESS_IDLE_TIMEOUT:-10s}"

mkdir -p \
  /usr/local/etc/php/conf.d \
  /usr/local/etc/php-fpm.d \
  /var/www/html/wp-content/uploads \
  /var/www/html/wp-content/plugins \
  /var/www/html/wp-content/themes \
  /var/www/html/wp-content/mu-plugins \
  /var/www/html/wp-content/upgrade

rsync -a --ignore-existing /usr/src/wordpress/wp-content/ /var/www/html/wp-content/

if [ ! -f /var/www/html/wp-includes/version.php ]; then
  find /usr/src/wordpress -mindepth 1 -maxdepth 1 ! -name wp-content -exec cp -a {} /var/www/html/ \;
fi

if [ ! -f /var/www/html/wp-config.php ] && [ -f /usr/src/wordpress/wp-config-docker.php ]; then
  cp /usr/src/wordpress/wp-config-docker.php /var/www/html/wp-config.php
fi

if [ "${WP_CONTENT_FIX_PERMISSIONS:-1}" = "1" ] && [ "${1:-}" != "wp" ]; then
  chown -R www-data:www-data /var/www/html/wp-content || true
  find /var/www/html/wp-content -type d -exec chmod u+rwX,go+rX,go-w {} + || true
  find /var/www/html/wp-content -type f -exec chmod u+rw,go+r,go-w {} + || true
fi

envsubst '
  ${PHP_MEMORY_LIMIT}
  ${PHP_UPLOAD_MAX_FILESIZE}
  ${PHP_POST_MAX_SIZE}
  ${PHP_MAX_EXECUTION_TIME}
  ${PHP_MAX_INPUT_TIME}
  ${PHP_MAX_INPUT_VARS}
  ${PHP_REALPATH_CACHE_SIZE}
  ${PHP_REALPATH_CACHE_TTL}
  ${PHP_OPCACHE_ENABLE}
  ${PHP_OPCACHE_ENABLE_CLI}
  ${PHP_OPCACHE_MEMORY_CONSUMPTION}
  ${PHP_OPCACHE_INTERNED_STRINGS_BUFFER}
  ${PHP_OPCACHE_MAX_ACCELERATED_FILES}
  ${PHP_OPCACHE_VALIDATE_TIMESTAMPS}
  ${PHP_OPCACHE_REVALIDATE_FREQ}
  ${PHP_OPCACHE_JIT}
  ${PHP_OPCACHE_JIT_BUFFER_SIZE}
' < /usr/local/share/vibe-wp/php.ini.template > /usr/local/etc/php/conf.d/zz-vibe-wp.ini

envsubst '
  ${PHP_FPM_PM}
  ${PHP_FPM_PM_MAX_CHILDREN}
  ${PHP_FPM_PM_START_SERVERS}
  ${PHP_FPM_PM_MIN_SPARE_SERVERS}
  ${PHP_FPM_PM_MAX_SPARE_SERVERS}
  ${PHP_FPM_PM_MAX_REQUESTS}
  ${PHP_FPM_REQUEST_TERMINATE_TIMEOUT}
  ${PHP_FPM_PM_PROCESS_IDLE_TIMEOUT}
' < /usr/local/share/vibe-wp/php-fpm-www.conf.template > /usr/local/etc/php-fpm.d/zz-vibe-wp-www.conf

extra_config_file="$(mktemp)"

cat > "${extra_config_file}" <<'PHP'
if (!function_exists('vibe_wp_env')) {
    function vibe_wp_env(string $name, string $default = ''): string {
        if (function_exists('getenv_docker')) {
            return (string) getenv_docker($name, $default);
        }

        $value = getenv($name);
        return $value === false ? $default : (string) $value;
    }
}

if (!function_exists('vibe_wp_env_bool')) {
    function vibe_wp_env_bool(string $name, bool $default = false): bool {
        $value = strtolower(vibe_wp_env($name, $default ? '1' : '0'));
        return in_array($value, array('1', 'true', 'yes', 'on'), true);
    }
}

if (!function_exists('vibe_wp_define')) {
    function vibe_wp_define(string $name, $value): void {
        if (!defined($name)) {
            define($name, $value);
        }
    }
}
PHP

if [ -n "${WORDPRESS_CONFIG_EXTRA:-}" ]; then
  printf '\n%s\n' "${WORDPRESS_CONFIG_EXTRA}" >> "${extra_config_file}"
fi

cat >> "${extra_config_file}" <<'PHP'
if (($environment = vibe_wp_env('WP_ENVIRONMENT_TYPE')) !== '') {
    vibe_wp_define('WP_ENVIRONMENT_TYPE', $environment);
}

if (($home = vibe_wp_env('WP_HOME')) !== '') {
    vibe_wp_define('WP_HOME', $home);
}

if (($siteurl = vibe_wp_env('WP_SITEURL')) !== '') {
    vibe_wp_define('WP_SITEURL', $siteurl);
}

if (($content_url = vibe_wp_env('WP_CONTENT_URL')) !== '') {
    vibe_wp_define('WP_CONTENT_URL', $content_url);
}

if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strpos((string) $_SERVER['HTTP_X_FORWARDED_PROTO'], 'https') !== false) {
    $_SERVER['HTTPS'] = 'on';
    $_SERVER['SERVER_PORT'] = 443;
}

if (isset($_SERVER['HTTP_X_FORWARDED_HOST']) && $_SERVER['HTTP_X_FORWARDED_HOST'] !== '') {
    $_SERVER['HTTP_HOST'] = $_SERVER['HTTP_X_FORWARDED_HOST'];
}

if (($memory_limit = vibe_wp_env('WP_MEMORY_LIMIT')) !== '') {
    vibe_wp_define('WP_MEMORY_LIMIT', $memory_limit);
}

if (($max_memory_limit = vibe_wp_env('WP_MAX_MEMORY_LIMIT')) !== '') {
    vibe_wp_define('WP_MAX_MEMORY_LIMIT', $max_memory_limit);
}

vibe_wp_define('WP_CACHE', vibe_wp_env_bool('WP_CACHE', true));
vibe_wp_define('WP_DEBUG_LOG', vibe_wp_env_bool('WP_DEBUG_LOG', false));
vibe_wp_define('WP_DEBUG_DISPLAY', vibe_wp_env_bool('WP_DEBUG_DISPLAY', false));
vibe_wp_define('SCRIPT_DEBUG', vibe_wp_env_bool('SCRIPT_DEBUG', false));
vibe_wp_define('FORCE_SSL_ADMIN', vibe_wp_env_bool('FORCE_SSL_ADMIN', false));
vibe_wp_define('DISABLE_WP_CRON', vibe_wp_env_bool('DISABLE_WP_CRON', true));
vibe_wp_define('DISALLOW_FILE_EDIT', vibe_wp_env_bool('DISALLOW_FILE_EDIT', true));
vibe_wp_define('DISALLOW_FILE_MODS', vibe_wp_env_bool('DISALLOW_FILE_MODS', false));
vibe_wp_define('AUTOMATIC_UPDATER_DISABLED', vibe_wp_env_bool('AUTOMATIC_UPDATER_DISABLED', false));

if (($auto_update_core = vibe_wp_env('WP_AUTO_UPDATE_CORE')) !== '') {
    if (in_array(strtolower($auto_update_core), array('1', 'true', 'yes', 'on'), true)) {
        vibe_wp_define('WP_AUTO_UPDATE_CORE', true);
    } elseif (in_array(strtolower($auto_update_core), array('0', 'false', 'no', 'off'), true)) {
        vibe_wp_define('WP_AUTO_UPDATE_CORE', false);
    } else {
        vibe_wp_define('WP_AUTO_UPDATE_CORE', $auto_update_core);
    }
}

if (($fs_method = vibe_wp_env('FS_METHOD')) !== '') {
    vibe_wp_define('FS_METHOD', $fs_method);
}

if (($fs_chmod_dir = vibe_wp_env('FS_CHMOD_DIR')) !== '') {
    vibe_wp_define('FS_CHMOD_DIR', octdec($fs_chmod_dir));
}

if (($fs_chmod_file = vibe_wp_env('FS_CHMOD_FILE')) !== '') {
    vibe_wp_define('FS_CHMOD_FILE', octdec($fs_chmod_file));
}

if (($empty_trash_days = vibe_wp_env('EMPTY_TRASH_DAYS')) !== '') {
    vibe_wp_define('EMPTY_TRASH_DAYS', (int) $empty_trash_days);
}

if (($post_revisions = vibe_wp_env('WP_POST_REVISIONS')) !== '') {
    vibe_wp_define('WP_POST_REVISIONS', is_numeric($post_revisions) ? (int) $post_revisions : $post_revisions);
}

if (($redis_host = vibe_wp_env('WP_REDIS_HOST')) !== '') {
    vibe_wp_define('WP_REDIS_HOST', $redis_host);
}

if (($redis_port = vibe_wp_env('WP_REDIS_PORT')) !== '') {
    vibe_wp_define('WP_REDIS_PORT', (int) $redis_port);
}

if (($redis_password = vibe_wp_env('WP_REDIS_PASSWORD')) !== '') {
    vibe_wp_define('WP_REDIS_PASSWORD', $redis_password);
}

if (($redis_database = vibe_wp_env('WP_REDIS_DATABASE')) !== '') {
    vibe_wp_define('WP_REDIS_DATABASE', (int) $redis_database);
}

if (($redis_prefix = vibe_wp_env('WP_REDIS_PREFIX')) !== '') {
    vibe_wp_define('WP_REDIS_PREFIX', $redis_prefix);
}

if (($cache_key_salt = vibe_wp_env('WP_CACHE_KEY_SALT')) !== '') {
    vibe_wp_define('WP_CACHE_KEY_SALT', $cache_key_salt);
}

if (($redis_timeout = vibe_wp_env('WP_REDIS_TIMEOUT')) !== '') {
    vibe_wp_define('WP_REDIS_TIMEOUT', (float) $redis_timeout);
}

if (($redis_read_timeout = vibe_wp_env('WP_REDIS_READ_TIMEOUT')) !== '') {
    vibe_wp_define('WP_REDIS_READ_TIMEOUT', (float) $redis_read_timeout);
}

if (($redis_client = vibe_wp_env('WP_REDIS_CLIENT')) !== '') {
    vibe_wp_define('WP_REDIS_CLIENT', $redis_client);
}

vibe_wp_define('WP_REDIS_IGBINARY', vibe_wp_env_bool('WP_REDIS_IGBINARY', false));
PHP

export WORDPRESS_CONFIG_EXTRA="$(cat "${extra_config_file}")"
rm -f "${extra_config_file}"

if [ "$(id -u)" = "0" ]; then
  case "${1:-}" in
    wp|/usr/local/bin/vibe-wp-cron.sh|vibe-wp-cron.sh)
      if command -v gosu >/dev/null 2>&1; then
        exec gosu www-data "$@"
      fi

      if command -v su-exec >/dev/null 2>&1; then
        exec su-exec www-data "$@"
      fi

      if command -v setpriv >/dev/null 2>&1; then
        exec setpriv --reuid="$(id -u www-data)" --regid="$(id -g www-data)" --init-groups "$@"
      fi

      echo "No privilege-drop helper found for running $1 as www-data." >&2
      exit 1
      ;;
  esac
fi

exec docker-entrypoint.sh "$@"
