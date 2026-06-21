# Control Panel Backend — MVP Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the control-panel server to the host so a logged-in admin sees their real Vibe WP sites, runs a real backup with a live redacted stream, and installs the panel on a VPS with `bin/panel install` — proving the whole Caddy→server→exec→`bin/vibe`→SSE→web chain end-to-end.

**Architecture:** A single **exec layer** (`server/src/core-bridge/`) is the only code that spawns host processes — it runs each site's own `<dir>/bin/vibe <env> <cmd>` from a fixed **allowlist**, with timeouts and **redaction**. oRPC procedures over the promoted contract types read through it; long ops become **jobs** streamed to the browser via oRPC **event iterators (SSE)**. better-auth's **admin plugin + access control** adds roles; `bin/panel install` deploys it host-native (systemd + Caddy).

**Tech Stack:** Bun · Hono · oRPC `@orpc/server@1.14.6` (event iterators) · better-auth `1.6.20` (admin plugin) · Drizzle `0.45.2` + `@libsql/client` · zod 4 · TanStack Query · POSIX sh (`bin/`).

Spec: `docs/superpowers/specs/2026-06-21-control-panel-backend-install-design.md`. This plan implements **build-order steps 1–2 (the MVP slice)** — sites + overview + backups(list/run/stream) + auth bootstrap + `bin/panel install`, **gated by real-VPS validation**. Health/staging/logs/lifecycle/updates/server/team domains, the `--json` `bin/vibe` modes, and the polished §7a TUI install screen are the **follow-up fan-out plan**.

## Global Constraints

- **Indentation is TABS** in all `control-panel` TS/TSX (Biome/`ultracite`). Root `bin/` scripts are **POSIX `sh`** (`#!/bin/sh`, 2-space, match existing `bin/` style).
- **The exec layer is the ONLY place that spawns host processes.** No procedure calls `Bun.spawn`/`bin/vibe` directly.
- **Every spawn uses the command allowlist + an argv array** — never string-interpolated shell. Inputs are zod-validated.
- **Redact all captured output** (stdout/stderr/streams) before it is stored, logged, or sent to a client.
- **Semantic types only from the shared contract** (`packages/api/src/contract.ts`); the web imports them — no shape drift.
- **Quality gate per task** from `control-panel/`: `bun run check-types`, `bun run check`, `bun run test` all pass. Root `bin/` changes are shell — verified by their unit-parsers + the VPS gate.
- **No secrets in logs or install output.** The owner password is passed to the sign-up endpoint, never echoed/persisted.
- **English copy.** Keep files focused.

## Testing approach

`control-panel` uses **Vitest** (added in the frontend redesign). TDD the **pure logic** — redaction, env/site parsing, smoke/backups output parsers, the line-stream queue, role tiers — these are where bugs hide and they need no host. Integration points (spawning `bin/vibe`, the systemd/Caddy install, the SSE round-trip) are proven by the **real-VPS validation gate** (Task 14) on the disposable test VPS. Presentational web changes are verified by `check-types` + a manual click-through.

---

## File Structure

**Created (server/core-bridge):**
- `control-panel/server/src/core-bridge/redact.ts` — secret redaction.
- `control-panel/server/src/core-bridge/redact.test.ts`
- `control-panel/server/src/core-bridge/exec.ts` — allowlist + `runVibe` + `streamVibe`.
- `control-panel/server/src/core-bridge/exec.test.ts`
- `control-panel/server/src/core-bridge/parse.ts` — `parseEnvFile`, `hostFromUrl`, `parseSmoke`, `parseBackups`.
- `control-panel/server/src/core-bridge/parse.test.ts`
- `control-panel/server/src/core-bridge/sites.ts` — `detectSites`, `findSite`.
- `control-panel/server/src/core-bridge/line-stream.ts` — broadcast buffer (replay + follow).
- `control-panel/server/src/core-bridge/line-stream.test.ts`
- `control-panel/server/src/core-bridge/jobs.ts` — in-memory job registry + `startBackupJob`.

**Created (api):**
- `control-panel/packages/api/src/contract.ts` — the 11 shared types + job/stream schemas.
- `control-panel/packages/api/src/routers/sites.ts`, `backups.ts`, `operations.ts`.

**Created (db):**
- `control-panel/packages/db/src/schema/jobs.ts` — `jobs`, `auditLog` tables.

**Created (root bin):**
- `bin/panel` — `install|status|uninstall` (POSIX sh).

**Modified:**
- `control-panel/packages/api/package.json` — export `./contract`.
- `control-panel/packages/api/src/procedures.ts` — add `operatorProcedure`, `adminProcedure`.
- `control-panel/packages/api/src/routers/index.ts` — spread new routers.
- `control-panel/packages/auth/src/index.ts` — admin plugin + AC + role field + bootstrap hook + rateLimit.
- `control-panel/packages/db/src/schema/auth.ts` — add `role` to `user`.
- `control-panel/packages/db/src/index.ts` — register new schema.
- `control-panel/packages/db/drizzle.config.ts` — schema glob.
- `control-panel/packages/env/src/server.ts` — add `PANEL_SITES_ROOTS` (default `/opt:/srv`).
- `control-panel/web/src/data/types.ts` — re-export the contract.
- `control-panel/web/src/data/queries.ts` — flip fixtures → oRPC.
- `control-panel/web/src/components/patterns/operation-runner.tsx` — consume the SSE stream.
- `control-panel/web/src/routes/_auth/sites/$siteId/backups.tsx` — start job + stream.

---

# Phase 1 — Contract + exec foundation

### Task 1: Shared contract types

**Files:**
- Create: `control-panel/packages/api/src/contract.ts`
- Modify: `control-panel/packages/api/package.json` (exports)
- Modify: `control-panel/web/src/data/types.ts`

**Interfaces:**
- Produces: all UI types from one place — `Verdict`, `SiteSummary`, `MetricTile`, `NeedItem`, `ActivityEntry`, `SiteOverview`, `ServerInfo`, `BackupRecord`, `HealthReport`, `StagingInfo`, `LogLine`, plus `JobStatus`, `Job`, `StreamEvent`.

- [x] **Step 1: Create `packages/api/src/contract.ts`** — copy the 11 types verbatim from `web/src/data/types.ts` (so they are byte-identical), then add the job/stream types:

