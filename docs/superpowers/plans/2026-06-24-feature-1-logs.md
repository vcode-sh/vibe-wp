# Feature #1: Proper Logs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the control panel's two fixed-source log ops into a full log surface — per-service selection (nginx / php / wp / mariadb / redis / access / all), bounded tail, server-side filter, severity coloring, FastCGI cache badges, and an admin-only redacted download — without widening the host security model beyond a fixed enum.

**Architecture:** Extend the existing two-op host bridge (`logsRecent`/`logsFollow`) plus a new `logsExport`, each passing two **positional** args `[service, tail]` that clear three gates (exec.ts → bin/vibe-panel-run → bin/vibe). All filtering, severity classification, PII masking, and cache-field extraction happen server-side in TypeScript (unit-testable, no new host op). The UI gains a toolbar (source tabs, tail selector, filter, download) over the existing recent/live panes.

**Tech Stack:** TypeScript, oRPC (Hono), Zod, Vitest (api package), React + TanStack Router/Query (web), POSIX sh (`bin/vibe`, `bin/vibe-panel-run`), Docker Compose.

## Global Constraints

These bind **every** task. Copied from the spec (`docs/superpowers/specs/2026-06-23-feature-1-logs-design.md`) + the owner's locked decisions (2026-06-24).

- **Cross-cutting host rule:** every new panel→host argument clears three gates — `VIBE_OPS` (`takesArg`/argv) in `exec.ts`, `validate_logs_args` in the root-owned `bin/vibe-panel-run`, and `_validate_logs_args` in `bin/vibe` (defense-in-depth). Distrust the panel; re-validate at the root boundary. Env-file-only secrets; `redact()` on all output.
- **No flag-like args cross the bridge.** `buildVibeArgv` (`exec.ts:138-142`) throws on ANY extra arg starting with `-`, even when `takesArg` is true. Tail is therefore passed as a **plain integer string** (`"500"`), and `bin/vibe` constructs `--tail=500` itself. Do NOT pass `--tail=N` as an arg.
- **Service enum (docker compose service names):** `all nginx wordpress cron db redis`. The panel's user-facing sources map to these: `nginx→nginx`, `php→wordpress`, `wp→cron`, `mariadb→db`, `redis→redis`, `access→nginx` (post-filtered), `all→(no service)`.
- **Tail enum:** UI/router offers `100 | 500 | 2000`. Shell+wrapper accept `100 | 200 | 500 | 2000` (200 = live-tail + legacy direct-call default; superset is intentional).
- **RBAC (owner decision):** `access` and `mariadb` sources require **admin**; `nginx php wp redis all` require **operator**. `logsExport` is **admin-only** (all sources). Gating for `access`/`mariadb` is enforced *inside* the operator-procedure handler by role check, since the procedure middleware is fixed at definition.
- **PII masking (owner decision O3=b):** mask client IPs only in **access context** (any line where `isAccessLine(text)` is true), not globally. Mask SQL string literals + `# User@Host:` only on `mariadb`-source lines. Masking is additive on top of the always-on secret `redact()`.
- **Log rotation (owner decision O5):** add `logging: { driver: json-file, options: { max-size: "10m", max-file: "3" } }` to each long-running Compose service.
- **Cache badge (owner decision O6):** extract `cache=HIT|MISS|BYPASS|EXPIRED|STALE|UPDATING|REVALIDATED` from access lines into `LogLine.cache` and badge it in the UI.
- **MariaDB slow-query log is OUT OF SCOPE for #1** (it writes to a file, not container stdout; routing it to a stdout sink is a Docker-image change deferred to feature #5). The `mariadb` source surfaces the MariaDB **error log** (on container stderr). SQL masking is still applied defensively.
- **WP debug.log file tail is OUT OF SCOPE** (spec O7). PHP-FPM has `catch_workers_output = yes`, so WP PHP errors already reach `docker compose logs wordpress` via the `php` source.
- **Concurrency caps unchanged:** `logsFollow` keeps `GLOBAL_MAX = 8`, `PER_USER_MAX = 3`.
- **Tests:** api package uses **Vitest** (`vitest run`). Mirror the imports/structure of the neighboring `*.test.ts` file you are extending. Run `cd control-panel && bun run typecheck && bun run lint && bun run test` before considering an api/web task done.

---

## File Structure

| File | Responsibility | New/Modify |
|------|----------------|------------|
| `control-panel/packages/api/src/core-bridge/log-pii.ts` | Pure source-specific PII masking + cache extraction + access-line detection | **New** |
| `control-panel/packages/api/src/core-bridge/log-pii.test.ts` | Tests for the above | **New** |
| `control-panel/packages/api/src/contract.ts` | Extend `LogLine` (source union, `severity?`, `cache?`) | Modify |
| `control-panel/packages/api/src/core-bridge/parse.ts` | `svcToSource` (db/redis), `parseSeverity`, `parseLogLines(…, maxLines)` + severity | Modify |
| `control-panel/packages/api/src/core-bridge/parse.test.ts` | Extend for new sources, severity, maxLines | Modify |
| `control-panel/packages/api/src/core-bridge/exec.ts` | `takesArg` on logs ops + new `logsExport` op | Modify |
| `control-panel/packages/api/src/core-bridge/exec.test.ts` | argv with positional args | Modify |
| `control-panel/packages/api/src/routers/logs-helpers.ts` | Schemas, service map, source/text filters, decorate, RBAC gate | **New** |
| `control-panel/packages/api/src/routers/logs-helpers.test.ts` | Tests for the above | **New** |
| `control-panel/packages/api/src/routers/logs.ts` | Wire `logsRecent`/`logsFollow`/`logsExport` to the helpers | Modify |
| `bin/vibe` | `_validate_logs_args` + `logs)`/`logs-recent)` cases | Modify |
| `bin/vibe-panel-run` | `validate_logs_args` + case wiring + comment sync | Modify |
| `compose.yaml` | `logging:` caps on nginx/wordpress/cron/db/redis | Modify |
| `control-panel/web/src/data/types.ts` | Mirror extended `LogLine` | Modify |
| `control-panel/web/src/data/queries.ts` | `logsQuery(siteId, params)` | Modify |
| `control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx` | Toolbar (tabs/tail/filter/download), severity color, cache badge | Modify |
| `control-panel/web/src/components/patterns/live-log-tail.tsx` | `service`/`filter`/`paused` props | Modify |

