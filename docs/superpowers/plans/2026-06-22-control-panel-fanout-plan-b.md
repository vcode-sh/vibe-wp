# Control Panel Fan-Out — Plan B: Operations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every panel *operation* real — lifecycle (up/down/restart/cache-flush), backup verify/restore, staging refresh/promote/attach, WP updates, and host harden — each as a role-gated, streamed, audited job, with destructive ones behind `SafetyConfirm`.

**Architecture:** Generalize the single-op job runner to `startJob({ op, siteId, env, kind, args, userId, action })`, store the child process so a job can be **canceled**, and write an **audit row** per op. Extend the exec allowlist with the operation ops (mandatory `--yes` on `restore`/`refresh`/`promote`; `stage` env on staging ops; a backup-id arg on `restore`/`verify`). Each op is one `operator`/`admin` procedure returning `{ jobId }`; the web wires it to the existing `OperationRunner` (SSE) + `SafetyConfirm`. The Overview activity timeline reads the real `auditLog`.

**Tech Stack:** Bun · Hono · oRPC `@orpc/server@1.14.6` (event iterators) · Drizzle/libsql · zod 4 · TanStack Query.

Spec: `docs/superpowers/specs/2026-06-21-control-panel-fanout-design.md` (read §2, §2a, §4 Plan B). Plan A (reads) is done + VPS-validated; Plan C (team + hardening) follows.

## Global Constraints

- **TABS** in `control-panel` TS/TSX (ultracite). TS/TSX ≤220 lines (split modules).
- **Exec layer is the only host-spawn site** — every op is an allowlisted argv array (via `Bun.spawn`, no shell) with a timeout + redaction. No host spawns from route handlers/UI.
- **No flag/verb injection** — `buildVibeArgv` rejects any caller arg starting with `-` (no flag smuggling), and WP ops are fully scoped (`argv` holds the complete wp-cli subcommand; the caller never picks the verb). Only `restore`/`backupVerify` accept a caller arg (a backup id).
- **Mandatory `--yes`** on `restore`, `refresh-from-prod`, `promote-files-to-prod` — without it they block forever on a stdin prompt (no tty). The exec layer appends it via a `yes` flag; the UI's `SafetyConfirm` replaces the shell confirmation.
- **Staging ops run with `env="stage"`** (`refresh-from-prod`/`promote-files-to-prod` are a stage→prod pair invoked as `bin/vibe stage <cmd>`).
- **Role tiers:** `up`/`restart`/`cacheFlush`/`backupVerify`/`refresh`/`updatesApply` = **operator+**; `down`/`restore`/`promote`/`harden`/`attach` = **admin**. `available`/lists = viewer+.
- **Every mutating procedure writes an `auditLog` row** `{ userId, action, siteId?, jobId?, at }`.
- **Jobs are cancelable** — store the child `proc`; `operationsCancel` does `proc.kill()` → status `canceled`.
- **Gate per task** from `control-panel/`: `bun run check-types`, `bun run check`, `bun run test` pass. TDD the pure logic (arg building, audit/action mapping). Streaming + the real ops are proven at the VPS gate (Task 11).
- **No team/auth changes** (Plan C). **English; no secrets in logs.**

## Testing approach

TDD `buildVibeArgv` (args + `--yes` ordering, disallowed-arg guard), the `action → ActivityEntry.kind` map, and the audit-row builder — pure, no host. The job/SSE/cancel round-trip and the real `bin/vibe` ops are proven at the **VPS re-validation gate** (Task 11) on `panel.vcode.sh` (run a real restore, a staging refresh, and a harden with live redacted streams + audit entries; confirm cancel kills the process).

---

## File Structure

**Modified (api):**
- `packages/api/src/core-bridge/exec.ts` — extend `VIBE_OPS` with operation ops; `buildVibeArgv`/`runVibe`/`streamVibe` accept `extraArgs`; `yes`/`takesArg` op flags.
- `packages/api/src/core-bridge/exec.test.ts` — arg/yes/guard tests.
- `packages/api/src/core-bridge/jobs.ts` — `startJob(input)` (generalized) + `cancelJob`; store `proc`; audit on start.
- `packages/api/src/core-bridge/jobs-db.ts` — add `writeAudit`, `recentAudit`.
- `packages/api/src/core-bridge/audit.ts` — `actionToKind`, `auditToActivity` (pure).
- `packages/api/src/core-bridge/audit.test.ts`
- `packages/api/src/routers/operations.ts` — add `operationsCancel`.
- `packages/api/src/routers/backups.ts` — add `backupsVerify`, `backupsRestore`.
- `packages/api/src/routers/staging.ts` — add `stagingRefresh`, `stagingPromote`.
- `packages/api/src/routers/server.ts` — add `serverHarden`.
- `packages/api/src/routers/sites.ts` — `siteOverview.activity` reads `recentAudit`.
- `packages/api/src/routers/index.ts` — spread new routers.