```ts
export type Verdict = "good" | "watch" | "act";

export interface SiteSummary {
	domain: string;
	hasStaging: boolean;
	id: string;
	lastBackupISO: string;
	name: string;
	status: Verdict;
}

export interface MetricTile {
	detail: string;
	help: string;
	key: string;
	label: string;
	value: string;
	verdict: Verdict;
}

export interface NeedItem {
	actionLabel: string;
	detail: string;
	icon: "update" | "backup" | "cert" | "disk" | "security";
	id: string;
	reversible: boolean;
	title: string;
}

export interface ActivityEntry {
	good: boolean;
	id: string;
	kind: "backup" | "health" | "cache" | "update" | "deploy";
	text: string;
	whenISO: string;
}

export interface SiteOverview {
	activity: ActivityEntry[];
	headline: string;
	needs: NeedItem[];
	safety: {
		backupText: string;
		backupDetail: string;
		securityText: string;
		securityDetail: string;
	};
	siteId: string;
	status: Verdict;
	subline: string;
	tiles: MetricTile[];
}

export interface ServerInfo {
	allHealthy: boolean;
	diskPercent: number;
	siteCount: number;
	vps: string;
}

export interface BackupRecord {
	id: string;
	location: "local" | "offsite";
	sizeMB: number;
	verified: boolean;
	whenISO: string;
}

export interface HealthReport {
	alertChannels: string[];
	cacheHitPercent: number;
	tiles: MetricTile[];
	tlsDays: number;
	ttfbMs: number;
	uptimePercent: number;
}

export type StagingInfo =
	| { present: true; url: string; noindex: boolean }
	| { present: false; url: null };

export interface LogLine {
	id: string;
	source: "nginx" | "php" | "wp";
	text: string;
	whenISO: string;
}

export type JobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "canceled";

export interface Job {
	id: string;
	kind: string;
	siteId: string;
	status: JobStatus;
	startedAt: string;
	finishedAt: string | null;
	exitCode: number | null;
}

export interface StreamEvent {
	line: string;
	status: JobStatus;
	done: boolean;
}
```

- [x] **Step 2: Export `./contract`** — in `packages/api/package.json`, add to the `exports` map (mirroring the existing `./routers/*` entry): `"./contract": "./src/contract.ts"`.

- [x] **Step 3: Re-export from web** — replace the entire body of `web/src/data/types.ts` with:

```ts
export type {
	ActivityEntry,
	BackupRecord,
	HealthReport,
	Job,
	JobStatus,
	LogLine,
	MetricTile,
	NeedItem,
	ServerInfo,
	SiteOverview,
	SiteSummary,
	StagingInfo,
	StreamEvent,
	Verdict,
} from "@control-panel/api/contract";
```

- [x] **Step 4: Verify** — `bun run check-types` PASS (web fixtures/components still resolve the same names through the re-export). `bun run check` PASS.

- [x] **Step 5: Commit**

```bash
git add control-panel/packages/api/src/contract.ts control-panel/packages/api/package.json control-panel/web/src/data/types.ts
git commit -m "feat(panel): shared contract types in packages/api"
```

---

### Task 2: Redaction

**Files:**
- Create: `control-panel/server/src/core-bridge/redact.ts`
- Test: `control-panel/server/src/core-bridge/redact.test.ts`

**Interfaces:**
- Produces: `redact(text: string): string`.

- [x] **Step 1: Write the failing test** `redact.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { redact } from "./redact";

describe("redact", () => {
	it("masks KEY=VALUE secrets", () => {
		expect(redact("DB_PASSWORD=hunter2 next")).toBe("DB_PASSWORD=*** next");
		expect(redact("REDIS_PASSWORD: s3cr3t")).toBe("REDIS_PASSWORD: ***");
	});
	it("masks WordPress salts and tokens", () => {
		expect(redact("AUTH_KEY='abc def'")).toContain("AUTH_KEY=***");
		expect(redact("token=ghp_AAA111")).toBe("token=***");
	});
	it("leaves ordinary text untouched", () => {
		expect(redact("HTTP 200 OK · TLS 89 days")).toBe("HTTP 200 OK · TLS 89 days");
	});
});
```

- [x] **Step 2: Run it — FAIL.** `cd control-panel && bunx vitest run server/src/core-bridge/redact.test.ts` → "Cannot find module './redact'".

- [x] **Step 3: Implement `redact.ts`:**

```ts
const SECRET_KEY = /\b([A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|SALT|KEY|PASS|PWD|AUTH)[A-Z0-9_]*)(\s*[=:]\s*)('[^']*'|"[^"]*"|\S+)/gi;

export function redact(text: string): string {
	return text.replace(SECRET_KEY, (_match, key, sep) => `${key}${sep}***`);
}
```

- [x] **Step 4: Run it — PASS.**

- [x] **Step 5: Commit**

```bash
git add control-panel/server/src/core-bridge/redact.ts control-panel/server/src/core-bridge/redact.test.ts
git commit -m "feat(panel): output redaction"
```

---

### Task 3: Exec layer (allowlist + runVibe + streamVibe)

**Files:**
- Create: `control-panel/server/src/core-bridge/exec.ts`
- Test: `control-panel/server/src/core-bridge/exec.test.ts`

**Interfaces:**
- Consumes: `redact` (Task 2).
- Produces: `VIBE_OPS` (allowlist), `buildVibeArgv(siteDir, env, op): string[]`, `runVibe(siteDir, env, op, opts?): Promise<{ stdout; stderr; code }>`, `streamVibe(siteDir, env, op): { proc; lines: AsyncIterable<string> }`. `VibeOp = keyof typeof VIBE_OPS`. `VibeEnv = "local"|"stage"|"prod"|"external"`.

- [x] **Step 1: Write the failing test** `exec.test.ts` (the pure parts — allowlist + argv building):

```ts
import { describe, expect, it } from "vitest";

import { buildVibeArgv, VIBE_OPS } from "./exec";

describe("buildVibeArgv", () => {
	it("builds an argv for an allowed op", () => {
		expect(buildVibeArgv("/opt/acme", "prod", "smoke")).toEqual([
			"/opt/acme/bin/vibe",
			"prod",
			"smoke",
		]);
	});
	it("throws on a disallowed op", () => {
		// @ts-expect-error — intentionally invalid op
		expect(() => buildVibeArgv("/opt/acme", "prod", "rm -rf")).toThrow();
	});
	it("only exposes read/backup ops in the MVP allowlist", () => {
		expect(Object.keys(VIBE_OPS).sort()).toEqual(["backup", "backups", "smoke"]);
	});
});
```