---

## Task 1: PII masking + cache extraction (`log-pii.ts`)

Pure functions, no wiring. Foundation for the router decorate step.

**Files:**
- Create: `control-panel/packages/api/src/core-bridge/log-pii.ts`
- Test: `control-panel/packages/api/src/core-bridge/log-pii.test.ts`

**Interfaces — Produces:**
- `isAccessLine(text: string): boolean`
- `extractCache(text: string): string | undefined`
- `maskAccessPii(text: string): string`
- `maskMariadbPii(text: string): string`

- [ ] **Step 1: Write the failing test** — `log-pii.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractCache, isAccessLine, maskAccessPii, maskMariadbPii } from "./log-pii";

const ACCESS = '203.0.113.7 - - [24/Jun/2026:10:00:00 +0000] "GET /wp-login.php HTTP/2.0" 200 512 "https://ref.example/x" "Mozilla/5.0" "-" cache=MISS';

describe("isAccessLine", () => {
  it("matches an nginx access line", () => expect(isAccessLine(ACCESS)).toBe(true));
  it("matches by cache= field even without a leading IP", () =>
    expect(isAccessLine('foo "GET / HTTP/1.1" 200 cache=HIT')).toBe(true));
  it("rejects an nginx error line", () =>
    expect(isAccessLine("2026/06/24 10:00:00 [error] 7#7: *1 open() failed")).toBe(false));
});

describe("extractCache", () => {
  it("pulls the cache status", () => expect(extractCache(ACCESS)).toBe("MISS"));
  it("returns undefined when absent", () => expect(extractCache("no cache field")).toBeUndefined());
  it("ignores a dash placeholder", () =>
    expect(extractCache('"GET / HTTP/1.1" 200 cache=-')).toBeUndefined());
});

describe("maskAccessPii", () => {
  it("masks the client IPv4", () => {
    const out = maskAccessPii(ACCESS);
    expect(out).not.toContain("203.0.113.7");
    expect(out).toContain("[ip]");
  });
  it("keeps the rest of the line intact", () =>
    expect(maskAccessPii(ACCESS)).toContain("GET /wp-login.php"));
});

describe("maskMariadbPii", () => {
  it("masks single-quoted SQL string literals", () => {
    const out = maskMariadbPii("SELECT * FROM wp_users WHERE user_email = 'a@b.com'");
    expect(out).not.toContain("a@b.com");
    expect(out).toContain("'[redacted]'");
  });
  it("masks the User@Host slow-query header", () => {
    const out = maskMariadbPii("# User@Host: wp_app[wp_app] @ localhost []");
    expect(out).not.toContain("wp_app[wp_app]");
    expect(out).toContain("[redacted]");
  });
  it("leaves numeric literals alone", () =>
    expect(maskMariadbPii("WHERE id = 42")).toContain("42"));
});
```

- [ ] **Step 2: Run it, verify it fails** — `cd control-panel/packages/api && bunx vitest run src/core-bridge/log-pii.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `log-pii.ts`:**

```ts
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
```

- [ ] **Step 4: Run it, verify it passes** — same command → PASS (10+ assertions).

- [ ] **Step 5: Commit** — `git add control-panel/packages/api/src/core-bridge/log-pii.ts control-panel/packages/api/src/core-bridge/log-pii.test.ts && git commit -m "feat(panel-logs): source-specific PII masking + cache extraction helpers"`

---

## Task 2: parse + contract extensions (sources, severity, maxLines)

**Files:**
- Modify: `control-panel/packages/api/src/contract.ts:85-90`
- Modify: `control-panel/packages/api/src/core-bridge/parse.ts:255-308`
- Test: `control-panel/packages/api/src/core-bridge/parse.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `LogLine` with `source: "nginx"|"php"|"wp"|"system"|"mariadb"|"redis"|"access"`, `severity?: "error"|"warn"|"info"|"debug"`, `cache?: string`; `parseLogLines(stdout, source, maxLines?)`; `parseSeverity(text)`.

- [ ] **Step 1: Extend `LogLine` in `contract.ts`** (replace lines 85-90):

```ts
export interface LogLine {
	id: string;
	source: "nginx" | "php" | "wp" | "system" | "mariadb" | "redis" | "access";
	text: string;
	whenISO: string;
	severity?: "error" | "warn" | "info" | "debug";
	cache?: string;
}
```