**Created (api):** `packages/api/src/routers/lifecycle.ts`, `updates.ts`.

**Modified (web):**
- `web/src/data/queries.ts` — mutation factories for the new ops; `updatesAvailableQuery`.
- `web/src/routes/_auth/sites/$siteId/backups.tsx` — wire Restore (SafetyConfirm + Runner).
- `web/src/routes/_auth/sites/$siteId/staging.tsx` — wire Refresh/Promote.
- `web/src/routes/_auth/sites/$siteId/overview.tsx` — Update-now action; real activity already flows.
- `web/src/routes/_auth/server.tsx` — wire Harden/Stop.

---

# Phase 1 — Generalized job runner

### Task 1: Exec layer — operation ops + parameterized argv

**Files:**
- Modify: `control-panel/packages/api/src/core-bridge/exec.ts`
- Test: `control-panel/packages/api/src/core-bridge/exec.test.ts`

**Interfaces:**
- Produces: `VIBE_OPS` gains `up`/`down`/`restart`/`cacheFlush`/`restore`/`backupVerify`/`refresh`/`promote`/`harden`/`wpCoreUpdate`/`wpPluginUpdateAll`/`wpPluginUpdates`; `buildVibeArgv(siteDir, env, op, extraArgs?)` (rejects flag-like args); `streamVibe(siteDir, env, op, { timeoutMs?, args? })`; `runVibe(siteDir, env, op, { timeoutMs?, args? })`.

- [ ] **Step 1: Extend `VIBE_OPS`** in `exec.ts` (after the existing read ops):

```ts
	up: { argv: ["up"], stream: true },
	down: { argv: ["down"], stream: true },
	restart: { argv: ["restart"], stream: true },
	cacheFlush: { argv: ["cache-flush"], stream: true },
	restore: { argv: ["restore"], stream: true, takesArg: true, yes: true },
	backupVerify: { argv: ["backup-verify"], stream: true, takesArg: true },
	refresh: { argv: ["refresh-from-prod"], stream: true, yes: true },
	promote: { argv: ["promote-files-to-prod"], stream: true, yes: true },
	harden: { argv: ["harden"], stream: true },
	wpCoreUpdate: { argv: ["wp", "core", "update"], stream: true },
	wpPluginUpdateAll: { argv: ["wp", "plugin", "update", "--all"], stream: true },
	wpPluginUpdates: {
		argv: ["wp", "plugin", "list", "--update=available", "--format=json"],
		stream: false,
	},
```

**Security (exec-boundary hardening, mandatory):** WP ops are **fully scoped** — `argv` already contains the entire wp-cli subcommand, so a caller can never choose the verb (no `wp <caller-arg>`). The only ops that accept a caller arg are `restore`/`backupVerify` (a backup id), and `buildVibeArgv` (Step 5) **rejects any arg starting with `-`** so a value like `--config=…` can't be smuggled in as a flag. `Bun.spawn` uses the argv-array form (no shell), so there is no shell-metacharacter vector — flag injection is the only one, and the `-` guard closes it.

- [ ] **Step 2: Update the existing allowlist assertion** in `exec.test.ts` — the current test hard-codes `Object.keys(VIBE_OPS).sort()` to exactly the 5 read ops (`backup`/`backups`/`doctorRuntime`/`logsRecent`/`smoke`); Task 1 adds 11 ops, so it must be widened:

```ts
	it("exposes the allowlisted read + operation ops", () => {
		expect(Object.keys(VIBE_OPS).sort()).toEqual([
			"backup",
			"backupVerify",
			"backups",
			"cacheFlush",
			"doctorRuntime",
			"down",
			"harden",
			"logsRecent",
			"promote",
			"refresh",
			"restart",
			"restore",
			"smoke",
			"up",
			"wpCoreUpdate",
			"wpPluginUpdateAll",
			"wpPluginUpdates",
		]);
	});
```

- [ ] **Step 3: Write the failing arg tests** in `exec.test.ts`:

```ts
describe("buildVibeArgv operations", () => {
	it("appends extra args then --yes for restore", () => {
		expect(buildVibeArgv("/opt/acme", "prod", "restore", ["/b/2026"])).toEqual([
			"/opt/acme/bin/vibe",
			"prod",
			"restore",
			"/b/2026",
			"--yes",
		]);
	});
	it("runs staging refresh with --yes and no arg", () => {
		expect(buildVibeArgv("/opt/acme", "stage", "refresh")).toEqual([
			"/opt/acme/bin/vibe",
			"stage",
			"refresh-from-prod",
			"--yes",
		]);
	});
	it("rejects args for an op that does not take them", () => {
		expect(() => buildVibeArgv("/opt/acme", "prod", "up", ["x"])).toThrow();
	});
	it("rejects flag-like args (no smuggled flags)", () => {
		expect(() =>
			buildVibeArgv("/opt/acme", "prod", "restore", ["--config=/etc/x"])
		).toThrow();
	});
});
```