- [x] **Step 2: Run it — FAIL.**

- [x] **Step 3: Implement `exec.ts`:**

```ts
import { redact } from "./redact";

export type VibeEnv = "local" | "stage" | "prod" | "external";

export const VIBE_OPS = {
	smoke: { argv: ["smoke"], stream: false },
	backups: { argv: ["backups"], stream: false },
	backup: { argv: ["backup"], stream: true },
} as const;

export type VibeOp = keyof typeof VIBE_OPS;

export function buildVibeArgv(
	siteDir: string,
	env: VibeEnv,
	op: VibeOp
): string[] {
	const spec = VIBE_OPS[op];
	if (!spec) {
		throw new Error(`Disallowed vibe op: ${String(op)}`);
	}
	return [`${siteDir}/bin/vibe`, env, ...spec.argv];
}

export async function runVibe(
	siteDir: string,
	env: VibeEnv,
	op: VibeOp,
	opts: { timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
	const argv = buildVibeArgv(siteDir, env, op);
	const proc = Bun.spawn(argv, { cwd: siteDir, stdout: "pipe", stderr: "pipe" });
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 60_000);
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	clearTimeout(timer);
	return { stdout: redact(stdout), stderr: redact(stderr), code };
}

export function streamVibe(siteDir: string, env: VibeEnv, op: VibeOp) {
	const proc = Bun.spawn(buildVibeArgv(siteDir, env, op), {
		cwd: siteDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	async function* lines(): AsyncIterable<string> {
		const reader = proc.stdout.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			let nl = buffer.indexOf("\n");
			while (nl !== -1) {
				yield redact(buffer.slice(0, nl));
				buffer = buffer.slice(nl + 1);
				nl = buffer.indexOf("\n");
			}
		}
		if (buffer.length > 0) {
			yield redact(buffer);
		}
	}
	return { proc, lines: lines() };
}
```

- [x] **Step 4: Run it — PASS.** (Only the pure functions are unit-tested; `runVibe`/`streamVibe` spawning is covered by the VPS gate.)

- [x] **Step 5: Commit**

```bash
git add control-panel/server/src/core-bridge/exec.ts control-panel/server/src/core-bridge/exec.test.ts
git commit -m "feat(panel): exec layer (allowlist + runVibe/streamVibe)"
```

---

### Task 4: Parsers (env, smoke, backups) + site registry

**Files:**
- Create: `control-panel/server/src/core-bridge/parse.ts`
- Test: `control-panel/server/src/core-bridge/parse.test.ts`
- Create: `control-panel/server/src/core-bridge/sites.ts`
- Modify: `control-panel/packages/env/src/server.ts`

**Interfaces:**
- Consumes: `runVibe` (Task 3).
- Produces: `parseEnvFile(text)`, `hostFromUrl(url)`, `parseSmoke(stdout)`, `parseBackups(stdout)`, and `detectSites(): Promise<DetectedSite[]>`, `findSite(siteId): Promise<DetectedSite | null>` where `DetectedSite = { id; slug; installDir; domain; hasStaging }`.

- [x] **Step 1: Write the failing test** `parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { hostFromUrl, parseBackups, parseEnvFile, parseSmoke } from "./parse";

describe("parseEnvFile", () => {
	it("reads KEY=VALUE lines, ignoring comments and quotes", () => {
		const env = parseEnvFile("# c\nWP_HOME='https://acme.com'\nFOO=bar\n");
		expect(env.WP_HOME).toBe("https://acme.com");
		expect(env.FOO).toBe("bar");
	});
});

describe("hostFromUrl", () => {
	it("extracts the hostname", () => {
		expect(hostFromUrl("https://acme.com/")).toBe("acme.com");
		expect(hostFromUrl("not a url")).toBe("not a url");
	});
});

describe("parseSmoke", () => {
	it("maps ok/failed lines to checks + overall pass", () => {
		const r = parseSmoke("ok: HTTP 200\nok: Redis connected\nfailed: TLS\n");
		expect(r.passed).toBe(false);
		expect(r.checks).toEqual([
			{ name: "HTTP 200", ok: true },
			{ name: "Redis connected", ok: true },
			{ name: "TLS", ok: false },
		]);
	});
	it("passes when no failures", () => {
		expect(parseSmoke("ok: HTTP 200\n").passed).toBe(true);
	});
});

describe("parseBackups", () => {
	it("turns backup dir paths into records, newest first", () => {
		const r = parseBackups(
			"/srv/acme/backups/local/2026-06-20T03-00-00\n/srv/acme/backups/local/2026-06-21T03-00-00\n"
		);
		expect(r).toHaveLength(2);
		expect(r[0].whenISO > r[1].whenISO).toBe(true);
		expect(r[0].location).toBe("local");
	});
});
```

- [x] **Step 2: Run it — FAIL.**

- [x] **Step 3: Implement `parse.ts`:**

```ts
import type { BackupRecord } from "@control-panel/api/contract";

export function parseEnvFile(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}
		const eq = line.indexOf("=");
		if (eq === -1) {
			continue;
		}
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

export function hostFromUrl(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

export function parseSmoke(stdout: string): {
	passed: boolean;
	checks: { name: string; ok: boolean }[];
} {
	const checks: { name: string; ok: boolean }[] = [];
	for (const raw of stdout.split("\n")) {
		const line = raw.trim();
		const ok = line.startsWith("ok:");
		const failed = line.startsWith("failed:") || line.startsWith("fail:");
		if (ok || failed) {
			checks.push({ name: line.slice(line.indexOf(":") + 1).trim(), ok });
		}
	}
	return { passed: checks.length > 0 && checks.every((c) => c.ok), checks };
}

const TS_IN_PATH = /(\d{4}-\d{2}-\d{2}[T_]\d{2}[-:]\d{2}[-:]\d{2})/;

export function parseBackups(stdout: string): BackupRecord[] {
	const records: BackupRecord[] = [];
	for (const raw of stdout.split("\n")) {
		const path = raw.trim().replace(/\/$/, "");
		if (!path) {
			continue;
		}
		const stamp = TS_IN_PATH.exec(path)?.[1] ?? "";
		const iso = stamp.replace("_", "T").replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
		records.push({
			id: path,
			location: path.includes("/offsite") || path.includes("remote") ? "offsite" : "local",
			sizeMB: 0,
			verified: true,
			whenISO: iso ? `${iso}Z` : new Date(0).toISOString(),
		});
	}
	return records.sort((a, b) => (a.whenISO < b.whenISO ? 1 : -1));
}
```