- [ ] **Step 2: Write the failing test** — append to `parse.test.ts` (match the file's existing import style):

```ts
describe("svcToSource via parseLogLines", () => {
  const line = (svc: string) =>
    `${svc}-1  | 2026-06-24T10:00:00Z hello world`;
  it("maps db → mariadb", () =>
    expect(parseLogLines(line("db"), "system")[0]?.source).toBe("mariadb"));
  it("maps redis → redis", () =>
    expect(parseLogLines(line("redis"), "system")[0]?.source).toBe("redis"));
  it("maps cron → wp", () =>
    expect(parseLogLines(line("cron"), "system")[0]?.source).toBe("wp"));
});

describe("parseSeverity via parseLogLines", () => {
  const sev = (msg: string) =>
    parseLogLines(`nginx-1  | 2026-06-24T10:00:00Z ${msg}`, "nginx")[0]?.severity;
  it("classifies error", () => expect(sev("PHP Fatal error: boom")).toBe("error"));
  it("classifies warn", () => expect(sev("[warn] something")).toBe("warn"));
  it("classifies debug", () => expect(sev("DEBUG trace here")).toBe("debug"));
  it("defaults to info", () => expect(sev("just a normal line")).toBe("info"));
});

describe("parseLogLines maxLines", () => {
  it("keeps the last maxLines, not a hardcoded 200", () => {
    const stdout = Array.from({ length: 600 }, (_, i) =>
      `nginx-1  | 2026-06-24T10:00:00Z line ${i}`).join("\n");
    expect(parseLogLines(stdout, "nginx", 500)).toHaveLength(500);
    expect(parseLogLines(stdout, "nginx", 2000)).toHaveLength(600);
  });
});
```

- [ ] **Step 3: Run it, verify it fails** — `cd control-panel/packages/api && bunx vitest run src/core-bridge/parse.test.ts` → FAIL.

- [ ] **Step 4: Implement in `parse.ts`** — replace `svcToSource` (lines 256-268) and `parseLogLines` (270-308):

```ts
function svcToSource(svc: string): LogLine["source"] {
	const s = svc.toLowerCase();
	if (s === "nginx") {
		return "nginx";
	}
	if (s === "wordpress" || s.startsWith("php")) {
		return "php";
	}
	if (s === "wp" || s === "cron" || s.startsWith("wp-")) {
		return "wp";
	}
	if (s === "mariadb" || s === "db") {
		return "mariadb";
	}
	if (s === "redis") {
		return "redis";
	}
	return "system";
}

const SEV_ERROR = /\b(error|fatal|crit|critical|alert|emerg)\b/i;
const SEV_WARN = /\b(warn|warning|notice)\b/i;
const SEV_DEBUG = /\bdebug\b/i;

export function parseSeverity(text: string): LogLine["severity"] {
	if (SEV_ERROR.test(text)) {
		return "error";
	}
	if (SEV_WARN.test(text)) {
		return "warn";
	}
	if (SEV_DEBUG.test(text)) {
		return "debug";
	}
	return "info";
}

export function parseLogLines(
	stdout: string,
	source: LogLine["source"],
	maxLines = 2000
): LogLine[] {
	let prevSource: LogLine["source"] = source;
	let prevWhen = "";
	return stdout
		.split("\n")
		.filter((l) => l.trim().length > 0)
		.slice(-maxLines)
		.map((raw, i) => {
			const m = COMPOSE_LINE.exec(raw);
			if (m) {
				const when = m[2] ?? "";
				const lineSource = svcToSource(m[1] ?? "");
				const text = m[3] ?? "";
				prevSource = lineSource;
				prevWhen = when;
				return {
					id: String(i),
					source: lineSource,
					text,
					whenISO: when,
					severity: parseSeverity(text),
				};
			}
			const text = raw.trim();
			return {
				id: String(i),
				source: prevSource,
				text,
				whenISO: prevWhen,
				severity: parseSeverity(text),
			};
		});
}
```

- [ ] **Step 5: Run it, verify it passes** — `bunx vitest run src/core-bridge/parse.test.ts` → PASS (existing + new).

- [ ] **Step 6: Commit** — `git add control-panel/packages/api/src/contract.ts control-panel/packages/api/src/core-bridge/parse.ts control-panel/packages/api/src/core-bridge/parse.test.ts && git commit -m "feat(panel-logs): mariadb/redis sources + severity + configurable parse cap"`

---

## Task 3: exec.ts — positional args on logs ops + `logsExport`

**Files:**
- Modify: `control-panel/packages/api/src/core-bridge/exec.ts:91-92`
- Test: `control-panel/packages/api/src/core-bridge/exec.test.ts`

**Interfaces:**
- Consumes: `buildVibeArgv(siteDir, env, op, extraArgs)` (unchanged signature).
- Produces: `VIBE_OPS.logsRecent/logsFollow/logsExport` all `takesArg: true`.

- [ ] **Step 1: Write the failing test** — append to `exec.test.ts`:

```ts
describe("buildVibeArgv logs ops", () => {
  it("passes positional service + tail for logsRecent", () => {
    expect(buildVibeArgv("/opt/site", "prod", "logsRecent", ["nginx", "500"]))
      .toEqual(["/opt/site/bin/vibe", "prod", "logs-recent", "nginx", "500"]);
  });
  it("passes service + tail for logsFollow", () => {
    expect(buildVibeArgv("/opt/site", "prod", "logsFollow", ["db", "200"]))
      .toEqual(["/opt/site/bin/vibe", "prod", "logs", "db", "200"]);
  });
  it("exposes logsExport mapped to logs-recent", () => {
    expect(buildVibeArgv("/opt/site", "prod", "logsExport", ["all", "2000"]))
      .toEqual(["/opt/site/bin/vibe", "prod", "logs-recent", "all", "2000"]);
  });
  it("still rejects a flag-like arg (tail must be a bare number)", () => {
    expect(() => buildVibeArgv("/opt/site", "prod", "logsRecent", ["nginx", "--tail=500"]))
      .toThrow(/flag-like/);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `cd control-panel/packages/api && bunx vitest run src/core-bridge/exec.test.ts` → FAIL (`logsExport` not a key; logs ops reject args).

- [ ] **Step 3: Implement** — replace lines 91-92 of `exec.ts`:

```ts
		logsRecent: { argv: ["logs-recent"], stream: false, takesArg: true },
		logsFollow: { argv: ["logs"], stream: true, takesArg: true },
		logsExport: { argv: ["logs-recent"], stream: false, takesArg: true },
```

- [ ] **Step 4: Run it, verify it passes** — `bunx vitest run src/core-bridge/exec.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/exec.test.ts && git commit -m "feat(panel-logs): accept positional service+tail args; add logsExport op"`

---

## Task 4: `bin/vibe` — validate + thread service/tail

**Files:**
- Modify: `bin/vibe:96-106` (the `logs)` and `logs-recent)` cases) + add `_validate_logs_args` near the top of the `case` (or in the dispatch helper region around line 58).

**Interfaces:**
- Consumes: positional `$1`=service, `$2`=tail from the panel/installer/human caller.
- Produces: validated `docker compose logs` invocation; exits 1 on bad service/tail.

- [ ] **Step 1: Add `_validate_logs_args` helper** immediately before `case "${command}" in` (after line 57):

```sh
# Defense-in-depth re-validation of logs op args (the root wrapper already
# checked, but bin/vibe must hold even when invoked directly). $1=service,
# $2=tail. Empty args are allowed; defaults are applied by the case body.
_validate_logs_args() {
  case "${1:-all}" in
    all|nginx|wordpress|cron|db|redis) : ;;
    *) echo "vibe: invalid logs service: ${1:-}" >&2; exit 1 ;;
  esac
  case "${2:-200}" in
    100|200|500|2000) : ;;
    *) echo "vibe: invalid logs tail: ${2:-}" >&2; exit 1 ;;
  esac
}
```

- [ ] **Step 2: Replace the `logs)` case (lines 96-101):**

```sh
  logs)
    # No --timestamps: the live tail streams raw lines unparsed. $1=service
    # (or "all"), $2=tail. Validate before touching docker.
    _svc="${1:-all}"
    _tail="${2:-200}"
    _validate_logs_args "$_svc" "$_tail"
    if [ "$_svc" = "all" ]; then
      vibe_compose logs -f "--tail=${_tail}"
    else
      vibe_compose logs -f "--tail=${_tail}" "$_svc"
    fi
    ;;