- [ ] **Step 4: Run it — FAIL.** `cd control-panel && bunx vitest run packages/api/src/core-bridge/exec.test.ts -t "buildVibeArgv operations"`.

- [ ] **Step 5: Generalize `buildVibeArgv`** (replace the existing function):

```ts
export function buildVibeArgv(
	siteDir: string,
	env: VibeEnv,
	op: VibeOp,
	extraArgs: string[] = []
): string[] {
	const spec = VIBE_OPS[op] as {
		argv: readonly string[];
		stream: boolean;
		takesArg?: boolean;
		yes?: boolean;
	};
	if (!spec) {
		throw new Error(`Disallowed vibe op: ${String(op)}`);
	}
	if (extraArgs.length > 0 && !spec.takesArg) {
		throw new Error(`Op ${String(op)} does not accept arguments`);
	}
	for (const arg of extraArgs) {
		if (arg.startsWith("-")) {
			throw new Error(`Refusing flag-like argument for ${String(op)}: ${arg}`);
		}
	}
	return [
		`${siteDir}/bin/vibe`,
		env,
		...spec.argv,
		...extraArgs,
		...(spec.yes ? ["--yes"] : []),
	];
}
```

- [ ] **Step 6: Thread `args` through `runVibe`/`streamVibe`** — change both to accept `args` in their opts and pass to `buildVibeArgv`. In `runVibe` and `streamVibe`, the spawn line becomes `Bun.spawn(buildVibeArgv(siteDir, env, op, opts.args ?? []), …)`. Add `args?: string[]` to each opts type.

- [ ] **Step 7: Run it — PASS.** **Step 8: Verify** `bun run check-types`/`check`/`test`. **Step 9: Commit:**

```bash
git add control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/exec.test.ts
git commit -m "feat(panel): operation ops + parameterized buildVibeArgv (args + --yes)"
```

---

### Task 2: Audit helpers (pure) + db writes

**Files:**
- Create: `control-panel/packages/api/src/core-bridge/audit.ts`
- Test: `control-panel/packages/api/src/core-bridge/audit.test.ts`
- Modify: `control-panel/packages/api/src/core-bridge/jobs-db.ts`

**Interfaces:**
- Produces: `actionToKind(action): ActivityEntry["kind"]`; `auditToActivity(rows): ActivityEntry[]`; `writeAudit(userId, action, siteId, jobId): Promise<void>`; `recentAudit(siteId, limit?): Promise<AuditRow[]>` where `AuditRow = { id; action; siteId: string | null; jobId: string | null; at: Date }`.

- [ ] **Step 1: Write the failing test** `audit.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { actionToKind, auditToActivity } from "./audit";

describe("actionToKind", () => {
	it("maps actions to ActivityEntry kinds", () => {
		expect(actionToKind("backup")).toBe("backup");
		expect(actionToKind("restore")).toBe("backup");
		expect(actionToKind("cacheFlush")).toBe("cache");
		expect(actionToKind("harden")).toBe("deploy");
		expect(actionToKind("wpUpdate")).toBe("update");
		expect(actionToKind("something-else")).toBe("deploy");
	});
});

describe("auditToActivity", () => {
	it("maps an audit row into an ActivityEntry", () => {
		const out = auditToActivity([
			{ id: "1", action: "backup", siteId: "acme", jobId: "j1", at: new Date("2026-06-22T10:00:00Z") },
		]);
		expect(out[0]).toMatchObject({ id: "1", kind: "backup", good: true });
		expect(out[0]?.text).toBe("Backed up");
	});
	it("preserves input order (sorting is the db's job, not this map)", () => {
		const out = auditToActivity([
			{ id: "a", action: "harden", siteId: "acme", jobId: null, at: new Date("2026-06-22T12:00:00Z") },
			{ id: "b", action: "restore", siteId: "acme", jobId: null, at: new Date("2026-06-22T09:00:00Z") },
		]);
		expect(out.map((e) => e.id)).toEqual(["a", "b"]);
	});
});
```

- [ ] **Step 2: Run it — FAIL.** **Step 3: Implement `audit.ts`:**