- [x] **Step 4: Run it — PASS.**

- [x] **Step 5: Add `PANEL_SITES_ROOTS` to `packages/env/src/server.ts`** — in the `server` schema add `PANEL_SITES_ROOTS: z.string().default("/opt:/srv")` (colon-separated roots to scan).

- [x] **Step 6: Implement `sites.ts`** (uses the detection logic from `installer/src/core/host.ts`, in-process):

```ts
import { env } from "@control-panel/env/server";

import { hostFromUrl, parseEnvFile } from "./parse";

export interface DetectedSite {
	domain: string;
	hasStaging: boolean;
	id: string;
	installDir: string;
	slug: string;
}

async function readFileSafe(path: string): Promise<string> {
	try {
		return await Bun.file(path).text();
	} catch {
		return "";
	}
}

export async function detectSites(): Promise<DetectedSite[]> {
	const roots = env.PANEL_SITES_ROOTS.split(":").filter(Boolean).join(" ");
	const proc = Bun.spawn(
		[
			"sh",
			"-lc",
			`for root in ${roots}; do [ -d "$root" ] && find "$root" -maxdepth 4 -type f -path '*/bin/vibe' 2>/dev/null; done`,
		],
		{ stdout: "pipe" }
	);
	const out = await new Response(proc.stdout).text();
	const dirs = out
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((p) => p.replace(/\/bin\/vibe$/, ""));

	const sites: DetectedSite[] = [];
	for (const dir of dirs) {
		const prod = parseEnvFile(await readFileSafe(`${dir}/env/prod.env`));
		const stage = parseEnvFile(await readFileSafe(`${dir}/env/stage.env`));
		const home = prod.WP_HOME ?? stage.WP_HOME;
		if (!home) {
			continue;
		}
		const slug = dir.split("/").filter(Boolean).pop() ?? dir;
		sites.push({
			id: slug,
			slug,
			installDir: dir,
			domain: hostFromUrl(home),
			hasStaging: Boolean(stage.WP_HOME),
		});
	}
	return sites;
}

export async function findSite(siteId: string): Promise<DetectedSite | null> {
	return (await detectSites()).find((s) => s.id === siteId) ?? null;
}
```

- [x] **Step 7: Verify** — `bun run test` (parsers PASS), `bun run check-types`, `bun run check`.

- [x] **Step 8: Commit**

```bash
git add control-panel/server/src/core-bridge/parse.ts control-panel/server/src/core-bridge/parse.test.ts control-panel/server/src/core-bridge/sites.ts control-panel/packages/env/src/server.ts
git commit -m "feat(panel): output parsers + site registry"
```

---

### Task 5: Line-stream + job registry

**Files:**
- Create: `control-panel/server/src/core-bridge/line-stream.ts`
- Test: `control-panel/server/src/core-bridge/line-stream.test.ts`
- Create: `control-panel/server/src/core-bridge/jobs.ts`

**Interfaces:**
- Consumes: `streamVibe` (Task 3), `findSite` (Task 4).
- Produces: `LineStream` (`push(line)`, `end(status)`, `subscribe(): AsyncIterable<StreamEvent>` that **replays buffered lines then follows**); `startBackupJob(siteId): Promise<{ jobId }>`, `getJob(jobId)`, `streamJob(jobId): AsyncIterable<StreamEvent>`.

- [x] **Step 1: Write the failing test** `line-stream.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { LineStream } from "./line-stream";

describe("LineStream", () => {
	it("replays buffered lines to a late subscriber, then ends", async () => {
		const s = new LineStream();
		s.push("a");
		s.push("b");
		s.end("succeeded");
		const seen: string[] = [];
		let status = "";
		for await (const ev of s.subscribe()) {
			if (ev.line) {
				seen.push(ev.line);
			}
			status = ev.status;
		}
		expect(seen).toEqual(["a", "b"]);
		expect(status).toBe("succeeded");
	});

	it("delivers lines pushed after subscription", async () => {
		const s = new LineStream();
		const seen: string[] = [];
		const consume = (async () => {
			for await (const ev of s.subscribe()) {
				if (ev.line) {
					seen.push(ev.line);
				}
			}
		})();
		s.push("x");
		s.push("y");
		s.end("succeeded");
		await consume;
		expect(seen).toEqual(["x", "y"]);
	});
});
```

- [x] **Step 2: Run it — FAIL.**

- [x] **Step 3: Implement `line-stream.ts`:**

```ts
import type { JobStatus, StreamEvent } from "@control-panel/api/contract";

export class LineStream {
	private buffer: string[] = [];
	private status: JobStatus = "running";
	private done = false;
	private wakers: (() => void)[] = [];

	push(line: string): void {
		this.buffer.push(line);
		this.wake();
	}

	end(status: JobStatus): void {
		this.status = status;
		this.done = true;
		this.wake();
	}

	private wake(): void {
		for (const w of this.wakers.splice(0)) {
			w();
		}
	}

	private wait(): Promise<void> {
		return new Promise((resolve) => this.wakers.push(resolve));
	}

	async *subscribe(): AsyncIterable<StreamEvent> {
		let cursor = 0;
		for (;;) {
			while (cursor < this.buffer.length) {
				yield { line: this.buffer[cursor], status: this.status, done: false };
				cursor++;
			}
			if (this.done) {
				yield { line: "", status: this.status, done: true };
				return;
			}
			await this.wait();
		}
	}
}
```

- [x] **Step 4: Run it — PASS.**

- [x] **Step 5: Implement `jobs.ts`** (in-memory registry; persistence to the `jobs` table is wired in Task 9):