```

- [ ] **Step 3: Replace the `logs-recent)` case (lines 102-106):**

```sh
  logs-recent)
    # One-shot tail (no -f). --timestamps kept: output is parsed for the table.
    _svc="${1:-all}"
    _tail="${2:-200}"
    _validate_logs_args "$_svc" "$_tail"
    if [ "$_svc" = "all" ]; then
      vibe_compose logs --no-color --timestamps "--tail=${_tail}"
    else
      vibe_compose logs --no-color --timestamps "--tail=${_tail}" "$_svc"
    fi
    ;;
```

- [ ] **Step 4: Manual verification** (local Docker not required — validation path is testable standalone). Run:

```sh
sh -n bin/vibe && echo "syntax ok"
# Bad service rejected:
( command=logs-recent; sh -c 'set -e; svc=badsvc; tail=100; case "$svc" in all|nginx|wordpress|cron|db|redis) : ;; *) exit 1;; esac' ) ; echo "badsvc exit=$?"   # expect exit=1
```
Expected: `syntax ok`, `badsvc exit=1`. (Full `docker compose logs` behavior is verified on the VPS in Task 12.)

- [ ] **Step 5: Commit** — `git add bin/vibe && git commit -m "feat(panel-logs): validate + thread service/tail through bin/vibe logs ops"`

---

## Task 5: `bin/vibe-panel-run` — root-boundary validation for logs args

**Files:**
- Modify: `bin/vibe-panel-run` — add `validate_logs_args()` (near `validate_env_key`, ~line 238) + wire it into the `vibe` case block (line 348-357) + update the OP_ALLOWLIST comment (lines 144-155).

**Interfaces:**
- Consumes: the `logs`/`logs-recent` op with up to two positional args.
- Produces: hard rejection (`die`) of any service/tail outside the fixed enums at the root boundary.

- [ ] **Step 1: Add the validator** after `validate_env_key` (after line 238):

```sh
# `logs` / `logs-recent` take up to two positional args: a service from the
# fixed compose-service enum and a tail depth from the fixed enum. Re-validated
# HERE so a compromised panel cannot tail an arbitrary container or pass an
# unbounded --tail. Mirrors bin/vibe _validate_logs_args and the router enums.
LOG_SERVICE_ENUM="all nginx wordpress cron db redis"
LOG_TAIL_ENUM="100 200 500 2000"
validate_logs_args() {
  [ "$#" -le 2 ] || die "logs op takes at most 2 args (service, tail)"
  if [ "$#" -ge 1 ]; then
    _ok=0
    for s in $LOG_SERVICE_ENUM; do [ "$1" = "$s" ] && _ok=1 && break; done
    [ "$_ok" = 1 ] || die "logs service not allowed: $1"
  fi
  if [ "$#" -ge 2 ]; then
    _ok=0
    for t in $LOG_TAIL_ENUM; do [ "$2" = "$t" ] && _ok=1 && break; done
    [ "$_ok" = 1 ] || die "logs tail not allowed: $2"
  fi
}
```

- [ ] **Step 2: Wire it into the arg re-validation `case` (replace lines 348-357):**

```sh
    case "$op" in
      wp)      validate_wp_args "$@" ;;     # only the 3 exact panel wp forms
      compose) validate_compose_args "$@" ;; # only `compose ps --format json`
      env)     validate_env_key "$@" ;;     # exactly one key, non-secret allowlist
      logs|logs-recent) validate_logs_args "$@" ;; # fixed service + tail enums
      *)
        for a in "$@"; do
          validate_arg "$a"
        done
        ;;
    esac
```

- [ ] **Step 3: Update the comment block** (lines 156-164) — append after the FLAG_ALLOWLIST note:

```sh
# The `logs`/`logs-recent` ops are special-cased: their args are a fixed
# service enum (all nginx wordpress cron db redis) + a fixed tail enum
# (100 200 500 2000), validated by validate_logs_args — NOT the generic
# validate_arg path (which would allow any metachar-free token as a service).
```

- [ ] **Step 4: Verify syntax** — `sh -n bin/vibe-panel-run && echo "syntax ok"` → `syntax ok`.

- [ ] **Step 5: Commit** — `git add bin/vibe-panel-run && git commit -m "feat(panel-logs): root-boundary service+tail validation for logs ops"`

---

## Task 6: Compose log rotation caps (O5)

**Files:**
- Modify: `compose.yaml` — add a `logging:` block to `nginx` (line 122), `wordpress` (182), `cron` (206), `db` (222), `redis` (286). Skip `wp` (ephemeral `run --rm`) and `adminer` (tools profile).

**Interfaces:** none (infra only).

- [ ] **Step 1: Add a YAML anchor** near the top of the `services:` block (so the five services share one definition — DRY). Just under `services:` add:

```yaml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

- [ ] **Step 2: Reference it** — add `logging: *default-logging` as a sibling key under each of `nginx`, `wordpress`, `cron`, `db`, `redis` (indent to match the other keys in each service, e.g. alongside `image:`/`build:`).

- [ ] **Step 3: Validate** — `docker compose -f compose.yaml config >/dev/null && echo "compose ok"` (if Docker is unavailable locally, run `python3 -c "import yaml,sys; yaml.safe_load(open('compose.yaml'))" && echo "yaml ok"`). Expected: `compose ok` (or `yaml ok`).

- [ ] **Step 4: Commit** — `git add compose.yaml && git commit -m "feat(panel-logs): cap container log size (10m x3) on long-running services"`

---

## Task 7: Router helpers (`logs-helpers.ts`)

Pure router glue — schemas, service map, source/text filters, decorate, RBAC gate. Keeps `logs.ts` thin and the logic unit-testable.

