# Control Panel Fan-Out — Plan A: Reads Real Everywhere — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip every remaining *read* surface of the panel from fixtures to real host data — site status (lazy), server info, health, staging, recent logs — backed by `bin/vibe … --json`, and fix the backup-date display.

**Architecture:** Extend the proven exec-layer chokepoint with new allowlisted ops; add `--json` output to `bin/vibe smoke · doctor-runtime · monitor` (flat check lists) and `perf-report` (nested schema); add typed JSON parsers + oRPC read procedures; make `SiteSummary.status` optional so `sites.list` is instant and each card resolves `siteStatus(siteId)` lazily; flip the web query factories to oRPC. No mutating ops, no streaming jobs (those are Plan B).

**Tech Stack:** Bun · Hono · oRPC `@orpc/server@1.14.6` · Drizzle/libsql · zod 4 · TanStack Query · POSIX sh.

Spec: `docs/superpowers/specs/2026-06-21-control-panel-fanout-design.md` (read §2, §2a, §3). This is **Plan A** of three; Plan B (operations) and Plan C (team + hardening) follow, each VPS-validated.

## Global Constraints

- **TABS** in `control-panel` TS/TSX (ultracite). Root `bin/` scripts are **POSIX `sh`**, match existing style.
- **Exec layer is the only host-spawn site**; every op is an allowlisted argv array with a timeout + redaction (`packages/api/src/core-bridge/`).
- **`monitor` is always called `--quiet`** (else it fires real Telegram/webhook/email alerts).
- **`smoke` internally calls `doctor-runtime`** — its `--json` must not double-encode doctor's human text (nest doctor's result or use its exit code).
- **Human output stays the default** for every `bin/` script; `--json` is additive and opt-in.
- **`HealthReport.alertChannels` is panel config, not `bin/vibe`** (Plan A: return `[]` or a configured list — never fabricated). `uptimePercent` ← `monitor --json` uptime (or `0` if absent).
- **`SiteSummary.status` becomes optional** (`status?: Verdict`) — a contract change; update both `contract.ts` and the web card.
- **No mutating ops / no jobs in Plan A** (Plan B). No team/auth changes (Plan C).
- **Gate per task** from `control-panel/`: `bun run check-types`, `bun run check`, `bun run test` pass. Shell tasks: `sh -n` + `shellcheck` + the JSON-parser unit test; real output proven at the VPS gate.
- **AGENTS.md:** English; TS/TSX ≤220 lines (split modules); no host spawns from components; no secrets in logs.

## Testing approach

TDD the **pure parsers** (`smoke`/`doctor`/`monitor`/`perf` JSON → typed) and the **date formatter** with fixture strings — these need no host. The `--json` shell additions and the live procedures are proven at the **VPS re-validation gate** (Task 8) on `panel.vcode.sh`.

---

## File Structure

**Modified (root bin):** `bin/smoke`, `bin/doctor-runtime`, `bin/monitor`, `bin/perf-report` — add a `--json` mode.

**Modified (api):**
- `packages/api/src/core-bridge/exec.ts` — extend `VIBE_OPS` (add `smokeJson`, `doctorJson`, `monitorJson`, `perfJson`; `smoke`/`backups`/`backup` stay).
- `packages/api/src/core-bridge/parse.ts` — add `parseChecksJson`, `parsePerfJson`, `formatBackupWhen`.
- `packages/api/src/core-bridge/parse.test.ts` — tests for the new parsers.
- `packages/api/src/contract.ts` — `SiteSummary.status?` optional; add `PerfReport`.
- `packages/api/src/routers/sites.ts` — `sitesList` identity-only; add `siteStatus`.
- `packages/api/src/routers/index.ts` — spread the new routers.
- `packages/env/src/server.ts` — add `PANEL_VPS_LABEL` (optional).

**Created (api):** `packages/api/src/routers/server.ts` (`serverInfo`, `doctor`), `health.ts` (`report`), `staging.ts` (`info`), `logs.ts` (`recent`).

**Modified (web):**
- `web/src/data/types.ts` — re-export `PerfReport`.
- `web/src/data/queries.ts` — flip `serverInfoQuery`/`healthQuery`/`stagingQuery`/`logsQuery` to oRPC; add `siteStatusQuery`.
- `web/src/routes/_auth/sites/index.tsx` — site card resolves `siteStatus` lazily (skeleton dot).
- `web/src/components/patterns/site-card.tsx` (if present) or the card markup — skeleton dot.
- `web/src/data/derive.ts` (or the date helper) — "never" for epoch/missing backup.

