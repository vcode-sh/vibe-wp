#!/bin/sh
set -eu

export NGINX_CLIENT_MAX_BODY_SIZE="${NGINX_CLIENT_MAX_BODY_SIZE:-128m}"
export NGINX_FASTCGI_CACHE_TTL="${NGINX_FASTCGI_CACHE_TTL:-10m}"
export NGINX_FASTCGI_CACHE_INACTIVE="${NGINX_FASTCGI_CACHE_INACTIVE:-30m}"
export NGINX_FASTCGI_CACHE_MAX_SIZE="${NGINX_FASTCGI_CACHE_MAX_SIZE:-1g}"
export NGINX_FASTCGI_CONNECT_TIMEOUT="${NGINX_FASTCGI_CONNECT_TIMEOUT:-10s}"
export NGINX_FASTCGI_SEND_TIMEOUT="${NGINX_FASTCGI_SEND_TIMEOUT:-120s}"
export NGINX_FASTCGI_READ_TIMEOUT="${NGINX_FASTCGI_READ_TIMEOUT:-120s}"
export NGINX_KEEPALIVE_TIMEOUT="${NGINX_KEEPALIVE_TIMEOUT:-65s}"

if [ "${NGINX_ENABLE_HSTS:-0}" = "1" ]; then
  export NGINX_HSTS_HEADER='add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
else
  export NGINX_HSTS_HEADER=''
fi

mkdir -p /etc/nginx/conf.d /var/cache/nginx/wordpress

envsubst '
  ${NGINX_FASTCGI_CACHE_INACTIVE}
  ${NGINX_FASTCGI_CACHE_MAX_SIZE}
' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/nginx.conf

envsubst '
  ${NGINX_CLIENT_MAX_BODY_SIZE}
  ${NGINX_FASTCGI_CACHE_TTL}
  ${NGINX_FASTCGI_CONNECT_TIMEOUT}
  ${NGINX_FASTCGI_SEND_TIMEOUT}
  ${NGINX_FASTCGI_READ_TIMEOUT}
  ${NGINX_KEEPALIVE_TIMEOUT}
  ${NGINX_HSTS_HEADER}
' < /etc/nginx/templates/site.conf.template > /etc/nginx/conf.d/default.conf

exec "$@"