**Files:**
- Create: `control-panel/packages/api/src/routers/logs-helpers.ts`
- Test: `control-panel/packages/api/src/routers/logs-helpers.test.ts`

**Interfaces — Produces:**
- `LOG_SERVICE` (zod enum `nginx php wp mariadb redis access all`), `LOG_TAIL` (zod enum `100 500 2000`)
- `panelToDockerService: Record<PanelService, string | null>`
- `hostArgs(service, tail): string[]` → `[dockerSvcOrAll, tail]`
- `mapServiceToSource(service): LogLine["source"]`
- `applySourceFilter(lines, service): LogLine[]`
- `decorateLines(lines, service): LogLine[]`
- `applyTextFilter(lines, filter): LogLine[]`
- `assertSourceAllowed(service, role): void` (throws `ORPCError("FORBIDDEN")`)
- `SENSITIVE_SOURCES: Set<string>`

- [ ] **Step 1: Write the failing test** — `logs-helpers.test.ts`:

```ts
import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import type { LogLine } from "../contract";
import {
  applySourceFilter, applyTextFilter, assertSourceAllowed, decorateLines,
  hostArgs, mapServiceToSource,
} from "./logs-helpers";

const mk = (over: Partial<LogLine>): LogLine =>
  ({ id: "0", source: "nginx", text: "", whenISO: "", ...over });

describe("hostArgs", () => {
  it("maps php → wordpress and passes tail", () =>
    expect(hostArgs("php", "500")).toEqual(["wordpress", "500"]));
  it("maps mariadb → db", () => expect(hostArgs("mariadb", "100")).toEqual(["db", "100"]));
  it("maps wp → cron", () => expect(hostArgs("wp", "100")).toEqual(["cron", "100"]));
  it("maps access → nginx", () => expect(hostArgs("access", "100")).toEqual(["nginx", "100"]));
  it("sends all → all", () => expect(hostArgs("all", "2000")).toEqual(["all", "2000"]));
});

describe("applySourceFilter", () => {
  const access = mk({ text: '1.2.3.4 - - "GET / HTTP/1.1" 200 5 "-" "ua" "-" cache=HIT' });
  const error = mk({ text: "2026/06/24 [error] open() failed" });
  it("nginx tab drops access lines", () =>
    expect(applySourceFilter([access, error], "nginx")).toEqual([error]));
  it("access tab keeps only access lines", () =>
    expect(applySourceFilter([access, error], "access")).toEqual([access]));
  it("other tabs keep everything", () =>
    expect(applySourceFilter([access, error], "php")).toHaveLength(2));
});

describe("decorateLines", () => {
  it("masks IPs + extracts cache + retags source on access", () => {
    const [l] = decorateLines([mk({ text: '9.9.9.9 - - "GET / HTTP/1.1" 200 5 "-" "-" "-" cache=MISS' })], "access");
    expect(l.source).toBe("access");
    expect(l.cache).toBe("MISS");
    expect(l.text).not.toContain("9.9.9.9");
  });
  it("masks SQL literals on mariadb", () => {
    const [l] = decorateLines([mk({ source: "mariadb", text: "WHERE email = 'x@y.z'" })], "mariadb");
    expect(l.text).not.toContain("x@y.z");
  });
  it("masks IPs on access-format lines even under the all tab", () => {
    const [l] = decorateLines([mk({ text: '8.8.8.8 - - "GET / HTTP/1.1" 200 5 "-" "-" "-" cache=HIT' })], "all");
    expect(l.text).not.toContain("8.8.8.8");
  });
});

describe("applyTextFilter", () => {
  const lines = [mk({ text: "alpha" }), mk({ text: "beta" })];
  it("substring matches", () => expect(applyTextFilter(lines, "alph")).toHaveLength(1));
  it("regex matches", () => expect(applyTextFilter(lines, "^be")).toHaveLength(1));
  it("invalid regex falls back to literal", () =>
    expect(applyTextFilter([mk({ text: "a(b" })], "a(b")).toHaveLength(1));
});

describe("assertSourceAllowed", () => {
  it("blocks access for operator", () =>
    expect(() => assertSourceAllowed("access", "operator")).toThrow(ORPCError));
  it("blocks mariadb for operator", () =>
    expect(() => assertSourceAllowed("mariadb", "operator")).toThrow(ORPCError));
  it("allows access for admin", () =>
    expect(() => assertSourceAllowed("access", "admin")).not.toThrow());
  it("allows nginx for operator", () =>
    expect(() => assertSourceAllowed("nginx", "operator")).not.toThrow());
});

describe("mapServiceToSource", () => {
  it("seeds access", () => expect(mapServiceToSource("access")).toBe("access"));
  it("seeds php", () => expect(mapServiceToSource("php")).toBe("php"));
});
```

- [ ] **Step 2: Run it, verify it fails** — `cd control-panel/packages/api && bunx vitest run src/routers/logs-helpers.test.ts` → FAIL.

- [ ] **Step 3: Implement `logs-helpers.ts`:**

```ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import type { LogLine } from "../contract";
import { extractCache, isAccessLine, maskAccessPii, maskMariadbPii } from "../core-bridge/log-pii";

export const LOG_SERVICE = z.enum(["nginx", "php", "wp", "mariadb", "redis", "access", "all"]);
export const LOG_TAIL = z.enum(["100", "500", "2000"]);
export type PanelService = z.infer<typeof LOG_SERVICE>;

// Panel source → docker compose SERVICE NAME. null = no service filter (all).
// access shares the nginx container (post-filtered to access-format lines).
const panelToDockerService: Record<PanelService, string | null> = {
	nginx: "nginx",
	php: "wordpress",
	wp: "cron",
	mariadb: "db",
	redis: "redis",
	access: "nginx",
	all: null,
};

/** Positional host args [service-or-"all", tail] for runVibe/streamVibe. */
export function hostArgs(service: PanelService, tail: string): string[] {
	return [panelToDockerService[service] ?? "all", tail];
}

/** Seed source for parseLogLines (matters only for pre-match continuation lines). */
export function mapServiceToSource(service: PanelService): LogLine["source"] {
	if (service === "all") {
		return "system";
	}
	if (service === "access") {
		return "access";
	}
	return service;
}

/** Split the shared nginx stream: nginx tab = error lines, access tab = access lines. */
export function applySourceFilter(lines: LogLine[], service: PanelService): LogLine[] {
	if (service === "nginx") {
		return lines.filter((l) => !isAccessLine(l.text));
	}
	if (service === "access") {
		return lines.filter((l) => isAccessLine(l.text));
	}
	return lines;
}

/** Apply source-specific PII masking + cache extraction + access retagging. */
export function decorateLines(lines: LogLine[], service: PanelService): LogLine[] {
	return lines.map((l) => {
		const next: LogLine = { ...l };
		if (service === "access") {
			next.source = "access";
		}
		if (isAccessLine(next.text)) {
			next.cache = extractCache(next.text);
			next.text = maskAccessPii(next.text);
		}
		if (next.source === "mariadb") {
			next.text = maskMariadbPii(next.text);
		}
		return next;
	});
}

export function applyTextFilter(lines: LogLine[], filter: string): LogLine[] {
	let re: RegExp | null = null;
	try {
		re = new RegExp(filter, "i");
	} catch {
		re = null;
	}
	const needle = filter.toLowerCase();
	return lines.filter((l) => (re ? re.test(l.text) : l.text.toLowerCase().includes(needle)));
}

export const SENSITIVE_SOURCES = new Set<string>(["access", "mariadb"]);

/** Enforce admin for access/mariadb (operator procedure can't gate per-source). */
export function assertSourceAllowed(service: string, role: string | undefined): void {
	if (SENSITIVE_SOURCES.has(service) && role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "Access and database logs require an admin role.",
		});
	}
}
```

- [ ] **Step 4: Run it, verify it passes** — `bunx vitest run src/routers/logs-helpers.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add control-panel/packages/api/src/routers/logs-helpers.ts control-panel/packages/api/src/routers/logs-helpers.test.ts && git commit -m "feat(panel-logs): router helpers — schemas, service map, filters, RBAC gate"`

---

## Task 8: Router wiring (`logs.ts`)

**Files:**
- Modify: `control-panel/packages/api/src/routers/logs.ts` (full rewrite of the router object; keep the concurrency-cap mechanics).

**Interfaces:**
- Consumes: `hostArgs`, `mapServiceToSource`, `applySourceFilter`, `decorateLines`, `applyTextFilter`, `assertSourceAllowed`, `LOG_SERVICE`, `LOG_TAIL` (Task 7); `runVibe`/`streamVibe` with `{ args }` (exec.ts); `operatorProcedure`/`adminProcedure` (procedures.ts).
- Produces: `logsRouter.{logsRecent, logsFollow, logsExport}`.

- [ ] **Step 1: Rewrite `logs.ts`:**

```ts
import { eventIterator, ORPCError } from "@orpc/server";
import { z } from "zod";

import type { LogLine, StreamEvent } from "../contract";
import { runVibe, STREAM_TIMEOUT_MS, streamVibe } from "../core-bridge/exec";
import { parseLogLines } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { adminProcedure, operatorProcedure } from "../procedures";
import {
	applySourceFilter, applyTextFilter, assertSourceAllowed, decorateLines,
	hostArgs, LOG_SERVICE, LOG_TAIL, mapServiceToSource,
} from "./logs-helpers";

const GLOBAL_MAX = 8;
const PER_USER_MAX = 3;
const FOLLOW_TAIL = "200";
const EXPORT_TAIL = "2000";

let globalActiveStreams = 0;
const perUserActiveStreams = new Map<string, number>();

const logStreamSchema = z.object({
	line: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
	done: z.boolean(),
});

function roleOf(context: { session: { user: { role?: string } } }): string | undefined {
	return context.session.user.role;
}

function pipeline(stdout: string, input: {
	service: z.infer<typeof LOG_SERVICE>;
	tail: string;
	filter?: string;
}): LogLine[] {
	let lines = parseLogLines(stdout, mapServiceToSource(input.service), Number(input.tail));
	lines = applySourceFilter(lines, input.service);
	lines = decorateLines(lines, input.service);
	if (input.filter) {
		lines = applyTextFilter(lines, input.filter);
	}
	return lines.slice(-Number(input.tail));
}

export const logsRouter = {
	logsRecent: operatorProcedure
		.input(z.object({
			siteId: z.string(),
			service: LOG_SERVICE.default("all"),
			tail: LOG_TAIL.default("500"),
			filter: z.string().max(200).optional(),
		}))
		.handler(async ({ input, context }): Promise<LogLine[]> => {
			assertSourceAllowed(input.service, roleOf(context));
			const site = await findSite(input.siteId);
			if (!site) {
				return [];
			}
			const { stdout } = await runVibe(site.installDir, "prod", "logsRecent", {
				args: hostArgs(input.service, input.tail),
			});
			return pipeline(stdout, input);
		}),

	logsFollow: operatorProcedure
		.input(z.object({
			siteId: z.string(),
			service: LOG_SERVICE.default("all"),
			filter: z.string().max(200).optional(),
		}))
		.output(eventIterator(logStreamSchema))
		.handler(async function* ({ input, context }): AsyncGenerator<StreamEvent> {
			assertSourceAllowed(input.service, roleOf(context));
			const userId = context.session.user.id;
			if (
				globalActiveStreams >= GLOBAL_MAX ||
				(perUserActiveStreams.get(userId) ?? 0) >= PER_USER_MAX
			) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Too many concurrent log streams. Close one and retry.",
				});
			}
			const site = await findSite(input.siteId);
			if (!site) {
				return;
			}
			globalActiveStreams += 1;
			perUserActiveStreams.set(userId, (perUserActiveStreams.get(userId) ?? 0) + 1);
			const { proc, lines } = streamVibe(site.installDir, "prod", "logsFollow", {
				timeoutMs: STREAM_TIMEOUT_MS,
				args: hostArgs(input.service, FOLLOW_TAIL),
			});
			try {
				for await (const raw of lines) {
					if (raw.length === 0) {
						continue;
					}
					if (input.service === "access" && !raw.includes('"')) {
						// cheap guard; full access split happens client-unseen below
					}
					if (input.filter && !raw.toLowerCase().includes(input.filter.toLowerCase())) {
						// Server-side filter before yielding keeps wire traffic low. Plain
						// substring (not regex) for the stream path — cheap + ReDoS-free.
						continue;
					}
					yield { line: raw, status: "running", done: false };
				}
				yield { line: "", status: "succeeded", done: true };
			} finally {
				proc.kill();
				globalActiveStreams -= 1;
				const prev = perUserActiveStreams.get(userId) ?? 1;
				if (prev <= 1) {
					perUserActiveStreams.delete(userId);
				} else {
					perUserActiveStreams.set(userId, prev - 1);
				}
			}
		}),

	logsExport: adminProcedure
		.input(z.object({
			siteId: z.string(),
			service: LOG_SERVICE.default("all"),
			filter: z.string().max(200).optional(),
		}))
		.handler(async ({ input }): Promise<{ lines: LogLine[]; filename: string }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { lines: [], filename: "logs.txt" };
			}
			const { stdout } = await runVibe(site.installDir, "prod", "logsExport", {
				args: hostArgs(input.service, EXPORT_TAIL),
				timeoutMs: 30_000,
			});
			const lines = pipeline(stdout, { service: input.service, tail: EXPORT_TAIL, filter: input.filter });
			return { lines, filename: `logs-${input.service}.txt` };
		}),
};
```

