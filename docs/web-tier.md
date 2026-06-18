# Web Tier

## Default Choice

The default web tier is Nginx in front of WordPress PHP-FPM.

That is intentional. For this template, Nginx gives the best balance of:

- static file serving from the WordPress core and `wp-content` mount
- WordPress rewrite support without `.htaccess`
- anonymous FastCGI page cache without requiring a WordPress plugin
- precise cache bypass rules for admin, login, REST, cookies, query strings, and commerce flows
- simple deployment behind an external TLS reverse proxy

## Alternatives Reviewed

### Caddy

Caddy is excellent when the container owns public TLS because it has first-class automatic HTTPS and a concise `php_fastcgi` directive. In this template, TLS is usually terminated by a platform proxy, load balancer, or edge provider. The critical performance feature is not TLS automation, but a predictable FastCGI page cache for anonymous WordPress traffic. Caddy can run WordPress, but it does not provide the same built-in FastCGI cache control surface as Nginx.

Use Caddy as an edge proxy if you want automatic certificates at the host level. Keep Nginx as the WordPress-facing container unless you intentionally redesign the cache layer.

### OpenLiteSpeed

OpenLiteSpeed with LSCache can be very fast for WordPress, especially when the LSCache plugin is part of the operating model. The tradeoff is that performance behavior moves into a web-server-specific WordPress plugin contract and a different runtime. That is useful as a future optional preset, but it is too opinionated for the default template.

## Nginx Performance Model

The Nginx layer has four jobs:

1. Serve static assets directly.
2. Apply WordPress rewrites.
3. Forward PHP requests to PHP-FPM with buffering and keepalive.
4. Cache anonymous GET and HEAD responses in FastCGI cache.

The cache intentionally skips:

- non-GET/HEAD requests
- query-string requests
- authorization headers
- explicit browser no-cache requests
- WordPress admin, login, cron, comments, REST, and XML-RPC endpoints
- logged-in, password, settings, reset, comment author, and WooCommerce cookies
- cart, checkout, account, and feed URLs

This avoids the common WordPress failure mode where a page cache accidentally serves private, cart, preview, or admin-sensitive output to anonymous users.

## Main Knobs

Connection and request handling:

```env
NGINX_WORKER_CONNECTIONS=4096
NGINX_KEEPALIVE_TIMEOUT=65s
NGINX_KEEPALIVE_REQUESTS=1000
NGINX_CLIENT_HEADER_TIMEOUT=15s
NGINX_CLIENT_BODY_TIMEOUT=60s
NGINX_SEND_TIMEOUT=30s
NGINX_CLIENT_MAX_BODY_SIZE=128m
NGINX_CLIENT_BODY_BUFFER_SIZE=256k
```

Compression:

```env
NGINX_GZIP=on
NGINX_GZIP_COMP_LEVEL=5
NGINX_GZIP_MIN_LENGTH=1024
```

Static files:

```env
NGINX_OPEN_FILE_CACHE=on
NGINX_OPEN_FILE_CACHE_MAX=10000
NGINX_OPEN_FILE_CACHE_INACTIVE=60s
NGINX_OPEN_FILE_CACHE_VALID=120s
NGINX_OPEN_FILE_CACHE_MIN_USES=2
NGINX_OPEN_FILE_CACHE_ERRORS=off
NGINX_STATIC_CACHE_CONTROL=public,max-age=2592000
```

Production examples set `NGINX_OPEN_FILE_CACHE_ERRORS=on` because theme/plugin files are expected to change less often. Keep it `off` for local development if you frequently add new files while the stack is running.

FastCGI page cache:

```env
NGINX_FASTCGI_CACHE_KEYS_ZONE_SIZE=128m
NGINX_FASTCGI_CACHE_TTL=10m
NGINX_FASTCGI_REDIRECT_CACHE_TTL=1m
NGINX_FASTCGI_CACHE_INACTIVE=30m
NGINX_FASTCGI_CACHE_MAX_SIZE=1g
NGINX_FASTCGI_CACHE_MIN_USES=1
NGINX_FASTCGI_CACHE_LOCK_TIMEOUT=10s
```

Increase `NGINX_FASTCGI_CACHE_TTL` only when the site has a deliberate purge strategy or when a short delay before anonymous users see edits is acceptable.

## Verification

Check that Nginx is returning cache state:

```sh
curl -I http://localhost:8080/
curl -I http://localhost:8080/
```

The second anonymous request should normally include:

```text
X-FastCGI-Cache: HIT
```

Run the full smoke test:

```sh
make smoke
```

## Sources

- https://nginx.org/en/docs/http/ngx_http_core_module.html
- https://nginx.org/en/docs/http/ngx_http_fastcgi_module.html
- https://docs.nginx.com/nginx/admin-guide/content-cache/content-caching/
- https://caddyserver.com/docs/caddyfile/directives/php_fastcgi
- https://docs.litespeedtech.com/cloud/docker/ols-wordpress/