---

# Phase 1 — `bin/vibe … --json`

### Task 1: `--json` for `smoke` + `doctor-runtime` (flat checks) + exec ops + parser

**Files:**
- Modify: `bin/smoke`, `bin/doctor-runtime`
- Modify: `control-panel/packages/api/src/core-bridge/exec.ts`
- Modify: `control-panel/packages/api/src/core-bridge/parse.ts`
- Test: `control-panel/packages/api/src/core-bridge/parse.test.ts`

**Interfaces:**
- Produces: `bin/vibe <env> smoke --json` / `doctor-runtime --json` emit `{"passed":bool,"checks":[{"name":str,"ok":bool}]}`. `VIBE_OPS.smokeJson` / `.doctorJson`. `parseChecksJson(stdout): { passed: boolean; checks: { name: string; ok: boolean }[] }`.

- [x] **Step 1: Add `--json` to `bin/smoke`** — read the script; it accumulates `ok:`/`failed:` results via helper calls and exits non-zero on failure, and it invokes `bin/doctor-runtime` as a sub-check. Add a `--json` flag (default off): when set, suppress the human `ok:`/`failed:` lines, accumulate each check into shell arrays `name[]`/`ok[]` (1/0), call `doctor-runtime` **without** `--json` and record its pass/fail as a single check named `"runtime doctor"` from its exit code, and at the end print one JSON object:

```sh
# --json emitter (append near the end, after checks run):
if [ "$JSON" = 1 ]; then
  printf '{"passed":%s,"checks":[' "$( [ "$fail_count" -eq 0 ] && echo true || echo false )"
  i=0; while [ "$i" -lt "${#names[@]}" ]; do
    [ "$i" -gt 0 ] && printf ','
    printf '{"name":%s,"ok":%s}' "$(json_str "${names[$i]}")" "${oks[$i]}"
    i=$((i+1))
  done
  printf ']}\n'
fi
```
where `json_str()` is a small helper that escapes `"` and `\`. Keep the default (no `--json`) path byte-identical to today (the installer + the existing `parseSmoke` still rely on it).

- [x] **Step 2: Add the same `--json` flag to `bin/doctor-runtime`** — identical pattern (it has no nested sub-script), emitting `{"passed":…,"checks":[…]}`.

- [x] **Step 3: Verify the scripts parse** — `sh -n bin/smoke && sh -n bin/doctor-runtime && shellcheck -s sh bin/smoke bin/doctor-runtime` → clean. (Live JSON output is proven at the VPS gate.)

- [x] **Step 4: Extend the exec allowlist** — in `exec.ts`, add to `VIBE_OPS`:

```ts
	smokeJson: { argv: ["smoke", "--json"], stream: false },
	doctorJson: { argv: ["doctor-runtime", "--json"], stream: false },
```

- [x] **Step 5: Write the failing parser test** in `parse.test.ts`:

```ts
import { parseChecksJson } from "./parse";

describe("parseChecksJson", () => {
	it("parses the --json checks envelope", () => {
		const r = parseChecksJson('{"passed":false,"checks":[{"name":"HTTP 200","ok":true},{"name":"TLS","ok":false}]}');
		expect(r.passed).toBe(false);
		expect(r.checks).toEqual([
			{ name: "HTTP 200", ok: true },
			{ name: "TLS", ok: false },
		]);
	});
	it("returns a safe empty result on garbage", () => {
		expect(parseChecksJson("not json")).toEqual({ passed: false, checks: [] });
	});
});
```

- [x] **Step 6: Run it — FAIL.** `cd control-panel && bunx vitest run packages/api/src/core-bridge/parse.test.ts -t parseChecksJson`.

- [x] **Step 7: Implement `parseChecksJson`** in `parse.ts`:

```ts
import { z } from "zod";

const checksEnvelope = z.object({
	passed: z.boolean(),
	checks: z.array(z.object({ name: z.string(), ok: z.boolean() })),
});