> **Note for implementer:** drop the dead `if (input.service === "access" …)` guard block — it was a thinking artifact in the plan. The live stream does NOT post-filter access vs error lines (that needs the full line buffer); the live tail shows the raw service stream, and the *recent* view does the precise access/error split. Keep only the `input.filter` substring guard. If TanStack/oRPC types complain that `context.session.user.role` is not on the session type, read it as `(context.session.user as { role?: string }).role` exactly as `procedures.ts:14-15` does.

- [ ] **Step 2: Typecheck + test** — `cd control-panel && bun run typecheck && cd packages/api && bunx vitest run` → PASS, no type errors.

- [ ] **Step 3: Commit** — `git add control-panel/packages/api/src/routers/logs.ts && git commit -m "feat(panel-logs): wire service/tail/filter + admin-gated export into the router"`

---

## Task 9: Web data layer (`types.ts`, `queries.ts`)

**Files:**
- Modify: `control-panel/web/src/data/types.ts` (the web mirror of `LogLine`)
- Modify: `control-panel/web/src/data/queries.ts` (`logsQuery`)

**Interfaces:**
- Consumes: the router input contract (`{ siteId, service, tail, filter }`).
- Produces: `logsQuery(siteId, params)`; `LogLine` web type with `severity?`/`cache?`/extended source.

- [ ] **Step 1: Extend the web `LogLine`** in `data/types.ts` to match the contract exactly:

