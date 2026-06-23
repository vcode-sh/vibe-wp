# Control Panel — Feature #1: Proper Logs (design)

**Date:** 2026-06-23
**Branch:** `control-panel-backend-install`
**Status:** draft — ready for owner review

---

## 1. Context

### What exists today

**API layer (`control-panel/packages/api/src/routers/logs.ts`)**

Two operations:

- `logsRecent` — one-shot: calls `runVibe(site.installDir, "prod", "logsRecent")`, passes stdout through `parseLogLines(stdout, input.source)`, returns `LogLine[]`. Input is `{ siteId, source: "nginx"|"php"|"wp" }`.
- `logsFollow` — streaming SSE: calls `streamVibe(…, "logsFollow")`, yields `{ line, status, done }` events, enforces `GLOBAL_MAX = 8` concurrent streams and `PER_USER_MAX = 3` per user, kills the process group on disconnect.

**Core bridge (`control-panel/packages/api/src/core-bridge/exec.ts`)**

`VIBE_OPS` defines both ops:

```ts
logsRecent: { argv: ["logs-recent"], stream: false },
logsFollow: { argv: ["logs"], stream: true },
```

Neither has `takesArg: true`, so no extra arguments are passed today. `buildVibeArgv` enforces this — any attempt to pass args throws.

**Privilege boundary (`bin/vibe-panel-run`)**

`OP_ALLOWLIST` includes `logs-recent` and `logs`. `validate_arg` is called for any non-special op args; `FLAG_ALLOWLIST` covers `--local-only --yes --json --no-notify`. No service-selection argument is currently anticipated.

**Shell ops (`bin/vibe`)**

```sh
logs)        vibe_compose logs -f --tail=200 "$@" ;;
logs-recent) vibe_compose logs --no-color --timestamps --tail=200 "$@" ;;
```

Both pass `"$@"` through to `docker compose logs` — so `docker compose logs nginx --tail=500` would already work at the shell level; the panel simply never sends arguments today.

**Parser (`control-panel/packages/api/src/core-bridge/parse.ts`)**

`parseLogLines(stdout, source)` splits on `\n`, slices the last 200 lines, parses the `docker compose logs --timestamps` format via:

```
/^([a-zA-Z0-9_-]+?)-\d+\s+\|\s+(\d{4}-…Z)\s*(.*)/
```

Maps service names to `LogLine["source"]` (`nginx|php|wp|system`) via `svcToSource()`. Continuation lines (stack traces, multi-line PHP errors) carry forward `prevSource`/`prevWhen`.

**Current `LogLine` type (`contract.ts`)**

```ts
interface LogLine {
  id: string;
  source: "nginx" | "php" | "wp" | "system";
  text: string;
  whenISO: string;
}
```

**UI (`control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx`)**

`LogsPage` toggles between two modes:
- Recent: `useQuery(logsQuery(siteId))` → table with source tabs (`all|nginx|php|wp|system`), badge, time. Client-side filtering across all sources.
- Live: `<LiveLogTail>` → plain `<pre>` of the last 500 lines, auto-scroll, pause-on-scroll-up (via `useAutoScroll`).

