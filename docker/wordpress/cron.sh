#!/bin/sh
set -eu

interval="${WP_CRON_INTERVAL:-60}"

wp_cmd() {
  wp --path=/var/www/html "$@"
}

echo "Waiting for WordPress to become installed before starting cron..."
until wp_cmd core is-installed >/dev/null 2>&1; do
  sleep 5
done

echo "Starting WordPress cron loop with ${interval}s interval."
while true; do
  wp_cmd cron event run --due-now || true
  sleep "${interval}"
done