```ts
import type { Job, StreamEvent } from "@control-panel/api/contract";

import { streamVibe } from "./exec";
import { LineStream } from "./line-stream";
import { findSite } from "./sites";

interface JobEntry {
	job: Job;
	stream: LineStream;
}

const registry = new Map<string, JobEntry>();

export function getJob(jobId: string): Job | null {
	return registry.get(jobId)?.job ?? null;
}

export function streamJob(jobId: string): AsyncIterable<StreamEvent> {
	const entry = registry.get(jobId);
	if (!entry) {
		throw new Error("Unknown job");
	}
	return entry.stream.subscribe();
}

export async function startBackupJob(siteId: string): Promise<{ jobId: string }> {
	const site = await findSite(siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	const jobId = crypto.randomUUID();
	const stream = new LineStream();
	const job: Job = {
		id: jobId,
		kind: "backup",
		siteId,
		status: "running",
		startedAt: new Date().toISOString(),
		finishedAt: null,
		exitCode: null,
	};
	registry.set(jobId, { job, stream });

	void (async () => {
		const { proc, lines } = streamVibe(site.installDir, "prod", "backup");
		for await (const line of lines) {
			stream.push(line);
		}
		const code = await proc.exited;
		job.exitCode = code;
		job.status = code === 0 ? "succeeded" : "failed";
		job.finishedAt = new Date().toISOString();
		stream.end(job.status);
	})();

	return { jobId };
}
```

- [x] **Step 6: Verify + commit** — `bun run test` (line-stream PASS), `bun run check-types`, `bun run check`.

```bash
git add control-panel/server/src/core-bridge/line-stream.ts control-panel/server/src/core-bridge/line-stream.test.ts control-panel/server/src/core-bridge/jobs.ts
git commit -m "feat(panel): line-stream + job registry (backup)"
```

---

# Phase 2 — Auth & roles

### Task 6: DB schema — role + jobs/audit tables

**Files:**
- Modify: `control-panel/packages/db/src/schema/auth.ts`
- Create: `control-panel/packages/db/src/schema/jobs.ts`
- Modify: `control-panel/packages/db/src/index.ts`
- Modify: `control-panel/packages/db/drizzle.config.ts`

**Interfaces:**
- Produces: `user.role` column; `jobs`, `auditLog` tables registered in the db schema.

- [x] **Step 1: Add `role` to `user`** in `schema/auth.ts` — after the `image` column add:

```ts
	role: text("role").notNull().default("viewer"),
```

- [x] **Step 2: Create `schema/jobs.ts`:**

```ts
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const jobs = sqliteTable("jobs", {
	id: text("id").primaryKey(),
	kind: text("kind").notNull(),
	siteId: text("site_id").notNull(),
	status: text("status").notNull(),
	exitCode: integer("exit_code"),
	startedAt: integer("started_at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
	finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

export const auditLog = sqliteTable("audit_log", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	action: text("action").notNull(),
	siteId: text("site_id"),
	jobId: text("job_id"),
	at: integer("at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});
```

- [x] **Step 3: Register in `db/src/index.ts`** — import `{ jobs, auditLog }` from `./schema/jobs` and add them to the `schema` object passed to `drizzle({ client, schema })`.

- [x] **Step 4: Glob the schema** in `drizzle.config.ts` — change `schema: "./src/schema/auth.ts"` to `schema: "./src/schema/*.ts"`.

- [x] **Step 5: Apply** — from `control-panel/`: `bun run db:push` → expect "changes applied" (adds the `role` column + two tables to `local.db`).

- [x] **Step 6: Verify + commit** — `bun run check-types` PASS.

```bash
git add control-panel/packages/db/src/schema/auth.ts control-panel/packages/db/src/schema/jobs.ts control-panel/packages/db/src/index.ts control-panel/packages/db/drizzle.config.ts
git commit -m "feat(panel): user.role + jobs/audit tables"
```

---

### Task 7: better-auth admin plugin + roles + bootstrap

**Files:**
- Modify: `control-panel/packages/auth/src/index.ts`

**Interfaces:**
- Produces: roles `admin`/`operator`/`viewer`; first user → `admin`; rate-limited sign-in; `role` on the session user.

- [x] **Step 1: Rewrite `packages/auth/src/index.ts`** to add the plugin + AC + role field + bootstrap hook + rate limit (keeping the existing adapter/cookie config):

```ts
import { createDb } from "@control-panel/db";
import { account, session, user, verification } from "@control-panel/db/schema/auth";
import { env } from "@control-panel/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";

const authSchema = { account, session, user, verification };

const ac = createAccessControl({
	site: ["read", "operate", "manage"],
	server: ["read", "manage"],
	team: ["manage"],
});

const roles = {
	viewer: ac.newRole({ site: ["read"], server: ["read"] }),
	operator: ac.newRole({ site: ["read", "operate"], server: ["read"] }),
	admin: ac.newRole({
		site: ["read", "operate", "manage"],
		server: ["read", "manage"],
		team: ["manage"],
	}),
};

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: { enabled: true },
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		user: {
			additionalFields: {
				role: { type: "string", input: false, defaultValue: "viewer" },
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (newUser) => {
						const existing = await db.select({ id: user.id }).from(user).limit(1);
						return {
							data: { ...newUser, role: existing.length === 0 ? "admin" : "viewer" },
						};
					},
				},
			},
		},
		rateLimit: {
			enabled: true,
			storage: "database",
			customRules: { "/sign-in/email": { window: 10, max: 5 } },
		},
		advanced: {
			defaultCookieAttributes: { sameSite: "none", secure: true, httpOnly: true },
		},
		plugins: [admin({ ac, roles, adminRoles: ["admin"] })],
	});
}

export const auth = createAuth();
```