```ts
import type { ActivityEntry } from "../contract";

export interface AuditRow {
	id: string;
	action: string;
	siteId: string | null;
	jobId: string | null;
	at: Date;
}

const KIND: Record<string, ActivityEntry["kind"]> = {
	backup: "backup",
	restore: "backup",
	backupVerify: "backup",
	cacheFlush: "cache",
	wpUpdate: "update",
	smoke: "health",
	monitor: "health",
};

export function actionToKind(action: string): ActivityEntry["kind"] {
	return KIND[action] ?? "deploy";
}

const LABEL: Record<string, string> = {
	backup: "Backed up",
	restore: "Restored a backup",
	backupVerify: "Verified a backup",
	cacheFlush: "Cleared the cache",
	refresh: "Copied live to staging",
	promote: "Published staging to live",
	harden: "Secured the server",
	wpUpdate: "Ran updates",
	up: "Started the site",
	down: "Stopped the site",
	restart: "Restarted the site",
};

export function auditToActivity(rows: AuditRow[]): ActivityEntry[] {
	return rows.map((r) => ({
		id: r.id,
		kind: actionToKind(r.action),
		text: LABEL[r.action] ?? r.action,
		whenISO: r.at.toISOString(),
		good: r.action !== "down",
	}));
}
```

- [ ] **Step 4: Run it — PASS.**

- [ ] **Step 5: Add `writeAudit`/`recentAudit` to `jobs-db.ts`** (mirrors the existing `persistJobStart` db usage — import `db` + `auditLog` from `@control-panel/db`):

```ts
import { auditLog } from "@control-panel/db/schema/jobs";
import { desc, eq } from "drizzle-orm";

export async function writeAudit(
	userId: string,
	action: string,
	siteId: string | null,
	jobId: string | null
): Promise<void> {
	await db.insert(auditLog).values({ id: crypto.randomUUID(), userId, action, siteId, jobId });
}

export async function recentAudit(siteId: string, limit = 8) {
	return db
		.select()
		.from(auditLog)
		.where(eq(auditLog.siteId, siteId))
		.orderBy(desc(auditLog.at))
		.limit(limit);
}
```

- [ ] **Step 6: Verify + commit** (`check-types`/`check`/`test`):

```bash
git add control-panel/packages/api/src/core-bridge/audit.ts control-panel/packages/api/src/core-bridge/audit.test.ts control-panel/packages/api/src/core-bridge/jobs-db.ts
git commit -m "feat(panel): audit helpers + writeAudit/recentAudit"
```

---

### Task 3: Generalized `startJob` + `cancelJob`

**Files:**
- Modify: `control-panel/packages/api/src/core-bridge/jobs.ts`
- Modify: `control-panel/packages/api/src/routers/backups.ts` (point `backupsRun` at `startJob`)

**Interfaces:**
- Consumes: `streamVibe` (Task 1), `writeAudit` (Task 2).
- Produces: `startJob(input: StartJobInput): Promise<{ jobId: string }>` where `StartJobInput = { op: VibeOp; siteId: string; env: VibeEnv; kind: string; args?: string[]; userId: string; action: string }`; `cancelJob(jobId: string): void`.

- [ ] **Step 1: Rewrite `jobs.ts`** to generalize the runner, store `proc`, and write audit:

```ts
import type { Job, StreamEvent } from "../contract";

import { STREAM_TIMEOUT_MS, type VibeEnv, type VibeOp, streamVibe } from "./exec";
import { persistJobFinish, persistJobStart, writeAudit } from "./jobs-db";
import { LineStream } from "./line-stream";
import { findSite } from "./sites";

interface JobEntry {
	job: Job;
	stream: LineStream;
	proc: { kill: () => void };
}

const registry = new Map<string, JobEntry>();

export interface StartJobInput {
	op: VibeOp;
	siteId: string;
	env: VibeEnv;
	kind: string;
	args?: string[];
	userId: string;
	action: string;
}

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

export function cancelJob(jobId: string): void {
	const entry = registry.get(jobId);
	if (!entry) {
		throw new Error("Unknown job");
	}
	entry.job.status = "canceled";
	entry.proc.kill();
}

export async function startJob(input: StartJobInput): Promise<{ jobId: string }> {
	const site = await findSite(input.siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	const jobId = crypto.randomUUID();
	const stream = new LineStream();
	const job: Job = {
		id: jobId,
		kind: input.kind,
		siteId: input.siteId,
		status: "running",
		startedAt: new Date().toISOString(),
		finishedAt: null,
		exitCode: null,
	};
	const { proc, lines } = streamVibe(site.installDir, input.env, input.op, {
		timeoutMs: STREAM_TIMEOUT_MS,
		args: input.args,
	});
	registry.set(jobId, { job, stream, proc });
	await persistJobStart(jobId, input.kind, input.siteId);
	await writeAudit(input.userId, input.action, input.siteId, jobId);

	void (async () => {
		for await (const line of lines) {
			stream.push(line);
		}
		const code = await proc.exited;
		job.exitCode = code;
		if (job.status !== "canceled") {
			job.status = code === 0 ? "succeeded" : "failed";
		}
		job.finishedAt = new Date().toISOString();
		stream.end(job.status);
		await persistJobFinish(jobId, job.status, code);
	})().catch(async () => {
		// Preserve a cancel even if the drain throws (canceled must stay canceled).
		if (job.status !== "canceled") {
			job.status = "failed";
		}
		job.finishedAt = new Date().toISOString();
		stream.end(job.status);
		await persistJobFinish(jobId, job.status, null);
	});

	return { jobId };
}
```
(`streamVibe`'s `proc` is a `Bun.Subprocess` which has `.kill()` and `.exited` — the `JobEntry.proc` type narrows to `.kill`; keep the full `proc` from `streamVibe` in the closure for `.exited`.)

- [ ] **Step 2: Point `backupsRun` at `startJob`** in `backups.ts`:

```ts
backupsRun: operatorProcedure
	.input(z.object({ siteId: z.string() }))
	.handler(({ input, context }) =>
		startJob({
			op: "backup",
			siteId: input.siteId,
			env: "prod",
			kind: "backup",
			userId: context.session.user.id,
			action: "backup",
		})
	),
```
(Remove the now-unused `startBackupJob` import; `backups.ts` imports `startJob`.)

- [ ] **Step 3: Verify + commit** (`check-types`/`check`/`test`):

```bash
git add control-panel/packages/api/src/core-bridge/jobs.ts control-panel/packages/api/src/routers/backups.ts
git commit -m "feat(panel): generalized startJob + cancelJob + audit on start"
```

---

### Task 4: `operationsCancel`

**Files:**
- Modify: `control-panel/packages/api/src/routers/operations.ts`

**Interfaces:**
- Produces: `operationsCancel({ jobId }) → { canceled: true }` (admin).

- [ ] **Step 1: Add the procedure** to `operationsRouter`:

```ts
operationsCancel: adminProcedure
	.input(z.object({ jobId: z.string() }))
	.handler(({ input }): { canceled: true } => {
		cancelJob(input.jobId);
		return { canceled: true };
	}),
```
(Import `cancelJob` from `../core-bridge/jobs` and `adminProcedure` from `../procedures`.)

- [ ] **Step 2: Verify + commit:**

```bash
git add control-panel/packages/api/src/routers/operations.ts
git commit -m "feat(panel): operationsCancel"
```

---

# Phase 2 — Operation procedures

### Task 5: Lifecycle (up/down/restart/cacheFlush)

**Files:**
- Create: `control-panel/packages/api/src/routers/lifecycle.ts`
- Modify: `control-panel/packages/api/src/routers/index.ts`

**Interfaces:**
- Produces: `lifecycleUp`/`lifecycleRestart`/`lifecycleCacheFlush` (operator), `lifecycleDown` (admin) — each `({ siteId }) → { jobId }`.

- [ ] **Step 1: Create `lifecycle.ts`:**

```ts
import { z } from "zod";

import { startJob } from "../core-bridge/jobs";
import { adminProcedure, operatorProcedure } from "../procedures";

const siteInput = z.object({ siteId: z.string() });

function op(siteId: string, userId: string, vibeOp: "up" | "restart" | "cacheFlush" | "down", kind: string) {
	return startJob({ op: vibeOp, siteId, env: "prod", kind, userId, action: kind });
}

export const lifecycleRouter = {
	lifecycleUp: operatorProcedure
		.input(siteInput)
		.handler(({ input, context }) => op(input.siteId, context.session.user.id, "up", "up")),
	lifecycleRestart: operatorProcedure
		.input(siteInput)
		.handler(({ input, context }) => op(input.siteId, context.session.user.id, "restart", "restart")),
	lifecycleCacheFlush: operatorProcedure
		.input(siteInput)
		.handler(({ input, context }) => op(input.siteId, context.session.user.id, "cacheFlush", "cacheFlush")),
	lifecycleDown: adminProcedure
		.input(siteInput)
		.handler(({ input, context }) => op(input.siteId, context.session.user.id, "down", "down")),
};
```

- [ ] **Step 2: Spread into `index.ts`. Step 3: Verify + commit:**

```bash
git add control-panel/packages/api/src/routers/lifecycle.ts control-panel/packages/api/src/routers/index.ts
git commit -m "feat(panel): lifecycle ops (up/down/restart/cacheFlush)"
```

---

### Task 6: Backups verify/restore + Staging refresh/promote + Server harden

**Files:**
- Modify: `control-panel/packages/api/src/routers/backups.ts`, `staging.ts`, `server.ts`

**Interfaces:**
- Produces: `backupsVerify` (operator, arg=backupId), `backupsRestore` (admin, arg=backupId); `stagingRefresh` (operator), `stagingPromote` (admin); `serverHarden` (admin). All `→ { jobId }`.

- [ ] **Step 1: Add to `backups.ts`** (the backupId is the backup record `id` = its dir path, from `backupsList`):

```ts
backupsVerify: operatorProcedure
	.input(z.object({ siteId: z.string(), backupId: z.string() }))
	.handler(({ input, context }) =>
		startJob({
			op: "backupVerify",
			siteId: input.siteId,
			env: "prod",
			kind: "backupVerify",
			args: [input.backupId],
			userId: context.session.user.id,
			action: "backupVerify",
		})
	),
backupsRestore: adminProcedure
	.input(z.object({ siteId: z.string(), backupId: z.string() }))
	.handler(({ input, context }) =>
		startJob({
			op: "restore",
			siteId: input.siteId,
			env: "prod",
			kind: "restore",
			args: [input.backupId],
			userId: context.session.user.id,
			action: "restore",
		})
	),
```
(Import `adminProcedure`.)

- [ ] **Step 2: Add to `staging.ts`** (staging ops run with `env: "stage"`):

```ts
stagingRefresh: operatorProcedure
	.input(z.object({ siteId: z.string() }))
	.handler(({ input, context }) =>
		startJob({ op: "refresh", siteId: input.siteId, env: "stage", kind: "refresh", userId: context.session.user.id, action: "refresh" })
	),
stagingPromote: adminProcedure
	.input(z.object({ siteId: z.string() }))
	.handler(({ input, context }) =>
		startJob({ op: "promote", siteId: input.siteId, env: "stage", kind: "promote", userId: context.session.user.id, action: "promote" })
	),
```
(Import `startJob`, `operatorProcedure`, `adminProcedure`.)

- [ ] **Step 3: Add to `server.ts`:**

```ts
serverHarden: adminProcedure.handler(async ({ context }) => {
	const sites = await detectSites();
	const site = sites[0];
	if (!site) {
		throw new ORPCError("NOT_FOUND");
	}
	return startJob({ op: "harden", siteId: site.id, env: "prod", kind: "harden", userId: context.session.user.id, action: "harden" });
}),
```
(Import `startJob`, `adminProcedure`.)

- [ ] **Step 4: Verify + commit** (the routers are already spread into `index.ts`):

```bash
git add control-panel/packages/api/src/routers/backups.ts control-panel/packages/api/src/routers/staging.ts control-panel/packages/api/src/routers/server.ts
git commit -m "feat(panel): backup verify/restore, staging refresh/promote, harden ops"
```

---

### Task 7: WP updates (available + apply)

**Files:**
- Create: `control-panel/packages/api/src/routers/updates.ts`
- Modify: `control-panel/packages/api/src/core-bridge/parse.ts` (+ test), `routers/index.ts`

**Interfaces:**
- Produces: `updatesAvailable({ siteId }) → { plugins: number }` (via the scoped `wpPluginUpdates` op — wp-cli native `--format=json`); `updatesApply({ siteId, what })` (operator) `→ { jobId }`.

**Security:** This router uses the **scoped, no-arg** WP ops from Task 1 (`wpPluginUpdates`, `wpCoreUpdate`, `wpPluginUpdateAll`). The end user only chooses `what: "core" | "plugins"` (a `z.enum`), which selects between two fixed ops — the wp-cli verb is never caller-supplied.

- [ ] **Step 1: TDD `parseWpUpdateCount`** in `parse.ts` (wp-cli `plugin list --update=available --format=json` → array length). Test with a fixture JSON array, then implement:

```ts
export function parseWpUpdateCount(stdout: string): number {
	try {
		const arr = JSON.parse(stdout.trim());
		return Array.isArray(arr) ? arr.length : 0;
	} catch {
		return 0;
	}
}
```
(Test: a 2-element JSON array → 2; garbage → 0.)

- [ ] **Step 2: Create `updates.ts`:**

```ts
import { z } from "zod";

import { runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { parseWpUpdateCount } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { operatorProcedure, protectedProcedure } from "../procedures";

export const updatesRouter = {
	updatesAvailable: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<{ plugins: number }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { plugins: 0 };
			}
			const out = await runVibe(site.installDir, "prod", "wpPluginUpdates");
			return { plugins: parseWpUpdateCount(out.stdout) };
		}),

	updatesApply: operatorProcedure
		.input(z.object({ siteId: z.string(), what: z.enum(["core", "plugins"]) }))
		.handler(({ input, context }) =>
			startJob({
				op: input.what === "core" ? "wpCoreUpdate" : "wpPluginUpdateAll",
				siteId: input.siteId,
				env: "prod",
				kind: "wpUpdate",
				userId: context.session.user.id,
				action: "wpUpdate",
			})
		),
};
```

- [ ] **Step 3: Spread into `index.ts`. Step 4: Verify + commit:**

```bash
git add control-panel/packages/api/src/routers/updates.ts control-panel/packages/api/src/core-bridge/parse.ts control-panel/packages/api/src/core-bridge/parse.test.ts control-panel/packages/api/src/routers/index.ts
git commit -m "feat(panel): wp updates available + apply"
```

---

### Task 8: Real activity timeline (Overview)

**Files:**
- Modify: `control-panel/packages/api/src/routers/sites.ts`

**Interfaces:**
- Consumes: `recentAudit` (Task 2), `auditToActivity` (Task 2).

- [ ] **Step 1: Wire `siteOverview.activity`** in `sites.ts` — replace `activity: []` with real audit rows:

```ts
// at top: import { auditToActivity } from "../core-bridge/audit";
//         import { recentAudit } from "../core-bridge/jobs-db";
// in siteOverview handler, before return:
const activity = auditToActivity(
	(await recentAudit(site.id)).map((r) => ({
		id: r.id,
		action: r.action,
		siteId: r.siteId,
		jobId: r.jobId,
		at: r.at,
	}))
);
// return { …, activity }
```

- [ ] **Step 2: Verify + commit:**

```bash
git add control-panel/packages/api/src/routers/sites.ts
git commit -m "feat(panel): Overview activity timeline reads the real audit log"
```

---

# Phase 3 — Frontend wiring

### Task 9: Wire operations to the UI (SafetyConfirm + OperationRunner)

**Files:**
- Modify: `web/src/data/queries.ts`, `web/src/routes/_auth/sites/$siteId/backups.tsx`, `staging.tsx`, `web/src/routes/_auth/server.tsx`, `web/src/routes/_auth/sites/$siteId/overview.tsx`

**Interfaces:**
- Consumes: `orpc.backupsRestore`/`backupsVerify`/`stagingRefresh`/`stagingPromote`/`serverHarden`/`lifecycle*`/`updatesApply` mutations; the existing `OperationRunner` (jobId → SSE) + `SafetyConfirm`.

- [ ] **Step 1: Add mutation factories** in `queries.ts` (oRPC tanstack utils expose `.mutationOptions()`):

```ts
export const backupsRestoreMutation = () => orpc.backupsRestore.mutationOptions();
export const stagingRefreshMutation = () => orpc.stagingRefresh.mutationOptions();
export const stagingPromoteMutation = () => orpc.stagingPromote.mutationOptions();
export const serverHardenMutation = () => orpc.serverHarden.mutationOptions();
export const updatesApplyMutation = () => orpc.updatesApply.mutationOptions();
export const updatesAvailableQuery = (siteId: string) =>
	orpc.updatesAvailable.queryOptions({ input: { siteId } });
```

- [ ] **Step 2: Backups Restore** — in `backups.tsx`, the existing "Restore…" row button opens `SafetyConfirm` (reversible badge, consequence text); on confirm call `backupsRestoreMutation` with `{ siteId, backupId: backup.id }`, then open `OperationRunner` with the returned `jobId`:

```tsx
const restore = useMutation(backupsRestoreMutation());
// onConfirm:
const { jobId } = await restore.mutateAsync({ siteId, backupId: selected.id });
setJobId(jobId); setRunnerOpen(true);
// <OperationRunner jobId={jobId} open={runnerOpen} onOpenChange={setRunnerOpen} title="Restoring…" />
```

- [ ] **Step 3: Staging Refresh/Promote** — in `staging.tsx`, "Copy live to staging" → `stagingRefreshMutation` → Runner; "Publish staging to live" → `SafetyConfirm` (irreversible-ish) → `stagingPromoteMutation` → Runner.

- [ ] **Step 4: Server Harden + Stop** — in `server.tsx`, "Secure the server" → `serverHardenMutation` → Runner; "Stop a site…" → `SafetyConfirm` → `lifecycleDownMutation` → Runner.

- [ ] **Step 5: Overview Update-now** — the "Needs you" Update action calls `updatesApplyMutation({ siteId, what: "core" })` → Runner; the lane count uses `updatesAvailableQuery`.

- [ ] **Step 6: Verify** `bun run check-types`/`check`/`test`. Keep each route ≤220 lines (extract an `<OperationButton>` helper if needed). **Step 7: Commit:**

```bash
git add control-panel/web/src/data/queries.ts control-panel/web/src/routes
git commit -m "feat(panel): wire restore/refresh/promote/harden/stop/update to SafetyConfirm + OperationRunner"
```

---

# Phase 4 — VPS validation

### Task 10: Real-VPS validation (acceptance gate) — ✅ PASSED 2026-06-22

**Files:** none (validation only). Validated live on `panel.vcode.sh`.

The gate caught two real Important bugs no unit test or code review had: (a) the `OperationRunner` rendered a green "✓ Done" for failed/canceled jobs (it ignored the terminal `ev.status`); and (b) **cancel orphaned the real work** — `proc.kill()` killed only the `sh bin/vibe` wrapper while `bin/backup`/`rclone` reparented to init and kept running, and all op procs shared the **panel server's own PGID** (so a naive killpg would kill the panel). Both fixed: status rendered from `ev.status` + a Cancel button wired to `operationsCancel`; and each streamed op now spawns under `setsid` (its own process group) so killing the group reaps the whole tree without ever touching the server's group (VPS-confirmed: `setsid` gives pid==pgid, exec-in-place).

- [x] **Step 1: Redeploy** — rsync + `./bin/panel install --domain panel.vcode.sh` (idempotent; ran cleanly several times).
- [x] **Step 2: Streamed op** — a real **backup** streamed end-to-end (MariaDB dump → wp-content → write → R2 upload → Done); a destructive **restore** behind the SafetyConfirm ("Reversible" badge) streamed `bin/vibe restore` (reset DB → restore → wp-content → perms → flush) to a green "Done" and **brought test2 from failing back to ● live / healthy**.
- [~] **Step 3: Staging + harden** — staging-refresh + harden **wiring/role-gating confirmed by review**; **not executed live**: harden's `bin/harden` touches SSH config (lockout risk on the shared validation VPS), and staging refresh shares the identical `startJob`/SSE path proven by backup/restore.
- [x] **Step 4: Audit + activity** — `audit_log` has a row per op **with the acting user** (incl. a `cancel` row); the Overview **activity timeline** shows "Restored a backup" / "Backed up" / "Canceled an operation" via `auditToActivity`.
- [x] **Step 5: Cancel** — Cancel button → `operationsCancel` → `cancelJob` → **the whole op process tree was killed** (`rclone` gone, verified via `ps`) **while the panel server stayed `active`/HTTP 200**; job recorded `canceled` (exit 143 = SIGTERM); runner showed muted "Canceled".
- [x] **Step 6: Roles** — procedure tiers confirmed (down/restore/promote/harden/operationsCancel = admin; up/restart/cacheFlush/backup/verify/refresh/updatesApply = operator); a second-user end-to-end RBAC test is Plan C.
- [x] **Step 7: Recorded** here + in `docs/product-roadmap.md`.

**Follow-ups:** site lifecycle (stop/start/restart) ops have no UI surface yet (need a site-scoped control — the server page was the wrong home); harden not executed on the shared VPS; optional `backupId` shape regex; the in-memory `registry`/`finalized` maps grow unbounded (add a job reaper); `bin/panel` regenerates `BETTER_AUTH_SECRET` per install (invalidates sessions).

---

## Self-Review (completed during planning)

**Spec coverage (Plan B):** §4 lifecycle/backups/staging/updates/harden as role-gated streamed jobs → Tasks 5–7; §2a `--yes` mandatory + staging `env` + restore/verify arg → Task 1; jobs generalized `(op, env, kind)` + `operationsCancel` → Tasks 3–4; SafetyConfirm on destructive → Task 9; audit writes + activity timeline → Tasks 2, 8; VPS gate → Task 10. **Deferred (Plan C):** team admin, the RBAC `ac`/hook fixes, and the service hardening; `staging.attach` (folded into Plan C's staging-only flow); the perf/`--json` Plan A follow-ups.

**Placeholders:** none — each step has complete code or an exact command. The `<OperationButton>` extraction in Task 9 Step 6 is conditional on the 220-line limit, with the trigger stated.

**Type consistency:** `StartJobInput`/`startJob`/`cancelJob`, `VIBE_OPS` op keys (`up`/`down`/`restart`/`cacheFlush`/`restore`/`backupVerify`/`refresh`/`promote`/`harden`/`wpCoreUpdate`/`wpPluginUpdateAll`/`wpPluginUpdates`), `buildVibeArgv(…, extraArgs)`, `writeAudit`/`recentAudit`/`auditToActivity`/`actionToKind`, and the procedure names (`backupsRestore`/`stagingRefresh`/`serverHarden`/`lifecycleDown`/`updatesApply`/`operationsCancel`) are used identically across defining and consuming tasks.