export function parseChecksJson(stdout: string): { passed: boolean; checks: { name: string; ok: boolean }[] } {
	try {
		return checksEnvelope.parse(JSON.parse(stdout.trim()));
	} catch {
		return { passed: false, checks: [] };
	}
}
```

- [x] **Step 8: Run it — PASS.** **Step 9: Verify** `bun run check-types`/`check`. **Step 10: Commit:**

```bash
git add bin/smoke bin/doctor-runtime control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/parse.ts control-panel/packages/api/src/core-bridge/parse.test.ts
git commit -m "feat(panel): bin/vibe smoke+doctor-runtime --json + parseChecksJson"
```

---

### Task 2: `--json` for `monitor` (+ uptime) and `perf-report` (nested) + parsers

**Files:**
- Modify: `bin/monitor`, `bin/perf-report`
- Modify: `control-panel/packages/api/src/core-bridge/exec.ts`, `parse.ts`, `parse.test.ts`
- Modify: `control-panel/packages/api/src/contract.ts`

**Interfaces:**
- Produces: `monitor --quiet --json` → `{"status":"ok|warn|fail","failures":n,"warnings":n,"uptimePercent":number,"checks":[{name,ok}]}`; `perf-report --json` → `PerfReport`. `VIBE_OPS.monitorJson` (argv `["monitor","--quiet","--json"]`), `.perfJson`. `parseMonitorJson`, `parsePerfJson`. Contract `PerfReport`.

- [ ] **Step 1: Add `PerfReport` to `contract.ts`** (the few fields the panel needs — Health page TTFB/cache):

```ts
export interface PerfReport {
	cacheHitPercent: number;
	opcacheHitPercent: number;
	redisHitPercent: number;
	ttfbMs: number;
}
```

- [ ] **Step 2: Add `--json` to `bin/monitor`** — it already prints `ok:`/`warn:`/`fail:` lines + a summary and tracks `monitor_failures`/`monitor_warnings`. Add a `--json` flag that suppresses the lines and at the end prints `{"status":…,"failures":N,"warnings":N,"uptimePercent":U,"checks":[…]}` (same `json_str` + array pattern as Task 1). For `uptimePercent`, emit the HTTP-uptime value the monitor already computes if available, else `0`. `--json` implies `--quiet` semantics for line output.

- [ ] **Step 3: Add `--json` to `bin/perf-report`** — it builds sections via `section()`/`item()`/`block()`. Add a `--json` flag that, instead of the human layout, captures the specific values the panel needs and prints `{"ttfbMs":N,"cacheHitPercent":N,"opcacheHitPercent":N,"redisHitPercent":N}` (extract from the same measurements the human report already computes — TTFB from the site HTTP timing item, cache hit from the Nginx FastCGI section, opcache from the OPcache section, redis from the Redis section). Default human output unchanged.

- [ ] **Step 4: Verify scripts** — `sh -n` + `shellcheck` on both → clean.

- [ ] **Step 5: Extend `VIBE_OPS`:**

```ts
	monitorJson: { argv: ["monitor", "--quiet", "--json"], stream: false },
	perfJson: { argv: ["perf-report", "--json"], stream: false },
```

- [ ] **Step 6: Write failing tests** for `parseMonitorJson` + `parsePerfJson` (fixtures), then implement in `parse.ts`:

```ts
import type { PerfReport } from "../contract";

const monitorEnvelope = z.object({
	status: z.enum(["ok", "warn", "fail"]),
	failures: z.number(),
	warnings: z.number(),
	uptimePercent: z.number(),
	checks: z.array(z.object({ name: z.string(), ok: z.boolean() })),
});

export function parseMonitorJson(stdout: string) {
	try {
		return monitorEnvelope.parse(JSON.parse(stdout.trim()));
	} catch {
		return { status: "fail" as const, failures: 0, warnings: 0, uptimePercent: 0, checks: [] };
	}
}

const perfEnvelope = z.object({
	ttfbMs: z.number(),
	cacheHitPercent: z.number(),
	opcacheHitPercent: z.number(),
	redisHitPercent: z.number(),
});