- [x] **Step 2: Migrate rate-limit storage** — `bun run db:push` (better-auth's `rateLimit` table is created by its schema; if `db:push` does not pick it up, the admin plugin tables are managed by better-auth at runtime — confirm sign-in still works in Task 14).

- [x] **Step 3: Verify + commit** — `bun run check-types` PASS, `bun run check` PASS.

```bash
git add control-panel/packages/auth/src/index.ts
git commit -m "feat(panel): admin plugin + access-control roles + first-user bootstrap + rate limit"
```

---

### Task 8: Role-guarded procedures

**Files:**
- Modify: `control-panel/packages/api/src/procedures.ts`

**Interfaces:**
- Consumes: `o` (`orpc/base`), `protectedProcedure`.
- Produces: `operatorProcedure`, `adminProcedure`.

- [x] **Step 1: Append to `packages/api/src/procedures.ts`:**

```ts
import { ORPCError } from "@orpc/server";

const RANK: Record<string, number> = { viewer: 0, operator: 1, admin: 2 };

function requireRole(min: "operator" | "admin") {
	return o.middleware(({ context, next }) => {
		const role = (context.session?.user as { role?: string } | undefined)?.role ?? "viewer";
		if ((RANK[role] ?? -1) < RANK[min]) {
			throw new ORPCError("FORBIDDEN");
		}
		return next({ context });
	});
}

export const operatorProcedure = protectedProcedure.use(requireRole("operator"));
export const adminProcedure = protectedProcedure.use(requireRole("admin"));
```

- [x] **Step 2: Verify + commit** — `bun run check-types`, `bun run check`.

```bash
git add control-panel/packages/api/src/procedures.ts
git commit -m "feat(panel): operator/admin role-guarded procedures"
```

---

# Phase 3 — Procedures + frontend flip

### Task 9: sites + backups + operations routers

**Files:**
- Create: `control-panel/packages/api/src/routers/sites.ts`, `backups.ts`, `operations.ts`
- Modify: `control-panel/packages/api/src/routers/index.ts`

> The core-bridge lives in `server/src`. To keep the router import clean, these routers import the core-bridge via a relative path from `packages/api` is NOT possible (separate package); instead the **routers call small server-provided functions re-exported from `@control-panel/api`'s peer**. Simplest correct approach for the MVP: move the core-bridge modules under `packages/api/src/core-bridge/` (so the API package owns them) and have `server` import the routers as today. **Do this:** in Tasks 2–5 the files were created under `server/src/core-bridge/`; relocate them to `packages/api/src/core-bridge/` now (one `git mv` + fix the two `@control-panel/api/contract` imports, which become relative `../contract`). Then routers import `./../core-bridge/...`.

- [x] **Step 1: Relocate the core-bridge into the api package:**

```bash
git mv control-panel/server/src/core-bridge control-panel/packages/api/src/core-bridge
```
Then in the moved `parse.ts`, `line-stream.ts`, `jobs.ts`, change `@control-panel/api/contract` imports to `../contract`. Run `bun run check-types` → PASS.

- [x] **Step 2: Create `routers/sites.ts`:**

```ts
import type { SiteOverview, SiteSummary } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseBackups, parseSmoke } from "../core-bridge/parse";
import { detectSites, findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

async function siteStatus(installDir: string): Promise<SiteSummary["status"]> {
	const { stdout, code } = await runVibe(installDir, "prod", "smoke");
	return code === 0 && parseSmoke(stdout).passed ? "good" : "act";
}

export const sitesRouter = {
	sitesList: protectedProcedure.handler(async (): Promise<SiteSummary[]> => {
		const sites = await detectSites();
		return Promise.all(
			sites.map(async (s) => ({
				id: s.id,
				name: s.slug,
				domain: s.domain,
				hasStaging: s.hasStaging,
				status: await siteStatus(s.installDir),
				lastBackupISO:
					parseBackups((await runVibe(s.installDir, "prod", "backups")).stdout)[0]
						?.whenISO ?? new Date(0).toISOString(),
			}))
		);
	}),

	siteOverview: protectedProcedure
		.input((await import("zod")).z.object({ siteId: (await import("zod")).z.string() }))
		.handler(async ({ input }): Promise<SiteOverview> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new Error("Unknown site");
			}
			const { stdout } = await runVibe(site.installDir, "prod", "smoke");
			const smoke = parseSmoke(stdout);
			const status = smoke.passed ? "good" : "act";
			return {
				siteId: site.id,
				status,
				headline: smoke.passed
					? `${site.slug} is healthy.`
					: `${site.slug} needs attention.`,
				subline: site.domain,
				needs: [],
				tiles: smoke.checks.slice(0, 4).map((c) => ({
					key: c.name,
					label: c.name,
					verdict: c.ok ? "good" : "act",
					value: c.ok ? "OK" : "Failing",
					detail: c.name,
					help: "From the latest smoke check.",
				})),
				safety: {
					backupText: "Backups available",
					backupDetail: "See the Backups tab",
					securityText: "Managed by Vibe WP",
					securityDetail: "Firewall + auto-updates",
				},
				activity: [],
			};
		}),
};
```

> Note: replace the inline `await import("zod")` with a top-level `import { z } from "zod";` and use `z.object(...)` — shown inline only to flag the input schema; the implementer must use the normal top-level import (zod is a workspace dep).

- [x] **Step 3: Create `routers/backups.ts`:**

```ts
import { z } from "zod";

import type { BackupRecord } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { startBackupJob } from "../core-bridge/jobs";
import { parseBackups } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { operatorProcedure, protectedProcedure } from "../procedures";

export const backupsRouter = {
	backupsList: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<BackupRecord[]> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new Error("Unknown site");
			}
			return parseBackups((await runVibe(site.installDir, "prod", "backups")).stdout);
		}),

	backupsRun: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input }): Promise<{ jobId: string }> => startBackupJob(input.siteId)),
};
```

- [x] **Step 4: Create `routers/operations.ts`** (the SSE event iterator):

```ts
import { eventIterator } from "@orpc/server";
import { z } from "zod";

import type { Job, StreamEvent } from "../contract";
import { getJob, streamJob } from "../core-bridge/jobs";
import { protectedProcedure } from "../procedures";

const streamEvent = z.object({
	line: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
	done: z.boolean(),
});

export const operationsRouter = {
	operationsGet: protectedProcedure
		.input(z.object({ jobId: z.string() }))
		.handler(({ input }): Job => {
			const job = getJob(input.jobId);
			if (!job) {
				throw new Error("Unknown job");
			}
			return job;
		}),

	operationsStream: protectedProcedure
		.input(z.object({ jobId: z.string() }))
		.output(eventIterator(streamEvent))
		.handler(async function* ({ input }): AsyncGenerator<StreamEvent> {
			for await (const ev of streamJob(input.jobId)) {
				yield ev;
			}
		}),
};
```

- [x] **Step 5: Spread into `routers/index.ts`:**

```ts
import { backupsRouter } from "./backups";
import { controlOverviewRouter } from "./control-overview";
import { healthRouter } from "./health";
import { operationsRouter } from "./operations";
import { sitesRouter } from "./sites";

export const appRouter = {
	...healthRouter,
	...controlOverviewRouter,
	...sitesRouter,
	...backupsRouter,
	...operationsRouter,
};
```

- [x] **Step 6: Verify + commit** — `bun run check-types` (the whole oRPC contract must infer; fix any zod/type mismatch), `bun run check`.

```bash
git add control-panel/packages/api/src/routers control-panel/packages/api/src/core-bridge
git commit -m "feat(panel): sites/backups/operations routers over the exec layer"
```

---

### Task 10: Flip the web data seam to oRPC

**Files:**
- Modify: `control-panel/web/src/data/queries.ts`
- Modify: `control-panel/web/src/components/patterns/operation-runner.tsx`
- Modify: `control-panel/web/src/routes/_auth/sites/$siteId/backups.tsx`

**Interfaces:**
- Consumes: `orpc` (the TanStack utils from `web/src/lib/orpc/client.ts`), the `client` for the stream.

- [ ] **Step 1: Flip `queries.ts`** — replace the fixture factories with oRPC `queryOptions` (keep the function names + signatures; consuming `useQuery(xQuery(...))` call sites are unchanged):

```ts
import { orpc } from "@/lib/orpc/client";

export const sitesQuery = () => orpc.sitesList.queryOptions();
export const siteOverviewQuery = (siteId: string) =>
	orpc.siteOverview.queryOptions({ input: { siteId } });
export const backupsQuery = (siteId: string) =>
	orpc.backupsList.queryOptions({ input: { siteId } });
```

> Keep `serverInfoQuery`, `healthQuery`, `logsQuery`, `stagingQuery` on fixtures for now (their procedures arrive in the fan-out) — they continue to import from `./fixtures`. Leave those four untouched.

- [ ] **Step 2: Wire `OperationRunner` to the live stream** — change its props from `lines: string[]` to `jobId: string | null`, and consume the SSE iterator via the oRPC client:

```tsx
import { client } from "@/lib/orpc/client";
// inside the component:
useEffect(() => {
	if (!(open && jobId)) {
		return;
	}
	let active = true;
	(async () => {
		const iterator = await client.operationsStream({ jobId });
		for await (const ev of iterator) {
			if (!active) {
				break;
			}
			setLines((prev) => [...prev, ev.line].filter(Boolean));
			if (ev.done) {
				setDone(true);
			}
		}
	})();
	return () => {
		active = false;
	};
}, [open, jobId]);
```
(Keep the existing `Dialog` + `Progress` + `ScrollArea` markup; `setDone`/`setLines` replace the timer-driven state.)

- [ ] **Step 3: Start the job from `backups.tsx`** — the "Back up now" button calls the mutation then opens the runner with the returned `jobId`:

```tsx
const runBackup = useMutation(orpc.backupsRun.mutationOptions());
// onClick:
const { jobId } = await runBackup.mutateAsync({ siteId });
setJobId(jobId);
setRunnerOpen(true);
// <OperationRunner jobId={jobId} open={runnerOpen} onOpenChange={setRunnerOpen} title={`Backing up ${siteId}`} />
```

- [ ] **Step 4: Verify** — `bun run check-types`, `bun run check`. (Live behavior is proven in Task 14.)

- [ ] **Step 5: Commit**

```bash
git add control-panel/web/src/data/queries.ts control-panel/web/src/components/patterns/operation-runner.tsx control-panel/web/src/routes/_auth/sites/\$siteId/backups.tsx
git commit -m "feat(panel): flip sites/overview/backups to oRPC + live backup stream"
```

---

# Phase 4 — Install & VPS validation

### Task 11: `bin/panel install`

**Files:**
- Create: `bin/panel`

**Interfaces:**
- Produces: `bin/panel install --domain <sub> --admin-email <e> [--port N] [--admin-password P]`, `bin/panel status`, `bin/panel uninstall [--purge]`.

- [ ] **Step 1: Create `bin/panel`** (POSIX sh; mirrors `installer/src/core/backup.ts` systemd + `caddyfile.ts`/`task-runner.ts` Caddy patterns):

```sh
#!/bin/sh
set -eu

PANEL_DIR=/opt/vibe-wp-panel
REPO_DIR="$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
UNIT=vibe-wp-panel
PORT=4000

if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi

usage() { echo "Usage: bin/panel <install|status|uninstall> [--domain d --admin-email e --port N --admin-password P --purge]"; exit 1; }

cmd="${1:-}"; [ -n "$cmd" ] || usage; shift || true
DOMAIN=""; ADMIN_EMAIL=""; ADMIN_PASSWORD=""; PURGE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --purge) PURGE=1; shift ;;
    *) usage ;;
  esac
done

install_panel() {
  [ -n "$DOMAIN" ] || { printf 'Subdomain for the panel: '; read -r DOMAIN; }
  [ -n "$ADMIN_EMAIL" ] || { printf 'Owner email: '; read -r ADMIN_EMAIL; }
  if ! command -v bun >/dev/null 2>&1; then
    echo "Installing Bun..."
    curl -fsSL https://bun.sh/install | $SUDO env BUN_INSTALL=/usr/local bash
  fi
  BUN="$(command -v bun || echo /usr/local/bin/bun)"

  # DNS preflight
  ip="$(curl -fsS https://api.ipify.org || true)"
  resolved="$(getent ahosts "$DOMAIN" | awk 'NR==1{print $1}')"
  [ -z "$ip" ] || [ "$resolved" = "$ip" ] || echo "WARN: $DOMAIN resolves to '${resolved:-none}', server is '$ip'. Add an A record."

  # Build
  $SUDO install -d -m 0755 "$PANEL_DIR" "$PANEL_DIR/data"
  ( cd "$REPO_DIR/control-panel" && bun install --production=false && bun run build )
  $SUDO cp -R "$REPO_DIR/control-panel" "$PANEL_DIR/app"

  # Env
  SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '/+=' | cut -c1-44)"
  printf '%s\n' \
    "DATABASE_URL=file:$PANEL_DIR/data/panel.db" \
    "BETTER_AUTH_SECRET=$SECRET" \
    "BETTER_AUTH_URL=https://$DOMAIN" \
    "CORS_ORIGIN=https://$DOMAIN" \
    "NODE_ENV=production" \
    "PANEL_SITES_ROOTS=/opt:/srv" \
    | $SUDO tee "$PANEL_DIR/app/server/.env" >/dev/null

  # DB migrate
  ( cd "$PANEL_DIR/app" && DATABASE_URL="file:$PANEL_DIR/data/panel.db" bun run db:push )

  # systemd service (Bun runtime, dedicated user)
  id vibe-panel >/dev/null 2>&1 || $SUDO useradd --system --home "$PANEL_DIR" --shell /usr/sbin/nologin vibe-panel || true
  $SUDO usermod -aG docker vibe-panel || true
  $SUDO chown -R vibe-panel:vibe-panel "$PANEL_DIR"
  service="[Unit]
Description=Vibe WP control panel
After=network.target docker.service
[Service]
Type=simple
User=vibe-panel
WorkingDirectory=$PANEL_DIR/app/server
Environment=PORT=$PORT
ExecStart=$BUN run src/index.ts
Restart=always
[Install]
WantedBy=multi-user.target"
  printf '%s\n' "$service" | $SUDO tee /etc/systemd/system/$UNIT.service >/dev/null
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now $UNIT.service

  # Caddy snippet
  $SUDO install -d -m 0755 /etc/caddy/sites-enabled
  [ -f /etc/caddy/Caddyfile ] || printf '%s\n' 'import /etc/caddy/sites-enabled/*.caddy' | $SUDO tee /etc/caddy/Caddyfile >/dev/null
  grep -q 'sites-enabled/\*.caddy' /etc/caddy/Caddyfile || printf '\n%s\n' 'import /etc/caddy/sites-enabled/*.caddy' | $SUDO tee -a /etc/caddy/Caddyfile >/dev/null
  printf '%s\n' "$DOMAIN {
	reverse_proxy localhost:$PORT
}" | $SUDO tee /etc/caddy/sites-enabled/vibe-wp-panel.caddy >/dev/null
  $SUDO caddy validate --config /etc/caddy/Caddyfile && $SUDO systemctl reload caddy

  # Smoke + owner bootstrap (first user becomes admin via the DB hook; password never echoed)
  sleep 2
  curl -fsS "http://localhost:$PORT/" >/dev/null && echo "panel: service up"
  if [ -z "$ADMIN_PASSWORD" ]; then printf 'Owner password (min 8): '; stty -echo; read -r ADMIN_PASSWORD; stty echo; echo; fi
  curl -fsS -X POST "http://localhost:$PORT/api/auth/sign-up/email" \
    -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s","password":"%s","name":"Owner"}' "$ADMIN_EMAIL" "$ADMIN_PASSWORD")" >/dev/null \
    && echo "panel: owner account created"
  echo "Done. Open https://$DOMAIN and sign in."
}

status_panel() { systemctl status $UNIT.service --no-pager || true; }

uninstall_panel() {
  $SUDO systemctl disable --now $UNIT.service 2>/dev/null || true
  $SUDO rm -f /etc/systemd/system/$UNIT.service /etc/caddy/sites-enabled/vibe-wp-panel.caddy
  $SUDO systemctl daemon-reload
  command -v caddy >/dev/null 2>&1 && $SUDO caddy validate --config /etc/caddy/Caddyfile && $SUDO systemctl reload caddy || true
  [ "$PURGE" = 1 ] && $SUDO rm -rf "$PANEL_DIR" && echo "panel: purged"
  echo "panel: uninstalled"
}

case "$cmd" in
  install) install_panel ;;
  status) status_panel ;;
  uninstall) uninstall_panel ;;
  *) usage ;;
esac
```

- [ ] **Step 2: Make executable + lint** — `chmod +x bin/panel`; if the repo has a shell linter (`shellcheck`), run `shellcheck bin/panel` and fix warnings. Confirm `bin/panel` (no args) prints usage and exits non-zero.

- [ ] **Step 3: Commit**

```bash
git add bin/panel
git commit -m "feat: bin/panel install/status/uninstall (host-native panel deploy)"
```

---

### Task 12: Real-VPS validation (acceptance gate)

**Files:** none (validation only).

This is the spec's acceptance gate — it proves the chain on real hardware. Use the disposable test VPS (SSH details in local-only agent docs / CLAUDE.md, never tracked).

- [ ] **Step 1: Ship the branch to the VPS** — push the branch and `git clone`/`pull` it on the VPS into a working dir (the panel install copies it to `/opt/vibe-wp-panel`).

- [ ] **Step 2: Install** — `./bin/panel install --domain panel.<test-domain> --admin-email you@example.com`. Expected: DNS ✓ (or warn), build OK, `db:push` applied, `vibe-wp-panel.service` active, Caddy reloaded with a valid cert, "service up" + "owner account created", final "Open https://panel… and sign in."

- [ ] **Step 3: Verify the chain in a browser** — visit `https://panel.<test-domain>`, sign in as the owner. Expect: **real sites** listed (the VPS's actual Vibe WP installs), a site **Overview** showing the real smoke verdict, the **Backups** tab listing real backups, and **"Back up now"** streaming live redacted lines to completion via SSE.

- [ ] **Step 4: Verify role + redaction** — confirm the owner is `admin` (can run backup); spot-check that no secret values (DB/Redis passwords, salts) appear in the streamed log or any response.

- [ ] **Step 5: Record the result** — note pass/fail per step in the PR description / `docs/product-roadmap.md` validation log (matching the project's existing "validated on real hardware" entries). On failure, capture the failing step's output and fix before merge.

---

## Self-Review (completed during planning)

**Spec coverage (MVP slice):** §3 exec-layer chokepoint → Tasks 2–5; §4 allowlist/redaction/per-site `bin/vibe` → Tasks 2–4; §5 contract + job/SSE → Tasks 1, 5, 9; §6 admin plugin + AC + `input:false` bootstrap + rate-limit → Tasks 6–8; §7 `bin/panel install` (systemd + Caddy + Bun-runtime + owner bootstrap) → Task 11; §9 build order (foundation → vertical slice → VPS gate) → Phases 1–4; §10 testing (TDD pure logic + VPS gate) → throughout + Task 12. **Deferred to the fan-out plan (per spec §9/§11):** health/staging/logs/lifecycle/updates/server/team domains, the `--json` `bin/vibe` modes, the polished §7a TUI install screen, audit-log writes on every mutation, and `serverInfo`/`health`/`logs`/`staging` query flips (left on fixtures in Task 10).

**Placeholder scan:** the only inline `await import("zod")` in Task 9 Step 2 is explicitly flagged with the correction to use a top-level `import { z } from "zod"`; no other TODO/TBD. Task 9 Step 1 relocates the core-bridge into `packages/api` so the routers can import it (resolving the cross-package boundary).

**Type consistency:** `DetectedSite`, `VibeOp`/`VibeEnv`, `VIBE_OPS`, `LineStream.subscribe()→StreamEvent`, `Job`/`StreamEvent`/`JobStatus`, and the procedure names (`sitesList`, `siteOverview`, `backupsList`, `backupsRun`, `operationsGet`, `operationsStream`) are used identically between their defining task and every consumer (routers + the web flip in Task 10).