`logsQuery` calls `logsRecent` with a hardcoded `source: "nginx"` (the source filter is currently applied client-side, but the API call uses a fixed value — the UI's tab filtering is entirely client-side).

**Nginx log format (`docker/nginx/nginx.conf.template`)**

```nginx
log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                '$status $body_bytes_sent "$http_referer" '
                '"$http_user_agent" "$http_x_forwarded_for" '
                'cache=$upstream_cache_status';

access_log ${NGINX_ACCESS_LOG_DIRECTIVE};
```

`NGINX_ACCESS_LOG=1` in `.env.example` (default on). `entrypoint.sh` renders this as either `off` or `/var/log/nginx/access.log main`. The `cache=` field (HIT/MISS/BYPASS/EXPIRED) is the key cache-debugging signal.

**App-layer toggleable log sources**

- `NGINX_ACCESS_LOG=0|1` — nginx access log on/off (`.env.example` line 200)
- `WP_DEBUG_LOG=0|1` — WordPress debug log at `wp-content/debug.log` (`.env.example` line 57)
- `MARIADB_SLOW_QUERY_LOG=OFF|ON` + `MARIADB_SLOW_QUERY_LOG_FILE` — MariaDB slow query log (`.env.example` lines 261–262)

**Redaction (`core-bridge/redact.ts`)**

Pattern-based: `SECRET_KEY`, `FLAG_SECRET`, `BEARER`, `AWS_KEY_ID`. Applied to every line via `redact()` in `spawnStream` (streaming) and `runVibe` (one-shot). Does not currently have patterns for IP addresses, SQL query literals, or DSN credentials embedded in slow-query log lines.

**Role model (`procedures.ts`)**

Three roles: `viewer`, `operator`, `admin`. `protectedProcedure` = any authenticated user. `adminProcedure` gates admin-only ops (e.g. `siteDebugSet`).

---

## 2. Decisions (settled)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Extend the existing two-op pattern; do not build a log pipeline or add a `grep` op | Keeps the host surface minimal; all filtering stays in the router |
| D2 | `service` is a fixed enum, not a free string | Closes shell injection; prevents enumerating containers |
| D3 | `tail` is a fixed enum of safe bounded integers (100/500/2000) | Prevents unbounded memory usage; no arbitrary tail depth |
| D4 | Server-side search/filter (regex/substring) applied in router before yielding | No grep op on the host; filter is in TypeScript, unit-testable |
| D5 | Access log and slow-query log surface as first-class sources with toggle support | These are where cache-hit debugging and DB perf signals live |
| D6 | `logsExport` is bounded (2000 lines), redacted, streamed as a file download | Reuses existing redaction; bounded prevents OOM |
| D7 | Access log / PII (IPs, user agents, referers) gates behind `adminProcedure` | GDPR: IPs are personal data; viewers should not see raw access logs |
| D8 | The cross-cutting rule: new arg → `VIBE_OPS` `takesArg` + `FLAG_ALLOWLIST` or fixed enum + wrapper re-validation | Every argument must clear three gates: exec.ts, vibe-panel-run, bin/vibe |
| D9 | `mariadb` source maps slow-query log container output; `access` source maps nginx access.log lines | Naming chosen to be self-explanatory to WordPress site owners |
| D10 | `redact.ts` is extended for new PII/secret patterns before the feature ships | Slow-query logs can contain full SQL with values; access logs contain IPs |

---

## 3. Architecture & components

### 3.1 The cross-cutting rule for new args

Every new argument must clear three gates in sequence. Adding `service` and `tail` serves as the canonical example:

```
1. exec.ts VIBE_OPS
   logsRecent: { argv: ["logs-recent"], stream: false, takesArg: true }
   logsFollow: { argv: ["logs"],        stream: true,  takesArg: true }
   logsExport: { argv: ["logs-recent"], stream: false, takesArg: true }

2. bin/vibe-panel-run OP_ALLOWLIST / FLAG_ALLOWLIST / validate_arg
   - Add service enum tokens to FLAG_ALLOWLIST, or
   - Add a dedicated validate_logs_args() that checks service + tail are
     from the fixed enum sets before passing through.
   - (Flag-style args like --tail=500 would need FLAG_ALLOWLIST; positional
     args like "nginx 500" go through validate_arg's metachar guard.)
   CHOSEN APPROACH: positional args; validate_logs_args() at the wrapper.

3. bin/vibe logs / logs-recent
   - Already passes "$@" to docker compose logs, so a service name and
     --tail=N reach Docker without further changes.
   - Re-validate inside bin/vibe too (defense-in-depth): check $1 is in
     the service enum and $2 (if present) is --tail=N with N in {100,500,2000}.
```

Arg shapes:
```
logsRecent / logsFollow / logsExport with service + tail:
  argv = ["logs-recent", "<service>", "--tail=<N>"]
  e.g.  ["logs-recent", "nginx",     "--tail=500"]
        ["logs-recent", "all",        "--tail=2000"]   # "all" = no service filter = default
        ["logs",        "php",        "--tail=200"]
```

`"all"` maps to passing no service token to `docker compose logs` (full output), identical to today's behavior.

### 3.2 Shell layer changes (`bin/vibe`)

```sh
logs)
  # service is optional positional arg 1; --tail=N is optional arg 2.
  _svc="${1:-}"
  _tail="${2:---tail=200}"
  _validate_logs_args "$_svc" "$_tail"
  if [ -n "$_svc" ] && [ "$_svc" != "all" ]; then
    vibe_compose logs -f "$_tail" "$_svc"
  else
    vibe_compose logs -f "$_tail"
  fi
  ;;
logs-recent)
  _svc="${1:-}"
  _tail="${2:---tail=200}"
  _validate_logs_args "$_svc" "$_tail"
  if [ -n "$_svc" ] && [ "$_svc" != "all" ]; then
    vibe_compose logs --no-color --timestamps "$_tail" "$_svc"
  else
    vibe_compose logs --no-color --timestamps "$_tail"
  fi
  ;;
```

`_validate_logs_args()` in `bin/vibe` (defense-in-depth):
```sh
_validate_logs_args() {
  _s="${1:-all}"
  _t="${2:---tail=200}"
  case "$_s" in
    all|nginx|php|wordpress|wp|cron|mariadb|redis) : ;;
    *) echo "invalid service: $_s" >&2; exit 1 ;;
  esac
  case "$_t" in
    --tail=100|--tail=200|--tail=500|--tail=2000) : ;;
    *) echo "invalid tail: $_t" >&2; exit 1 ;;
  esac
}
```

Note: `docker compose logs <service>` uses the Compose **service name** (nginx, wordpress, mariadb, redis, cron, wp), not a panel-level alias. The `mariadb` service name is what the stack uses.

### 3.3 Privilege wrapper changes (`bin/vibe-panel-run`)

Add `validate_logs_args()` at the root boundary, called for both `logs` and `logs-recent` ops:

```sh
SERVICE_ENUM="all nginx php wordpress wp cron mariadb redis"
TAIL_ENUM="--tail=100 --tail=200 --tail=500 --tail=2000"

validate_logs_args() {
  svc="${1:-all}"
  tail="${2:---tail=200}"
  _ok=0
  for s in $SERVICE_ENUM; do [ "$svc" = "$s" ] && _ok=1 && break; done
  [ "$_ok" = "1" ] || die "invalid service for logs op: $svc"
  _ok=0
  for t in $TAIL_ENUM; do [ "$tail" = "$t" ] && _ok=1 && break; done
  [ "$_ok" = "1" ] || die "invalid tail for logs op: $tail"
}
```

In the case block, for `logs` and `logs-recent` ops, call `validate_logs_args "$@"` instead of the generic `validate_arg` loop.

Also add `--tail=100 --tail=200 --tail=500 --tail=2000` to `FLAG_ALLOWLIST` (covers the general validate_arg path as well, for defense-in-depth).

### 3.4 `exec.ts` changes

```ts
export const VIBE_OPS = {
  // ... existing ...
  logsRecent: { argv: ["logs-recent"], stream: false, takesArg: true },
  logsFollow: { argv: ["logs"],        stream: true,  takesArg: true },
  logsExport: { argv: ["logs-recent"], stream: false, takesArg: true }, // new
} as const;
```

`logsExport` reuses `logs-recent` on the host (one-shot, bounded), but the router applies an export-specific line cap and streams the result as a file response rather than a `LogLine[]`.

### 3.5 Router changes (`logs.ts`)

**New input schemas**

```ts
const LOG_SERVICE = z.enum(["nginx", "php", "wp", "mariadb", "redis", "access", "all"]);
const LOG_TAIL    = z.enum(["100", "500", "2000"]);

// Panel-level service → docker compose service name mapping
const panelToDockerService: Record<string, string | null> = {
  nginx:   "nginx",
  php:     "wordpress",
  wp:      "wp",       // includes cron (via cron service)
  mariadb: "mariadb",
  redis:   "redis",
  access:  "nginx",    // nginx access.log — same container, different post-filter
  all:     null,       // no service filter
};
```

Note: `access` is a panel UI concept (nginx access lines), not a separate container. The distinction from `nginx` (which shows PHP-FPM-proxied nginx error lines) is applied in the router's post-filter on the `cache=` field or nginx access.log format. See §3.6.

**`logsRecent` extended**

```ts
logsRecent: operatorProcedure   // was protectedProcedure
  .input(z.object({
    siteId:  z.string(),
    service: LOG_SERVICE.default("all"),
    tail:    LOG_TAIL.default("500"),
    filter:  z.string().max(200).optional(),  // substring or regex
  }))
  .handler(async ({ input }): Promise<LogLine[]> => {
    const site = await findSite(input.siteId);
    if (!site) return [];
    const dockerSvc = panelToDockerService[input.service] ?? null;
    const args: string[] = [];
    if (dockerSvc) args.push(dockerSvc);
    args.push(`--tail=${input.tail}`);
    const { stdout } = await runVibe(site.installDir, "prod", "logsRecent",
      { args });
    let lines = parseLogLines(stdout, mapServiceToSource(input.service));
    lines = applySourceFilter(lines, input.service);
    if (input.filter) lines = applyTextFilter(lines, input.filter);
    return lines.slice(-Number(input.tail));
  }),
```

**`logsFollow` extended**

```ts
logsFollow: operatorProcedure   // was protectedProcedure
  .input(z.object({
    siteId:  z.string(),
    service: LOG_SERVICE.default("all"),
    tail:    LOG_TAIL.default("200"),
    filter:  z.string().max(200).optional(),
  }))
  // ...same concurrency cap logic...
  .handler(async function* ({ input, context }) {
    // ... slot acquire ...
    const dockerSvc = panelToDockerService[input.service] ?? null;
    const args: string[] = [];
    if (dockerSvc) args.push(dockerSvc);
    args.push(`--tail=${input.tail}`);
    const { proc, lines } = streamVibe(site.installDir, "prod", "logsFollow",
      { args });
    try {
      for await (const rawLine of lines) {
        if (!rawLine.length) continue;
        // Server-side filter before yielding — keeps wire traffic low
        if (input.filter && !matchesFilter(rawLine, input.filter)) continue;
        if (input.service === "access" && !isAccessLine(rawLine)) continue;
        yield { line: rawLine, status: "running", done: false };
      }
      yield { line: "", status: "succeeded", done: true };
    } finally {
      // ... slot release + proc.kill() ...
    }
  }),
```

**New `logsExport` op**

```ts
logsExport: adminProcedure    // admin-only: bounded redacted download
  .input(z.object({
    siteId:  z.string(),
    service: LOG_SERVICE.default("all"),
    filter:  z.string().max(200).optional(),
  }))
  .handler(async ({ input }): Promise<{ lines: LogLine[]; filename: string }> => {
    const site = await findSite(input.siteId);
    if (!site) return { lines: [], filename: "logs.txt" };
    const dockerSvc = panelToDockerService[input.service] ?? null;
    const args: string[] = [];
    if (dockerSvc) args.push(dockerSvc);
    args.push("--tail=2000");   // hard export cap
    const { stdout } = await runVibe(site.installDir, "prod", "logsExport",
      { args, timeoutMs: 30_000 });
    let lines = parseLogLines(stdout, mapServiceToSource(input.service));
    lines = applySourceFilter(lines, input.service);
    if (input.filter) lines = applyTextFilter(lines, input.filter);
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    return {
      lines: lines.slice(-2000),
      filename: `logs-${input.service}-${ts}.txt`,
    };
  }),
```

The client renders the returned `LogLine[]` as newline-separated text and triggers a browser download (no streaming; the 2000-line cap keeps payload bounded).

### 3.6 `parse.ts` changes

**Extend `LogLine["source"]`**

```ts
// contract.ts
interface LogLine {
  id:      string;
  source:  "nginx" | "php" | "wp" | "system" | "mariadb" | "redis" | "access";
  text:    string;
  whenISO: string;
  severity?: "error" | "warn" | "info" | "debug";  // new, optional
}
```

**Extend `svcToSource()`**

```ts
function svcToSource(svc: string): LogLine["source"] {
  const s = svc.toLowerCase();
  if (s === "nginx")                    return "nginx";
  if (s === "wordpress" || s.startsWith("php")) return "php";
  if (s === "wp" || s === "cron" || s.startsWith("wp-")) return "wp";
  if (s === "mariadb" || s === "db")    return "mariadb";
  if (s === "redis")                    return "redis";
  return "system";
}
```

**Add `parseSeverity(text)`**

```ts
function parseSeverity(text: string): LogLine["severity"] {
  const t = text.toLowerCase();
  if (/\b(error|fatal|crit|alert|emerg)\b/.test(t)) return "error";
  if (/\b(warn|warning|notice)\b/.test(t))           return "warn";
  if (/\b(debug)\b/.test(t))                         return "debug";
  return "info";
}
```

Applied per-line in `parseLogLines` (on the `text` field after stripping the Compose prefix). Callers that don't need severity ignore the field; the UI uses it for color coding.

**`applySourceFilter(lines, service)`** — router helper (not in parse.ts)

When `service === "access"`: keep only lines whose `text` matches the nginx access log format (`/^\d{1,3}\.\d{1,3}…` or `cache=` field). This is the router-level distinction between `nginx` (error log) and `access` (access log). All access lines are delivered from the nginx container; the router post-filters to the right format.

**`applyTextFilter(lines, filter)`** — router helper

```ts
function applyTextFilter(lines: LogLine[], filter: string): LogLine[] {
  let re: RegExp | null = null;
  try { re = new RegExp(filter, "i"); } catch { /* treat as literal */ }
  return lines.filter(l =>
    re ? re.test(l.text) : l.text.toLowerCase().includes(filter.toLowerCase())
  );
}
```

Applied server-side in both `logsRecent` and `logsFollow` (live: filter before yielding).

### 3.7 `redact.ts` extensions

Three new patterns must be added before any new sources are exposed:

**1. IP address redaction (access log PII, GDPR)**
```ts
// IPv4 — only in access-log-shaped contexts (after "cache=" field), but for
// safety redact any address that looks like a real client IP in log output.
// Guard: only mask when in a field position (leading or after whitespace/quote).
const CLIENT_IP = /(?<=^|[\s"])(\d{1,3}\.){3}\d{1,3}(?=[\s\-"])/g;
```
Applied only when `source === "access"` (or always, conservatively). Owner decision §8 O3.

**2. SQL literal redaction (slow-query log)**
MariaDB slow-query log lines begin with `# Query_time:` metadata rows and then the raw SQL. SQL `WHERE` clauses can contain user-supplied values.
```ts
// Redact string literals in SQL: single-quoted values
const SQL_STRING_LITERAL = /'[^']{0,500}'/g;
// Redact numeric literals after = or IN(...) — conservative, not perfect
const SQL_NUMERIC_VALUE  = /(?<=[=<>,(]\s*)\d+(?=[\s,);])/g;
```

**3. DSN / MariaDB connection lines (slow-query log)**
Slow-query logs can include `# User@Host:` lines with credentials in some configurations. The existing `SECRET_KEY` pattern covers `PASSWORD=xxx` forms; add:
```ts
const MARIADB_USER_HOST = /(# User@Host:\s*)(\S+)\[(\S+)\]\s*@\s*\S+/g;
// replace: keep "# User@Host: [redacted] @ [redacted]"
```

These additions are isolated in `redact.ts` and covered by unit tests before any new source is exposed to the UI.

---

## 4. Security & redaction

### 4.1 Existing guarantees (unchanged)

- Every line from `spawnStream` passes through `redact()` before leaving the server process. This covers `SECRET_KEY`, `FLAG_SECRET`, `BEARER`, `AWS_KEY_ID` patterns.
- `buildVibeArgv` rejects flag-like extra args unless `takesArg` is true.
- The `vibe-panel-run` wrapper revalidates op, env, and args at the root boundary before exec. A compromised panel process cannot reach ops outside `OP_ALLOWLIST`.
- Concurrency caps (`GLOBAL_MAX=8`, `PER_USER_MAX=3`) prevent stream exhaustion.

### 4.2 New risks and mitigations

**A. Nginx access log — IPs and PII (GDPR)**

The nginx access log format contains: `$remote_addr` (client IP), `$remote_user` (HTTP basic auth user), `$http_referer` (may contain PII query parameters), `$http_user_agent` (fingerprinting data), `$http_x_forwarded_for` (original IP chain).

Under GDPR, client IP addresses are personal data. Mitigations:
- `logsFollow` with `service: "access"` is gated behind `adminProcedure` (not `operatorProcedure`). Viewers never see raw access lines.
- `logsExport` is already `adminProcedure`.
- Add `CLIENT_IP` redaction pattern to `redact.ts` — owner decides scope (§8 O3).
- Referer strings with PII query params (e.g. `?email=...`) are harder to auto-redact; document that access logs may contain PII and that the feature is admin-only.

**B. MariaDB slow-query log — SQL literals and credentials**

The slow-query log records full SQL statements. A `WHERE email = 'user@example.com'` or `WHERE password_hash = '...'` appears verbatim. The `SECRET_KEY` redaction pattern (`/PASSWORD/i`) will catch `password =` in SQL too, but not semantic variants (e.g. `WHERE pwd = '...'` would need the `PWD` keyword variant, which the current regex already handles via `\b([A-Z0-9_]*(?:PASSWORD|…|PWD|…)[A-Z0-9_]*)`.

Additional mitigations:
- Add `SQL_STRING_LITERAL` redaction pattern — aggressive but safe for logs.
- Gate slow-query source behind `adminProcedure`.
- Document: slow-query log may contain user PII. The operator should confirm slow-query log is only on in non-production or for short diagnostic windows.

**C. WordPress debug.log — PHP errors with variable dumps**

PHP errors can include `var_dump()` output, stack frames showing `$_POST` values, and superglobal dumps. The existing `SECRET_KEY` and `FLAG_SECRET` patterns catch labeled secrets. Variable dumps in general are harder.

Mitigation: `wp` source is already accessible to operators (not admin-only). Keep this as-is. Document that `WP_DEBUG_LOG` should be off in production except for active debugging sessions. The existing `siteDebugSet` flow enforces this as a toggle (not a permanent on state).

**D. Service enum injection**

Docker service names passed to `docker compose logs <service>` are from a fixed enum. The shell wrapper's `_validate_logs_args` and `vibe-panel-run`'s `validate_logs_args` both enforce the enum. The panel-to-docker mapping in the router never uses user input directly in a shell command.

**E. Filter regex ReDoS**

The `filter` field is applied in TypeScript (not on the host). `max(200)` on the input limits length. The `try/catch` around `new RegExp(filter)` prevents crashes. For additional safety, consider a timeout wrapper around regex application on large line sets, but this is likely over-engineering for a 200-char filter on 2000 lines.

**F. Export size bounding**

`logsExport` hard-caps at `--tail=2000` on the host command and `slice(-2000)` in the router. The result is a flat `LogLine[]` (not streamed). At ~200 bytes/line worst case, 2000 lines = ~400 KB — well within a single API response.

---

## 5. UI surface

### 5.1 Logs page layout

```
┌─ Logs ─────────────────────────────────────────────[ Go live / Stop live ]──────┐
│                                                                                   │
│  Source tabs: [ nginx ] [ php ] [ wp ] [ mariadb ] [ redis ] [ access ] [ all ]  │
│                                                                                   │
│  [ 🔍 Filter… ]  [ 100 / 500 / 2000 ]  [ ↓ Download ]   (admin: access + export)│
│                                                                                   │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │ HH:MM:SS  [badge]  log line text                               severity   │  │
│  │ HH:MM:SS  [badge]  log line text                                          │  │
│  │ ...                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                    (auto-scroll)  │
│  Live mode: [ Pause / Resume ]  "Streaming nginx · 23 lines/min"                 │
└───────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Component breakdown

**`LogsPage` (`logs.tsx`)** — route component. Owns: `service`, `tail`, `tailing`, `filter`, `paused` state. Renders `<LogsToolbar>` + either `<RecentLogs>` or `<LiveLogTail>` (extended).

**`<LogsToolbar>`** — source tabs, tail selector, filter input, download button (admin-gated). A thin row of controls above the log pane. Source tabs replace the current `SOURCES` constant; new sources add `mariadb`, `redis`, `access`.

**`<RecentLogs>` (updated)** — fetches `logsRecent` with `{ siteId, service, tail, filter }`. Renders the table with severity color coding. `source` tab switching triggers a re-fetch (not client-side filter), since source now affects the host command.

**`<LiveLogTail>` (extended)** — accepts `{ siteId, service, tail, filter, active, paused }`. When `paused`, stops calling `client.logsFollow` (SSE teardown). When `active && !paused`, streams. Severity coloring on lines. "Waiting for log lines…" → "Paused. Resume to continue tailing."

**Severity coloring** (CSS classes only, no new components):
- `error`/`fatal`: `text-destructive` (red)
- `warn`/`warning`: `text-amber-500`
- `info`: `text-muted-foreground` (default)
- `debug`: `text-muted-foreground/60` (dimmer)

**Download** (`logsExport`): admin-only button. On click, calls `client.logsExport(...)`, formats lines as `WHEN\tSOURCE\tTEXT\n`, creates a `Blob`, triggers `<a download>` click. No streaming required.

**Access log toggle** — The `access` source tab is rendered but shows a "Access log is off. Enable it in Settings → Debug." state when `NGINX_ACCESS_LOG=0`. The panel already reads `WP_DEBUG_LOG` via the `env` op; similarly read `NGINX_ACCESS_LOG` to gate the tab. Alternatively, surface an "Enable" button that fires the existing settings flow.

**Debug log panel toggles** — These already exist via `siteDebugSet` (`settings.ts`). The Logs page links to Settings → Debug for enabling slow-query and debug.log. No new toggle UI lives on the Logs page.

### 5.3 Cache-hit debugging (access log)

When `service === "access"` and the access log is enabled, the `cache=` field appears at the end of each line (e.g. `cache=HIT`, `cache=MISS`, `cache=BYPASS`). The log table can optionally extract and badge this field. This is a stretch goal (see §6 out-of-scope).

---

## 6. Scope / out-of-scope (YAGNI)

### In scope

- Service selector enum (`nginx|php|wp|mariadb|redis|access|all`) for `logsRecent` and `logsFollow`
- Tail size selector (`100|500|2000`)
- Server-side text filter (substring/regex) in router, not on host
- `logsExport` op (admin-only, 2000-line cap, redacted, browser download)
- `redact.ts` extensions for IP, SQL literal, MariaDB user@host
- `parseLogLines` extended for `mariadb`/`redis` source types
- `severity` field on `LogLine`
- UI: source tabs, filter input, tail selector, severity coloring, pause/resume live tail, download button (admin-gated)
- Access log and slow-query log source gated behind `adminProcedure`

### Out of scope (explicit YAGNI)

- **Dedicated log pipeline** (no separate log aggregator, no syslog, no persistent log storage in the panel DB)
- **`grep` host op** — filter stays in TypeScript
- **Log rotation** — not the panel's job; Docker handles container log rotation
- **Structured log parsing** beyond the `cache=` severity extraction (no JSON log format)
- **Cache-hit badge extraction** from access log lines (stretch goal, defer)
- **Real-time log metrics** (requests/min, error rate graphs) — separate feature
- **Multi-site log merge** — each site is isolated
- **Log retention policies** — out of scope for this feature
- **nginx `error.log` vs `access.log` split at the container level** — the distinction is handled by post-filtering in the router; no nginx config change needed
- **WP-CLI log commands** — `wp` source already covers WP activity from the cron/wp containers

---

## 7. Phased build outline

All steps are independently mergeable. The "cross-cutting rule" (§3.1) applies to every step that touches args.

### Phase 1 — Redact extensions + parse extensions (foundation, no behavior change)

**Step 1.1** — `redact.ts`: Add `CLIENT_IP`, `SQL_STRING_LITERAL`, `MARIADB_USER_HOST` patterns. Add unit tests in `redact.test.ts`. Ship independently (safe: only makes redaction more aggressive).

**Step 1.2** — `parse.ts`: Add `mariadb`/`redis` to `svcToSource()`. Add `parseSeverity()`. Extend `LogLine` in `contract.ts` with `severity?` and add `"mariadb" | "redis" | "access"` to `source`. Update `parseLogLines` to populate `severity`. Update `parse.test.ts`.

**Step 1.3** — `exec.ts`: Set `takesArg: true` on `logsRecent` and `logsFollow`. Add `logsExport` op. No behavior change (args still empty at call sites).

### Phase 2 — Shell + wrapper arg validation

**Step 2.1** — `bin/vibe`: Add `_validate_logs_args()`. Update `logs)` and `logs-recent)` cases to call it and pass service + tail through. Manual test: `./bin/vibe prod logs-recent nginx --tail=500` returns nginx lines; `./bin/vibe prod logs-recent badservice --tail=500` exits 1.

**Step 2.2** — `bin/vibe-panel-run`: Add `validate_logs_args()`. Add `--tail=100 --tail=200 --tail=500 --tail=2000` to `FLAG_ALLOWLIST`. Update the `logs` and `logs-recent` case blocks to call it. Update comment block listing OP_ALLOWLIST to note the new arg validation.

### Phase 3 — Router extension

**Step 3.1** — `logs.ts`: Add `LOG_SERVICE`, `LOG_TAIL` schemas. Add `panelToDockerService` map. Update `logsRecent` input schema and handler (service, tail, filter). Upgrade from `protectedProcedure` to `operatorProcedure`. Add `applyTextFilter()` helper. Update `logsRouter` type. Unit-test the helper functions.

**Step 3.2** — `logs.ts`: Update `logsFollow` input schema and handler (service, tail, filter, server-side filter before yield). Add concurrency test case for access log streams.

**Step 3.3** — `logs.ts`: Add `logsExport` handler (`adminProcedure`, 2000-line cap). Wire into the router. Unit-test the bounded line cap.

### Phase 4 — UI

**Step 4.1** — `logs.tsx`: Add `service`, `tail`, `filter`, `paused` state. Add `<LogsToolbar>` with source tabs (7 tabs), tail dropdown, filter input. Wire `logsQuery` to pass `{ service, tail, filter }`. The live tail still works as before (no service arg yet to live tail — add in step 4.3).

**Step 4.2** — `logs.tsx`: Add severity color classes to `RecentLogs` table. Add download button (admin-gated via session role check). Implement `logsExport` call + browser download trigger.

**Step 4.3** — `live-log-tail.tsx`: Accept `service`, `tail`, `filter`, `paused` props. Pass args to `client.logsFollow`. Add Pause/Resume button. Add "Paused" state rendering.

**Step 4.4** — `logs.tsx`: Add `access` tab visibility gated on `NGINX_ACCESS_LOG` env value (read via existing `env` op or a cached query). Add "Access log is off" empty state with link to Settings.

### Phase 5 — VPS validation

**Step 5.1** — SSH to `root@178.104.10.126` (see CLAUDE.md). Confirm `./bin/vibe prod logs-recent nginx --tail=100` returns nginx lines. Confirm `./bin/vibe prod logs-recent badservice --tail=100` exits 1. Confirm `./bin/vibe prod logs-recent nginx badtail` exits 1.

**Step 5.2** — Enable `MARIADB_SLOW_QUERY_LOG=ON` temporarily; confirm `logs-recent mariadb` surfaces slow-query lines and that SQL literals are redacted in panel output.

**Step 5.3** — Enable `NGINX_ACCESS_LOG=1`; confirm `logs-recent access` surfaces access lines; confirm IP addresses are redacted if CLIENT_IP redaction is enabled.

**Step 5.4** — Run `logsExport` end-to-end from the panel UI; confirm file download, line count ≤ 2000, no secrets visible.

---

## 8. Open decisions for the owner

**O1 — Default tail size**
What should the default be for `logsRecent`? Today it is 200 (hardcoded in `bin/vibe`). The spec proposes `500` as the API default, `200` for live tail, `2000` for export. Confirm or adjust. Changing the shell default from 200 requires a minor `bin/vibe` edit.

**O2 — `access` source: admin-only vs operator**
The spec gates the nginx access log (`service: "access"`) behind `adminProcedure` on GDPR grounds (IP addresses are personal data). If this is a single-tenant panel where all operators are trusted, operator-level access is acceptable. Confirm the access level. Note: GDPR applies regardless of who "trusts" whom — if the VPS is EU-hosted or the site has EU visitors, `adminProcedure` is the safer default.

**O3 — IP redaction scope**
Three options for IP redaction in access logs:
- (a) Redact all IPv4 addresses in all log output globally (`redact.ts` always-on).
- (b) Redact IPs only when `source === "access"` (router-level, not in `redact.ts`).
- (c) No IP redaction — rely on admin-only gating to satisfy GDPR.

Recommended: (b). Option (a) is safer but may over-redact legitimate log content (e.g. "connecting to 192.168.1.1"). Option (c) is weakest. Confirm.

**O4 — `mariadb`/`redis` operator or admin**
The slow-query log contains SQL with potential PII. Redis logs are low-risk (key names, no values). Proposed: `mariadb` source behind `adminProcedure`; `redis` source accessible to `operatorProcedure`. Confirm.

**O5 — Log rotation / Docker log driver**
Docker's default log driver (`json-file`) caps log file size via `max-size` and `max-file` in the Compose config. These are not currently configured. As slow-query logging and access logging can generate significant volume, does the owner want to add `logging.options.max-size` and `logging.options.max-file` to the Compose service definitions as part of this feature, or defer?

**O6 — `access` source: extract `cache=` badge**
The access log contains `cache=HIT|MISS|BYPASS|EXPIRED`. This is the primary signal for cache-hit debugging. Should the Logs page parse this field out of access lines and display it as a badge (e.g. a green HIT / red MISS badge per row)? This is a small parser addition but adds a new UI concept. Recommend: yes, because it's the reason access log is useful. But mark as stretch within Phase 4.

**O7 — WP debug.log as a separate file source (not via docker compose logs)**
`WP_DEBUG_LOG=1` writes to `wp-content/debug.log`, a host file inside the `content/` mount, not to container stdout. `docker compose logs wordpress` will NOT include debug.log entries — those go to the PHP error log, which Docker captures, only if `error_log = /proc/1/fd/2` is set in `php.ini`. Confirm: is debug.log currently piped to container stdout (and thus visible via `docker compose logs`)? If not, surfacing it requires either a `tail -f` on the file (new shell op) or configuration of PHP to write errors to stderr. This is a significant scope addition; recommend deferring and surfacing WP PHP errors through the `php` source instead.

---

## 9. Testing & validation

### Unit tests

| Test | File | What to verify |
|------|------|----------------|
| `redact` new patterns | `redact.test.ts` | IP masked, SQL literal masked, MariaDB user@host masked |
| `parseSeverity` | `parse.test.ts` | error/warn/info/debug classified correctly |
| `svcToSource` extension | `parse.test.ts` | mariadb → "mariadb", redis → "redis" |
| `applyTextFilter` | `logs.test.ts` (new) | substring match, regex match, invalid regex falls back to literal |
| `applySourceFilter` | `logs.test.ts` | access filter passes only access-format lines |
| `logsExport` line cap | `logs.test.ts` | 2001 input lines → 2000 output lines |
| `buildVibeArgv` with args | `exec.test.ts` | logsRecent with ["nginx", "--tail=500"] produces correct argv |

### Integration / shell tests

- `bin/vibe prod logs-recent nginx --tail=100` — exits 0, stdout non-empty
- `bin/vibe prod logs-recent badservice --tail=100` — exits 1
- `bin/vibe prod logs-recent nginx bad` — exits 1
- `bin/vibe prod logs nginx --tail=100 2>&1 | head -5 && sleep 1` — exits after kill signal

### VPS validation checklist (Phase 5)

- [ ] Service filter: only nginx lines when `service=nginx`
- [ ] Tail: `tail=100` returns ≤ 100 lines
- [ ] Bad service rejected at wrapper level (test with direct sudo invocation)
- [ ] Slow-query log lines redacted (SQL literals not visible)
- [ ] Access log IPs redacted (if O3=b chosen)
- [ ] Export file download: filename, line count, no secrets
- [ ] Concurrency cap still holds after extension (8 global, 3 per user)

---

## 10. References

| File | Role |
|------|------|
| `control-panel/packages/api/src/routers/logs.ts` | Current `logsRecent`/`logsFollow` ops, concurrency caps |
| `control-panel/packages/api/src/core-bridge/exec.ts` | `VIBE_OPS`, `buildVibeArgv`, `runVibe`, `streamVibe`, `spawnStream` |
| `control-panel/packages/api/src/core-bridge/parse.ts` | `parseLogLines`, `svcToSource`, `COMPOSE_LINE` regex |
| `control-panel/packages/api/src/core-bridge/redact.ts` | `redact()`, `SECRET_KEY`, `FLAG_SECRET`, `BEARER`, `AWS_KEY_ID` |
| `control-panel/packages/api/src/contract.ts` | `LogLine`, `StreamEvent` types |
| `control-panel/packages/api/src/procedures.ts` | `protectedProcedure`, `operatorProcedure`, `adminProcedure` |
| `control-panel/packages/api/src/routers/settings.ts` | `siteDebugSet` — existing debug toggle (model for access/slow-query toggle) |
| `control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx` | Current logs page, `RecentLogs`, `LogsPage` |
| `control-panel/web/src/components/patterns/live-log-tail.tsx` | Current `<LiveLogTail>`, `useLiveStream`, `useAutoScroll` |
| `bin/vibe` | `logs)` / `logs-recent)` shell dispatch, `"$@"` passthrough |
| `bin/lib/vibe.sh` | `vibe_compose()` wrapper |
| `bin/vibe-panel-run` | `OP_ALLOWLIST`, `FLAG_ALLOWLIST`, `validate_op`, `validate_arg` |
| `docker/nginx/nginx.conf.template` | `log_format main … cache=$upstream_cache_status`, `NGINX_ACCESS_LOG_DIRECTIVE` |
| `docker/nginx/entrypoint.sh` | `NGINX_ACCESS_LOG` → `NGINX_ACCESS_LOG_DIRECTIVE` rendering |
| `.env.example` lines 57, 200, 261–262 | `WP_DEBUG_LOG`, `NGINX_ACCESS_LOG`, `MARIADB_SLOW_QUERY_LOG` defaults |
| `docs/superpowers/specs/2026-06-22-control-panel-live-streaming-design.md` | `useLiveStream` primitive — extended by `<LiveLogTail>` here |