```ts
export interface LogLine {
	id: string;
	source: "nginx" | "php" | "wp" | "system" | "mariadb" | "redis" | "access";
	text: string;
	whenISO: string;
	severity?: "error" | "warn" | "info" | "debug";
	cache?: string;
}
```
(Find the existing `LogLine` and replace it; keep the file's existing export style.)

- [ ] **Step 2: Update `logsQuery`** in `data/queries.ts`. Find the current `logsQuery` (it calls `client.logsRecent({ siteId, source: "nginx" })`) and replace with a parameterized version:

```ts
export type LogParams = {
	service?: "nginx" | "php" | "wp" | "mariadb" | "redis" | "access" | "all";
	tail?: "100" | "500" | "2000";
	filter?: string;
};

export const logsQuery = (siteId: string, params: LogParams = {}) => ({
	queryKey: ["logs", siteId, params.service ?? "all", params.tail ?? "500", params.filter ?? ""],
	queryFn: () =>
		client.logsRecent({
			siteId,
			service: params.service ?? "all",
			tail: params.tail ?? "500",
			...(params.filter ? { filter: params.filter } : {}),
		}),
});
```
(Match the surrounding query factory style — if other queries use `queryOptions(...)` from TanStack, wrap accordingly. Read two neighboring query definitions first.)

- [ ] **Step 3: Typecheck** — `cd control-panel && bun run typecheck` → PASS.

- [ ] **Step 4: Commit** — `git add control-panel/web/src/data/types.ts control-panel/web/src/data/queries.ts && git commit -m "feat(panel-logs): parameterized logsQuery + extended web LogLine type"`

---

## Task 10: Logs page UI — toolbar, severity, cache badge, download

**Files:**
- Modify: `control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx`

**Interfaces:**
- Consumes: `logsQuery(siteId, params)`, `client.logsExport`, session role; `LogLine.severity`/`.cache`.
- Produces: source tabs (7), tail selector, filter input, admin download; severity color + cache badge per row.

- [ ] **Step 1: Replace the `SOURCES` constant** (line 20) with the full set + a tail set:

```tsx
const SOURCES = ["all", "nginx", "php", "wp", "mariadb", "redis", "access"] as const;
const TAILS = ["100", "500", "2000"] as const;
const SENSITIVE = new Set(["access", "mariadb"]);

const SEVERITY_CLASS: Record<string, string> = {
	error: "text-destructive",
	warn: "text-amber-500",
	debug: "text-muted-foreground/60",
	info: "",
};
const CACHE_CLASS: Record<string, string> = {
	HIT: "text-emerald-500",
	MISS: "text-destructive",
};
```

- [ ] **Step 2: Make `RecentLogs` driven by server params** — replace the body so `source`/`tail`/`filter` flow into `logsQuery`, the source tab triggers a re-fetch (no client-side `.filter`), each row colors by `severity` and renders a `cache` badge when present, and sensitive tabs are hidden for non-admins. Read the current user role from the existing session/auth hook the app already uses (grep the codebase for how other admin-gated UI reads `role`, e.g. the Users page — reuse that hook; do NOT invent a new one). Key JSX for a row:

```tsx
<div className="flex gap-3" key={l.id}>
	<span className="text-muted-foreground">{l.whenISO.slice(11, 19)}</span>
	<Badge className="h-4" variant="outline">{l.source}</Badge>
	{l.cache ? (
		<Badge className={`h-4 ${CACHE_CLASS[l.cache] ?? ""}`} variant="outline">
			cache:{l.cache}
		</Badge>
	) : null}
	<span className={SEVERITY_CLASS[l.severity ?? "info"]}>{l.text}</span>
</div>
```

The toolbar row (tabs + tail `<select>`/native-select + filter `<input>` + admin-only Download button) sits above the scroll pane. Source-tab list filters out `SENSITIVE` entries when the user is not admin.

- [ ] **Step 3: Implement the admin Download** — on click, call `client.logsExport({ siteId, service, ...(filter?{filter}:{}) })`, format each line as `${l.whenISO}\t${l.source}\t${l.text}`, join with `\n`, and trigger a browser download:

```tsx
async function downloadLogs(siteId: string, service: string, filter: string) {
	const res = await client.logsExport({ siteId, service, ...(filter ? { filter } : {}) });
	const body = res.lines.map((l) => `${l.whenISO}\t${l.source}\t${l.text}`).join("\n");
	const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = res.filename;
	a.click();
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Pass `service`/`filter` into `LiveLogTail`** (the live branch) — see Task 11 for its new props. The `LogsPage` owns `source`/`tail`/`filter` state and passes them to whichever pane is active.

- [ ] **Step 5: Lint + typecheck + build** — `cd control-panel && bun run lint && bun run typecheck && bun run build --filter=web` (or the repo's web build script). Expected: clean.

- [ ] **Step 6: Commit** — `git add control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx && git commit -m "feat(panel-logs): source tabs, tail, filter, severity color, cache badge, admin export"`

---

## Task 11: Live tail — service/filter props + pause/resume

**Files:**
- Modify: `control-panel/web/src/components/patterns/live-log-tail.tsx`

**Interfaces:**
- Consumes: `client.logsFollow({ siteId, service, filter })`.
- Produces: `<LiveLogTail siteId service filter active />` (the parent owns the live on/off toggle as today; `paused` is just `!active`).

- [ ] **Step 1: Extend props + the stream call:**

```tsx
export function LiveLogTail({
	siteId,
	active,
	service = "all",
	filter,
}: {
	siteId: string;
	active: boolean;
	service?: string;
	filter?: string;
}) {
	const live = useLiveStream(
		(signal) =>
			client.logsFollow(
				{ siteId, service, ...(filter ? { filter } : {}) },
				{ signal }
			),
		active
	);
	const text = live.lines.slice(-500).join("\n");
	const logRef = useAutoScroll<HTMLDivElement>(live.lines.length);
	// ...unchanged render...
}
```

The existing "Go live / stop" button on `LogsPage` already toggles `active`; when `active` flips false `useLiveStream` tears down the SSE (verify by reading `use-live-stream.ts` — it should abort on `enabled=false`). No separate pause button needed beyond the existing toggle; if `use-live-stream` does NOT stop on `active=false`, add that guard there instead.

- [ ] **Step 2: Lint + typecheck** — `cd control-panel && bun run lint && bun run typecheck` → clean.

- [ ] **Step 3: Commit** — `git add control-panel/web/src/components/patterns/live-log-tail.tsx && git commit -m "feat(panel-logs): live tail honors selected service + filter"`

---

## Task 12: VPS validation (Phase 5)

Not a code task — the controller runs this after all tasks are reviewed, on the test VPS (`ssh -o IdentitiesOnly=yes -i ~/.ssh/vcode_sh root@178.104.10.126`, see CLAUDE.md). Deploy the branch to `/opt/vibe-wp-src`, rebuild/redeploy the panel (`bin/panel install …` or the panel update path), and verify:

- [ ] `./bin/vibe prod logs-recent nginx 100` returns nginx lines; exits 0.
- [ ] `./bin/vibe prod logs-recent badservice 100` exits 1; `./bin/vibe prod logs-recent nginx 9999` exits 1.
- [ ] Direct wrapper probe as the panel user: a `logs-recent adminer 100` call is rejected by `validate_logs_args` (`adminer` ∉ enum).
- [ ] Panel UI: `nginx`/`php`/`wp`/`redis` tabs visible to operator; `access`/`mariadb` tabs hidden for operator, visible for admin.
- [ ] Enable `NGINX_ACCESS_LOG=1`, generate a request, confirm the `access` tab shows lines, the `cache=` badge renders, and IPs show as `[ip]`.
- [ ] `mariadb` tab (admin) shows the MariaDB error log; any `'…'` SQL literal is masked.
- [ ] Admin Download produces a file ≤ 2000 lines with no secrets.
- [ ] Concurrency: open 4 live tails as one user → the 4th is rejected (`PER_USER_MAX = 3`).

---

## Self-Review (completed by plan author)

**Spec coverage:** §3.1 three-gate rule → Tasks 3/4/5. §3.2 shell → Task 4. §3.3 wrapper → Task 5. §3.4 exec → Task 3. §3.5 router → Tasks 7/8. §3.6 parse → Task 2. §3.7 redaction → Task 1 (relocated to `log-pii.ts`, router-applied per owner O3=b). §4 security → Tasks 1/5/7/8. §5 UI → Tasks 9/10/11. §6 YAGNI honored (no grep op, no log pipeline, slow-query-to-stdout deferred). §7 phases → Tasks 1–11. §8 owner decisions → all locked in Global Constraints. §9 tests → every code task is TDD.

**Corrections vs. spec (drift fixed):** (1) tail passed as positional integer, not `--tail=N` flag, because `buildVibeArgv` rejects `-`-prefixed args; (2) `parseLogLines` `.slice(-200)` → `maxLines` param so 500/2000 tails aren't truncated; (3) docker service names are `db`/`cron`/`wordpress`, not `mariadb`/`wp`/`php`; (4) PII masking lives in `log-pii.ts` and is applied router-side per source (honoring O3=b), not globally in `redact.ts`; (5) MariaDB slow-query log surfacing deferred (file sink, not stdout) — `mariadb` source = error log.

**Type consistency:** `LogLine` (contract + web mirror) carries identical `source`/`severity?`/`cache?`. `LOG_SERVICE`/`LOG_TAIL` enums match the router inputs, the web `LogParams`, and the shell/wrapper enums (shell tail is a superset incl. 200). `hostArgs` returns `[dockerService|"all", tail]` consumed by `runVibe`/`streamVibe` `{ args }`.

**No placeholders:** every code step has complete code or an exact, named edit target; UI steps that reference an existing app hook (session role, query factory style) instruct the implementer to reuse the established pattern rather than invent one.