export function parsePerfJson(stdout: string): PerfReport {
	try {
		return perfEnvelope.parse(JSON.parse(stdout.trim()));
	} catch {
		return { ttfbMs: 0, cacheHitPercent: 0, opcacheHitPercent: 0, redisHitPercent: 0 };
	}
}
```

(Test each with a valid fixture + a garbage string asserting the safe fallback. Run FAIL → implement → PASS.)

- [ ] **Step 7: Verify + commit** (`check-types`/`check`/`test`):

```bash
git add bin/monitor bin/perf-report control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/parse.ts control-panel/packages/api/src/core-bridge/parse.test.ts control-panel/packages/api/src/contract.ts
git commit -m "feat(panel): monitor+perf-report --json + PerfReport + parsers"
```

---

# Phase 2 — Read procedures

### Task 3: Lazy `siteStatus` + identity-only `sites.list`

**Files:**
- Modify: `control-panel/packages/api/src/contract.ts` (`SiteSummary.status?`)
- Modify: `control-panel/packages/api/src/routers/sites.ts`
- Modify: `control-panel/web/src/data/types.ts` (re-export unchanged; `status` now optional flows through)

**Interfaces:**
- Consumes: `runVibe`, `parseChecksJson` (Task 1), `detectSites`/`findSite`.
- Produces: `sitesList` returns `SiteSummary[]` with **no** `status` (fast); `siteStatus({ siteId }) → { status: Verdict }`.

- [ ] **Step 1: Make `status` optional** in `contract.ts`: change `SiteSummary` `status: Verdict;` → `status?: Verdict;`.

- [ ] **Step 2: Rewrite `sitesList` to identity-only** in `routers/sites.ts` — drop the per-site `smoke`/`backups` calls; return name/domain/hasStaging/lastBackupISO only:

```ts
sitesList: protectedProcedure.handler(async (): Promise<SiteSummary[]> => {
	const sites = await detectSites();
	return Promise.all(
		sites.map(async (s) => ({
			id: s.id,
			name: s.slug,
			domain: s.domain,
			hasStaging: s.hasStaging,
			lastBackupISO:
				parseBackups((await runVibe(s.installDir, "prod", "backups")).stdout)[0]?.whenISO ??
				"",
		}))
	);
}),
```
(`lastBackupISO` is `""` when there is no backup — Task 7 renders "never".)

- [ ] **Step 3: Add `siteStatus`:**

```ts
siteStatus: protectedProcedure
	.input(z.object({ siteId: z.string() }))
	.handler(async ({ input }): Promise<{ status: Verdict }> => {
		const site = await findSite(input.siteId);
		if (!site) {
			throw new ORPCError("NOT_FOUND");
		}
		const { stdout, code } = await runVibe(site.installDir, "prod", "smokeJson", { timeoutMs: 90_000 });
		const passed = code === 0 && parseChecksJson(stdout).passed;
		return { status: passed ? "good" : "act" };
	}),
```
(Import `ORPCError` from `@orpc/server`, `z`, `Verdict`/`SiteSummary` from `../contract`, `parseBackups`/`parseChecksJson` from `../core-bridge/parse`.)

- [ ] **Step 4: Verify + commit** (`check-types`/`check`/`test`). Web `tsc` must still pass with `status?`:

```bash
git add control-panel/packages/api/src/contract.ts control-panel/packages/api/src/routers/sites.ts
git commit -m "feat(panel): lazy siteStatus + identity-only sitesList"
```

---

### Task 4: Real `serverInfo`

**Files:**
- Create: `control-panel/packages/api/src/routers/server.ts`
- Modify: `control-panel/packages/api/src/routers/index.ts`
- Modify: `control-panel/packages/env/src/server.ts`
- Modify: `control-panel/packages/api/src/core-bridge/exec.ts` (a tiny host helper)

**Interfaces:**
- Produces: `serverInfo() → ServerInfo`, `serverDoctor() → { passed; checks }`.

- [ ] **Step 1: Add `PANEL_VPS_LABEL`** (optional) to `packages/env/src/server.ts`: `PANEL_VPS_LABEL: z.string().optional()`.

- [ ] **Step 2: Add a `hostExec` helper** in `exec.ts` for non-`bin/vibe` host reads (df, hostname) — still argv + redaction + timeout, no allowlist needed since the argv is fixed in code:

```ts
export async function hostExec(argv: string[], opts: { timeoutMs?: number } = {}): Promise<string> {
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 10_000);
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	clearTimeout(timer);
	return redact(out);
}
```

- [ ] **Step 3: Create `routers/server.ts`:**

```ts
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { ServerInfo } from "../contract";
import { hostExec, runVibe } from "../core-bridge/exec";
import { parseChecksJson } from "../core-bridge/parse";
import { detectSites, findSite } from "../core-bridge/sites";
import { env } from "@control-panel/env/server";
import { protectedProcedure } from "../procedures";

