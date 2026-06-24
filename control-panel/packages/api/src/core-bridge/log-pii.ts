// Source-specific PII masking + nginx-access helpers. These run in the LOG
// ROUTER on already-redact()'d output, adding masking that only makes sense for
// a specific source (client IPs for access lines, SQL/user@host for mariadb).
// Owner decision O3=b: IPs are masked only in access context, never globally.

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const CACHE_FIELD = /\bcache=([A-Z]+)\b/;
const SQL_STRING_LITERAL = /'(?:[^'\\]|\\.){0,500}'/g;
const MARIADB_USER_HOST = /(# User@Host:\s*)\S+\[\S+\]\s*@\s*\S+(?:\s*\[\S*\])?/g;
const ACCESS_REQUEST = /"\s*(?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT|TRACE)\b[^"]*"\s+\d{3}\b/;

/** True for an nginx access.log line (request+status shape) or any line bearing a cache= field. */
export function isAccessLine(text: string): boolean {
  return ACCESS_REQUEST.test(text) || /\bcache=[A-Z]/.test(text);
}

/** The FastCGI cache status (HIT/MISS/BYPASS/…); undefined when absent or `-`. */
export function extractCache(text: string): string | undefined {
  const m = CACHE_FIELD.exec(text);
  return m ? m[1] : undefined;
}

/** Mask every IPv4 address — call ONLY on access-context lines. */
export function maskAccessPii(text: string): string {
  return text.replace(IPV4, "[ip]");
}

/** Mask SQL string literals + slow-query User@Host — call ONLY on mariadb-source lines. */
export function maskMariadbPii(text: string): string {
  return text
    .replace(MARIADB_USER_HOST, "$1[redacted]")
    .replace(SQL_STRING_LITERAL, "'[redacted]'");
}