function diskPercentFromDf(out: string): number {
	// `df -P /` second line, 5th column like "41%"
	const line = out.trim().split("\n")[1] ?? "";
	const pct = line.split(/\s+/)[4] ?? "0%";
	return Number.parseInt(pct.replace("%", ""), 10) || 0;
}

export const serverRouter = {
	serverInfo: protectedProcedure.handler(async (): Promise<ServerInfo> => {
		const sites = await detectSites();
		const df = await hostExec(["df", "-P", "/"]);
		const host = (await hostExec(["hostname", "-f"])).trim();
		const statuses = await Promise.all(
			sites.map(async (s) => {
				const { stdout, code } = await runVibe(s.installDir, "prod", "smokeJson", { timeoutMs: 90_000 });
				return code === 0 && parseChecksJson(stdout).passed;
			})
		);
		return {
			vps: env.PANEL_VPS_LABEL ?? host ?? "this server",
			siteCount: sites.length,
			diskPercent: diskPercentFromDf(df),
			allHealthy: statuses.every(Boolean),
		};
	}),

	serverDoctor: protectedProcedure.handler(async ({ context }) => {
		// host-level doctor against the first detected site's runtime
		const sites = await detectSites();
		const site = sites[0];
		if (!site) {
			throw new ORPCError("NOT_FOUND");
		}
		return parseChecksJson((await runVibe(site.installDir, "prod", "doctorJson")).stdout);
	}),
};
```

- [ ] **Step 4: Spread into `routers/index.ts`** (`...serverRouter` + the later `sitesRouter`/etc.). **Step 5: Verify + commit:**

```bash
git add control-panel/packages/api/src/routers/server.ts control-panel/packages/api/src/routers/index.ts control-panel/packages/env/src/server.ts control-panel/packages/api/src/core-bridge/exec.ts
git commit -m "feat(panel): real serverInfo + serverDoctor"
```

---

### Task 5: `health.report` + `staging.info`

**Files:**
- Create: `control-panel/packages/api/src/routers/health.ts`, `staging.ts`
- Modify: `control-panel/packages/api/src/routers/index.ts`

**Interfaces:**
- Produces: `healthReport({ siteId }) → HealthReport`; `stagingInfo({ siteId }) → StagingInfo`.

- [ ] **Step 1: Create `routers/health.ts`** — tiles from `smoke --json`, perf numbers from `perf-report --json`, uptime from `monitor --json`, `alertChannels: []` (panel config — Plan C/settings later):

```ts
import { z } from "zod";

import type { HealthReport, MetricTile, Verdict } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseChecksJson, parseMonitorJson, parsePerfJson } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

const tile = (key: string, label: string, ok: boolean, detail: string): MetricTile => ({
	key,
	label,
	verdict: (ok ? "good" : "act") as Verdict,
	value: ok ? "OK" : "Failing",
	detail,
	help: "From the latest checks.",
});

export const healthRouter = {
	healthReport: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<HealthReport> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new (await import("@orpc/server")).ORPCError("NOT_FOUND");
			}
			const smoke = parseChecksJson((await runVibe(site.installDir, "prod", "smokeJson", { timeoutMs: 90_000 })).stdout);
			const perf = parsePerfJson((await runVibe(site.installDir, "prod", "perfJson", { timeoutMs: 120_000 })).stdout);
			const mon = parseMonitorJson((await runVibe(site.installDir, "prod", "monitorJson")).stdout);
			return {
				tiles: smoke.checks.slice(0, 4).map((c) => tile(c.name, c.name, c.ok, c.name)),
				ttfbMs: perf.ttfbMs,
				cacheHitPercent: perf.cacheHitPercent,
				tlsDays: 0,
				uptimePercent: mon.uptimePercent,
				alertChannels: [],
			};
		}),
};
```
(Replace the inline `await import("@orpc/server")` with a top-level `import { ORPCError } from "@orpc/server"` — shown inline only to flag the throw. `tlsDays` stays `0` in Plan A unless a check exposes it; the UI already handles a number.)

- [ ] **Step 2: Create `routers/staging.ts`** — read `stage.WP_HOME`:

```ts
import { z } from "zod";

import type { StagingInfo } from "../contract";
import { hostFromUrl, parseEnvFile } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

export const stagingRouter = {
	stagingInfo: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<StagingInfo> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { present: false, url: null };
			}
			const stage = parseEnvFile(await Bun.file(`${site.installDir}/env/stage.env`).text().catch(() => ""));
			return stage.WP_HOME
				? { present: true, url: hostFromUrl(stage.WP_HOME), noindex: true }
				: { present: false, url: null };
		}),
};
```

- [ ] **Step 3: Spread both into `routers/index.ts`. Step 4: Verify + commit:**

```bash
git add control-panel/packages/api/src/routers/health.ts control-panel/packages/api/src/routers/staging.ts control-panel/packages/api/src/routers/index.ts
git commit -m "feat(panel): real healthReport + stagingInfo"
```

---

### Task 6: `logs.recent`

**Files:**
- Create: `control-panel/packages/api/src/routers/logs.ts`
- Modify: `control-panel/packages/api/src/routers/index.ts`, `core-bridge/exec.ts`, `core-bridge/parse.ts` (+ test)

**Interfaces:**
- Produces: `logsRecent({ siteId, source }) → LogLine[]`. `VIBE_OPS.logsRecent` (argv `["logs-recent"]`). `parseLogLines(stdout, source)`.

- [ ] **Step 1: Add `logsRecent` op** to `VIBE_OPS`: `logsRecent: { argv: ["logs-recent"], stream: false }`.

- [ ] **Step 2: TDD `parseLogLines`** in `parse.ts` (docker compose log lines → `LogLine[]`; assign `source` by the requested filter, `id` by index, `whenISO`/`text` best-effort from the line):

```ts
import type { LogLine } from "../contract";

export function parseLogLines(stdout: string, source: LogLine["source"]): LogLine[] {
	return stdout
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(-200)
		.map((text, i) => ({ id: String(i), source, text, whenISO: new Date(0).toISOString() }));
}
```
(Test: 3 lines → 3 `LogLine`s with the given source; empty → `[]`.)

- [ ] **Step 3: Create `routers/logs.ts`:**

```ts
import { z } from "zod";

import type { LogLine } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseLogLines } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

export const logsRouter = {
	logsRecent: protectedProcedure
		.input(z.object({ siteId: z.string(), source: z.enum(["nginx", "php", "wp"]) }))
		.handler(async ({ input }): Promise<LogLine[]> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return [];
			}
			return parseLogLines((await runVibe(site.installDir, "prod", "logsRecent")).stdout, input.source);
		}),
};
```

- [ ] **Step 4: Spread into `routers/index.ts`. Step 5: Verify + commit** (`check-types`/`check`/`test`):

```bash
git add control-panel/packages/api/src/routers/logs.ts control-panel/packages/api/src/routers/index.ts control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/parse.ts control-panel/packages/api/src/core-bridge/parse.test.ts
git commit -m "feat(panel): logsRecent snapshot"
```

---

# Phase 3 — Frontend flip + date fix

### Task 7: Flip web read queries + lazy status card + "never" date

**Files:**
- Modify: `control-panel/web/src/data/queries.ts`
- Modify: `control-panel/web/src/data/types.ts` (re-export `PerfReport`)
- Modify: `control-panel/web/src/routes/_auth/sites/index.tsx` (lazy status dot)
- Modify: `control-panel/web/src/data/derive.ts` (relativeTime "never")

**Interfaces:**
- Consumes: `orpc` (TanStack utils) — `orpc.serverInfo`, `orpc.healthReport`, `orpc.stagingInfo`, `orpc.logsRecent`, `orpc.siteStatus`.

- [ ] **Step 1: `relativeTime` → "never"** in `derive.ts`: when `iso` is empty or parses to epoch (`<= 0`), return `"never"`:

```ts
export function relativeTime(iso: string, now: Date): string {
	if (!iso) {
		return "never";
	}
	const t = new Date(iso).getTime();
	if (!Number.isFinite(t) || t <= 0) {
		return "never";
	}
	// …existing diff logic…
}
```
(Update the existing `relativeTime.test.ts` with a `relativeTime("", now) === "never"` case.)

- [ ] **Step 2: Flip the read queries** in `queries.ts` (keep names/signatures; consumers unchanged):

```ts
export const serverInfoQuery = () => orpc.serverInfo.queryOptions();
export const healthQuery = (siteId: string) =>
	orpc.healthReport.queryOptions({ input: { siteId } });
export const stagingQuery = (siteId: string) =>
	orpc.stagingInfo.queryOptions({ input: { siteId } });
export const logsQuery = (siteId: string) =>
	orpc.logsRecent.queryOptions({ input: { siteId, source: "nginx" } });
export const siteStatusQuery = (siteId: string) =>
	orpc.siteStatus.queryOptions({ input: { siteId } });
```
(Remove the now-dead fixture imports for these. `overviewQuery`/`backupsQuery`/`sitesQuery` stay as wired in the MVP.)

- [ ] **Step 3: Lazy status dot** in `sites/index.tsx` — the card no longer reads `s.status`; it calls `useQuery(siteStatusQuery(s.id))` and renders a skeleton dot until it resolves. Extract the card into a `<SiteCard site={s} />` subcomponent (keeps `index.tsx` ≤220 lines) that does:

```tsx
const status = useQuery(siteStatusQuery(site.id));
const dot = status.data ? verdictTone(status.data.status).dot : "bg-muted animate-pulse";
// render <span className={`size-2 rounded-full ${dot}`} />
```

- [ ] **Step 4: Re-export `PerfReport`** in `web/src/data/types.ts` (add to the `export type { … }` list).

- [ ] **Step 5: Verify** — `bun run check-types`, `bun run check`, `bun run test`. **Step 6: Commit:**

```bash
git add control-panel/web/src/data/queries.ts control-panel/web/src/data/types.ts control-panel/web/src/data/derive.ts control-panel/web/src/data/derive.test.ts control-panel/web/src/routes/_auth/sites/index.tsx control-panel/web/src/components
git commit -m "feat(panel): flip server/health/staging/logs to oRPC + lazy site status + never date"
```

---

# Phase 4 — VPS validation

### Task 8: Real-VPS re-validation (acceptance gate)

**Files:** none (validation only).

- [ ] **Step 1: Redeploy** — rsync the branch to `/root/vibe-wp-panel-src` and `./bin/panel install --domain panel.vcode.sh --admin-email hello@vcode.sh --admin-password <known>` (idempotent; rebuilds + restarts).
- [ ] **Step 2: Sites list is instant** — `/sites` returns immediately; each card's dot starts as a pulsing skeleton and resolves to a real verdict within a few seconds (no 16s block).
- [ ] **Step 3: Every read screen is real** — open a site's **Health** (real tiles + TTFB/cache/uptime from `--json`), **Logs** (real recent nginx lines), **Staging** (real `stage.WP_HOME` or "no staging"); the **Server & security** page shows real disk %/site count/hostname; a no-backup site shows **"never"** not "20625 days ago".
- [ ] **Step 4: No alerts fired** — confirm the monitor calls used `--quiet` (check the box's monitor alert log / Telegram is silent).
- [ ] **Step 5: Record** pass/fail in this plan + `docs/product-roadmap.md`; tick the boxes.

---

## Self-Review (completed during planning)

**Spec coverage (Plan A):** §2 lazy status → Task 3,7; `--json` (incl. monitor `--quiet`, smoke-nests-doctor, perf nested) → Tasks 1–2; §2a `serverInfo` derivation → Task 4; `HealthReport.alertChannels`=[] + uptime source → Task 5; `StagingInfo` source → Task 5; logs.recent snapshot flip → Tasks 6–7; `SiteSummary.status?` optional → Task 3; date "never" → Task 7; query-key flip → Task 7; VPS gate → Task 8. **Deferred (Plan B/C, per spec):** logs.tail follow-stream, all mutating/streaming ops + audit, team admin + the RBAC `ac`/hook fixes + hardening.

**Placeholders:** the two inline `await import("@orpc/server")`/`zod` notes in Tasks 5/3 are explicitly flagged to use top-level imports; no TODO/TBD. Shell `--json` steps give the exact JSON contract + the emitter pattern (the implementer reads each script to wire it to that script's existing check helpers — a concrete contract, not a placeholder), proven at the VPS gate.

**Type consistency:** `parseChecksJson`/`parseMonitorJson`/`parsePerfJson`/`parseLogLines`, `VIBE_OPS` keys (`smokeJson`/`doctorJson`/`monitorJson`/`perfJson`/`logsRecent`), `siteStatus`/`serverInfo`/`serverDoctor`/`healthReport`/`stagingInfo`/`logsRecent`, and `SiteSummary.status?`/`PerfReport` are used identically across defining and consuming tasks.
