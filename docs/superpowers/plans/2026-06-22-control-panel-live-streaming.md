# Control Panel Live Streaming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable live-streaming experience for the panel — operations show a friendly step checklist with real progress and never-silent liveness; Logs gets a live tail — built on one client primitive fed by a thin, heartbeating server stream.

**Architecture:** The server stream never goes silent (`LineStream` heartbeat) and now carries everything the op emits (`streamVibe` merges stdout+stderr, so `rclone --stats` progress on stderr reaches the client). The client derives friendly steps + progress from raw lines via pure utils, consumed by a source-agnostic `useLiveStream` hook and two UI surfaces (`<LiveOperation>`, `<LiveLogTail>`).

**Tech Stack:** Bun · Hono · oRPC `@orpc/server@1.14.6` (event iterators) · React 19 · TanStack Router/Query · zod 4 · shadcn/ui · vitest.

Spec: `docs/superpowers/specs/2026-06-22-control-panel-live-streaming-design.md`.

## Global Constraints

- **TABS** in `control-panel` TS/TSX (ultracite); TS/TSX **≤220 lines** (split into focused modules under `web/src/lib/live/`).
- **Exec layer is the only host-spawn site** — `logsFollow` spawns through `streamVibe` (allowlisted op, argv array, redacted, timeout, `killTree` cleanup on disconnect).
- **Never print secrets** — redaction applies to every streamed line, stdout AND stderr, including `logsFollow`.
- **shadcn/ui primitives + semantic tokens only** — no hardcoded colors; reuse `Progress`, `Dialog`, `ScrollArea`, `Collapsible`, `Spinner`, and `text-success`/`text-destructive`/`text-muted-foreground`.
- **No `any`** (isolate unavoidable boundary casts). Friendly, consistent English copy.
- **Gate per task** from `control-panel/`: `bun run check-types` && `bun run check` && `bun run test` (and `bun run build` for any task touching `web/`).
- The streaming round-trip + real rclone progress + the logs tail are proven at the **VPS gate (Task 11)**; unit-test the pure logic (merge, heartbeat state machine, parsers, derivers, reducer).

## File Structure

**Server (api):**
- `packages/api/src/core-bridge/stream-merge.ts` *(new)* — `mergeLineStreams` (pure-ish, testable).
- `packages/api/src/core-bridge/stream-merge.test.ts` *(new)*.
- `packages/api/src/core-bridge/exec.ts` *(modify)* — `streamVibe` uses `mergeLineStreams`; add `logsFollow` op.
- `packages/api/src/core-bridge/exec.test.ts` *(modify)* — allowlist assertion.
- `packages/api/src/core-bridge/line-stream.ts` *(modify)* — heartbeat.
- `packages/api/src/core-bridge/line-stream.test.ts` *(new)*.
- `packages/api/src/routers/logs.ts` *(modify)* — add `logsFollow`.

**Shell (root stack):**
- `bin/backup` *(modify)* — rclone `--stats`.
- `bin/restore` *(modify, conditional)* — rclone `--stats` if it pulls from off-site.

**Web client:**
- `web/src/lib/live/progress.ts` + `progress.test.ts` *(new)* — `parseRcloneProgress`.
- `web/src/lib/live/steps.ts` + `steps.test.ts` *(new)* — `deriveSteps`.
- `web/src/lib/live/op-steps.ts` *(new)* — per-kind step defs.
- `web/src/lib/live/use-live-stream.ts` + `live-reducer.ts` + `live-reducer.test.ts` *(new)* — hook + pure reducer.
- `web/src/components/patterns/live-operation.tsx` *(new)* — operations UI.
- `web/src/components/patterns/operation-runner.tsx` *(modify)* — thin wrapper over `<LiveOperation>`, adds optional `kind`.
- `web/src/components/patterns/live-log-tail.tsx` *(new)* — logs tail UI.
- `web/src/routes/_auth/sites/$siteId/logs.tsx` *(modify)* — live tail.
- `web/src/routes/_auth/sites/$siteId/{backups,staging,overview}.tsx` + `web/src/routes/_auth/server.tsx` *(modify)* — pass `kind`.
- `web/src/routes/_auth/sites/$siteId/index.tsx` *(new)* — redirect to overview.
- `web/src/data/queries.ts` *(modify)* — `logsFollow` source factory.

---

# Phase 1 — Never-silent server stream

### Task 1: Merge stdout+stderr in streamVibe + add `logsFollow` op

**Files:**
- Create: `control-panel/packages/api/src/core-bridge/stream-merge.ts`, `…/stream-merge.test.ts`
- Modify: `control-panel/packages/api/src/core-bridge/exec.ts`, `…/exec.test.ts`

**Interfaces:**
- Produces: `mergeLineStreams(streams: ReadableStream<Uint8Array>[], transform: (line: string) => string): AsyncIterable<string>`; `VIBE_OPS.logsFollow = { argv: ["logs"], stream: true }`; `streamVibe` now yields lines from both stdout and stderr.

- [ ] **Step 1: Write the failing test** `stream-merge.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { mergeLineStreams } from "./stream-merge";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const c of chunks) {
				controller.enqueue(enc.encode(c));
			}
			controller.close();
		},
	});
}

describe("mergeLineStreams", () => {
	it("yields newline-split lines from both streams, transformed", async () => {
		const out = streamOf("a\nb\n");
		const err = streamOf("e1\ne2\n");
		const got: string[] = [];
		for await (const line of mergeLineStreams([out, err], (l) => l.toUpperCase())) {
			got.push(line);
		}
		expect(got.sort()).toEqual(["A", "B", "E1", "E2"]);
	});

	it("flushes a trailing unterminated line", async () => {
		const got: string[] = [];
		for await (const line of mergeLineStreams([streamOf("tail")], (l) => l)) {
			got.push(line);
		}
		expect(got).toEqual(["tail"]);
	});
});
```

- [ ] **Step 2: Run it — FAIL.** `cd control-panel && bunx vitest run packages/api/src/core-bridge/stream-merge.test.ts`.

- [ ] **Step 3: Implement `stream-merge.ts`:**

```ts
export function mergeLineStreams(
	streams: ReadableStream<Uint8Array>[],
	transform: (line: string) => string
): AsyncIterable<string> {
	const queue: string[] = [];
	let active = streams.length;
	let wake: (() => void) | null = null;
	const signal = () => {
		if (wake) {
			const w = wake;
			wake = null;
			w();
		}
	};

	async function pump(stream: ReadableStream<Uint8Array>): Promise<void> {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let buf = "";
		try {
			for (;;) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				buf += decoder.decode(value, { stream: true });
				let nl = buf.indexOf("\n");
				while (nl !== -1) {
					queue.push(transform(buf.slice(0, nl)));
					buf = buf.slice(nl + 1);
					nl = buf.indexOf("\n");
				}
				signal();
			}
			if (buf.length > 0) {
				queue.push(transform(buf));
			}
		} finally {
			active -= 1;
			signal();
		}
	}

	const pumps = streams.map((s) => pump(s));

	return (async function* generate(): AsyncIterable<string> {
		try {
			for (;;) {
				while (queue.length > 0) {
					yield queue.shift() as string;
				}
				if (active === 0) {
					return;
				}
				await new Promise<void>((resolve) => {
					wake = resolve;
				});
			}
		} finally {
			await Promise.allSettled(pumps);
		}
	})();
}
```

- [ ] **Step 4: Run it — PASS.**

- [ ] **Step 5: Wire `streamVibe` to use it + add the op.** In `exec.ts`, add to `VIBE_OPS` (after `logsRecent`): `logsFollow: { argv: ["logs"], stream: true },`. Replace `streamVibe`'s inner `lines()` generator so it returns `mergeLineStreams([child.stdout, child.stderr], redact)` and clears the timeout when the merged iterator finishes. Concretely, `streamVibe` becomes:

```ts
export function streamVibe(
	siteDir: string,
	env: VibeEnv,
	op: VibeOp,
	opts: { timeoutMs?: number; args?: string[] } = {}
) {
	const argv = buildVibeArgv(siteDir, env, op, opts.args ?? []);
	const onLinux = process.platform === "linux";
	const child = Bun.spawn(onLinux ? ["setsid", ...argv] : argv, {
		cwd: siteDir,
		stdout: "pipe",
		stderr: "pipe",
	});
	const killTree = () => {
		if (onLinux && child.pid && child.pid > 1) {
			try {
				process.kill(-child.pid, "SIGTERM");
				return;
			} catch {
				// group already gone
			}
		}
		child.kill();
	};
	const timer = setTimeout(killTree, opts.timeoutMs ?? STREAM_TIMEOUT_MS);
	async function* lines(): AsyncIterable<string> {
		try {
			for await (const line of mergeLineStreams(
				[child.stdout as ReadableStream<Uint8Array>, child.stderr as ReadableStream<Uint8Array>],
				redact
			)) {
				yield line;
			}
		} finally {
			clearTimeout(timer);
		}
	}
	const proc = { pid: child.pid, exited: child.exited, kill: killTree };
	return { proc, lines: lines() };
}
```
(Import `mergeLineStreams` from `./stream-merge`. Keep `runVibe`, `hostExec`, `buildVibeArgv` unchanged. This preserves the Plan-B setsid/killpg facade.)

- [ ] **Step 6: Update the allowlist assertion** in `exec.test.ts` — add `"logsFollow"` to the sorted op list (it sits between `logsRecent` and `promote` alphabetically: `… "harden", "logsFollow", "logsRecent", "promote", …`).

- [ ] **Step 7: Run gate — PASS.** **Step 8: Commit:**

```bash
git add control-panel/packages/api/src/core-bridge/stream-merge.ts control-panel/packages/api/src/core-bridge/stream-merge.test.ts control-panel/packages/api/src/core-bridge/exec.ts control-panel/packages/api/src/core-bridge/exec.test.ts
git commit -m "feat(panel): merge stdout+stderr in streamVibe + add logsFollow op"
```

---

### Task 2: `LineStream` heartbeat

**Files:**
- Modify: `control-panel/packages/api/src/core-bridge/line-stream.ts`
- Create: `control-panel/packages/api/src/core-bridge/line-stream.test.ts`

**Interfaces:**
- Produces: `new LineStream(heartbeatMs?: number)`; `subscribe()` yields a heartbeat tick `{ line: "", status, done: false }` when it wakes with no new buffered lines and the job isn't done; the heartbeat interval is cleared in `end()`.

- [ ] **Step 1: Write the failing test** `line-stream.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { LineStream } from "./line-stream";

describe("LineStream heartbeat", () => {
	it("emits a tick (empty line, not done) while idle, then the real lines and terminal event", async () => {
		const s = new LineStream(15);
		const it = s.subscribe()[Symbol.asyncIterator]();
		s.push("hello");
		expect(await it.next()).toMatchObject({ value: { line: "hello", done: false } });
		// next event with no push should be an idle heartbeat within ~15ms
		const tick = await it.next();
		expect(tick.value).toMatchObject({ line: "", done: false });
		s.end("succeeded");
		// drain to the terminal event
		let last = await it.next();
		while (!last.done && last.value.done === false) {
			last = await it.next();
		}
		expect(last.value).toMatchObject({ status: "succeeded", done: true });
	});
});
```

- [ ] **Step 2: Run it — FAIL.**

- [ ] **Step 3: Implement.** Add a heartbeat timer + restructure `subscribe()`:

```ts
export class LineStream {
	private readonly buffer: string[] = [];
	private status: JobStatus = "running";
	private done = false;
	private readonly wakers: (() => void)[] = [];
	private readonly heartbeat: ReturnType<typeof setInterval>;

	constructor(heartbeatMs = 4000) {
		this.heartbeat = setInterval(() => this.wake(), heartbeatMs);
	}

	push(line: string): void {
		this.buffer.push(line);
		this.wake();
	}

	end(status: JobStatus): void {
		this.status = status;
		this.done = true;
		clearInterval(this.heartbeat);
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
			const hadNew = cursor < this.buffer.length;
			while (cursor < this.buffer.length) {
				yield { line: this.buffer[cursor] ?? "", status: this.status, done: false };
				cursor++;
			}
			if (this.done) {
				yield { line: "", status: this.status, done: true };
				return;
			}
			if (!hadNew) {
				yield { line: "", status: this.status, done: false };
			}
			await this.wait();
		}
	}
}
```
(The first iteration emits one immediate idle tick before the first wait — harmless; the client treats empty-line non-done events as liveness only.)

- [ ] **Step 4: Run it — PASS.** **Step 5: Gate + commit:**

```bash
git add control-panel/packages/api/src/core-bridge/line-stream.ts control-panel/packages/api/src/core-bridge/line-stream.test.ts
git commit -m "feat(panel): LineStream heartbeat so the live stream never goes silent"
```

---

# Phase 2 — Real backend progress + logs follow

### Task 3: rclone `--stats` progress in backup/restore

**Files:**
- Modify: `bin/backup` (and `bin/restore` only if it runs an `rclone` pull)

**Interfaces:**
- Produces: the off-site `rclone copy` emits a newline progress line every 2s (parsed client-side by `parseRcloneProgress`).

- [ ] **Step 1: Find the rclone invocation** in `bin/backup` (the `rclone copy … R2:…` line, near "Uploading"). Add the stats flags so it emits one-line progress to stderr:

Change the rclone copy invocation to include:
```sh
--stats 2s --stats-one-line --stats-log-level NOTICE
```
e.g. `rclone copy --transfers 4 --checkers 8 --s3-no-check-bucket --s3-chunk-size 32M --stats 2s --stats-one-line --stats-log-level NOTICE "$src" "$dst"`. Do not change any other behavior or flags.

- [ ] **Step 2: Restore.** Inspect `bin/restore`. If it runs an `rclone` step to pull a backup from off-site, add the same flags to that invocation. If restore is local-only (no rclone), leave it unchanged and note so in the commit body.

- [ ] **Step 3: Lint shell** (if the repo has a shell linter, run it; otherwise `sh -n bin/backup` to syntax-check). Expected: no syntax errors.

- [ ] **Step 4: Commit:**

```bash
git add bin/backup bin/restore
git commit -m "feat: rclone emits one-line --stats progress for live backup/restore UI"
```
(Real progress output is validated on the VPS in Task 11.)

---

### Task 4: `logsFollow` SSE procedure

**Files:**
- Modify: `control-panel/packages/api/src/routers/logs.ts`

**Interfaces:**
- Consumes: `streamVibe` + the `logsFollow` op (Task 1).
- Produces: `logsFollow({ siteId }) → eventIterator(streamEventSchema)` (protected) — a live tail that kills its child on disconnect.

- [ ] **Step 1: Add the procedure** to `logsRouter`:

```ts
import { eventIterator } from "@orpc/server";
// add to existing imports:
import type { StreamEvent } from "../contract";
import { streamVibe, STREAM_TIMEOUT_MS } from "../core-bridge/exec";

const logStreamSchema = z.object({
	line: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
	done: z.boolean(),
});

// inside logsRouter, alongside logsRecent:
logsFollow: protectedProcedure
	.input(z.object({ siteId: z.string() }))
	.output(eventIterator(logStreamSchema))
	.handler(async function* ({ input }): AsyncGenerator<StreamEvent> {
		const site = await findSite(input.siteId);
		if (!site) {
			return;
		}
		const { proc, lines } = streamVibe(site.installDir, "prod", "logsFollow", {
			timeoutMs: STREAM_TIMEOUT_MS,
		});
		try {
			for await (const line of lines) {
				if (line.length > 0) {
					yield { line, status: "running", done: false };
				}
			}
			yield { line: "", status: "succeeded", done: true };
		} finally {
			proc.kill();
		}
	}),
```
(`proc.kill()` is the Plan-B `killTree` facade — it reaps the `logs -f` process group when the client disconnects and the generator's `finally` runs. If `StreamEvent`/`streamEventSchema` already live in a shared module, import rather than redefine — match `operations.ts`'s schema.)

- [ ] **Step 2: Gate + commit:**

```bash
git add control-panel/packages/api/src/routers/logs.ts
git commit -m "feat(panel): logsFollow live-tail SSE procedure (redacted, killed on disconnect)"
```

---

# Phase 3 — Client core (pure, TDD)

### Task 5: `parseRcloneProgress`

**Files:**
- Create: `control-panel/web/src/lib/live/progress.ts`, `…/progress.test.ts`

**Interfaces:**
- Produces: `parseRcloneProgress(line: string): { percent: number; transferred: string; total: string; eta: string } | null`.

- [ ] **Step 1: Write the failing test** `progress.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { parseRcloneProgress } from "./progress";

describe("parseRcloneProgress", () => {
	it("parses an rclone --stats-one-line transfer line", () => {
		const r = parseRcloneProgress(
			"Transferred:   	 5.400 MiB / 9.300 MiB, 58%, 1.234 MiB/s, ETA 40s"
		);
		expect(r).toEqual({
			percent: 58,
			transferred: "5.400 MiB",
			total: "9.300 MiB",
			eta: "40s",
		});
	});
	it("returns null for a non-progress line", () => {
		expect(parseRcloneProgress("Dumping MariaDB...")).toBeNull();
		expect(parseRcloneProgress("")).toBeNull();
	});
});
```

- [ ] **Step 2: Run it — FAIL.** **Step 3: Implement `progress.ts`:**

```ts
export interface RcloneProgress {
	percent: number;
	transferred: string;
	total: string;
	eta: string;
}

const LINE =
	/Transferred:\s*([\d.]+\s*\w+)\s*\/\s*([\d.]+\s*\w+),\s*(\d+)%(?:.*?ETA\s*(\S+))?/;

export function parseRcloneProgress(line: string): RcloneProgress | null {
	const m = LINE.exec(line);
	if (!m) {
		return null;
	}
	return {
		transferred: (m[1] ?? "").replace(/\s+/g, " ").trim(),
		total: (m[2] ?? "").replace(/\s+/g, " ").trim(),
		percent: Number.parseInt(m[3] ?? "0", 10),
		eta: (m[4] ?? "").trim(),
	};
}
```

- [ ] **Step 4: Run it — PASS.** **Step 5: Commit:**

```bash
git add control-panel/web/src/lib/live/progress.ts control-panel/web/src/lib/live/progress.test.ts
git commit -m "feat(panel): parseRcloneProgress util"
```

---

### Task 6: `deriveSteps` + per-op step defs

**Files:**
- Create: `control-panel/web/src/lib/live/steps.ts`, `…/steps.test.ts`, `…/op-steps.ts`

**Interfaces:**
- Produces: `type Step = { label: string; state: "done" | "active" | "pending" }`; `type StepDef = { match: RegExp; label: string }`; `deriveSteps(lines: string[], defs: StepDef[]): Step[]`; `OP_STEPS: Record<string, StepDef[]>` keyed by op kind (`backup`, `restore`), with a `GENERIC_STEPS` fallback.

- [ ] **Step 1: Write the failing test** `steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deriveSteps, type StepDef } from "./steps";

const DEFS: StepDef[] = [
	{ match: /Dumping/, label: "Database" },
	{ match: /Archiving/, label: "Files" },
	{ match: /Uploading/, label: "Upload" },
];

describe("deriveSteps", () => {
	it("marks matched-then-passed steps done, the latest match active, the rest pending", () => {
		const steps = deriveSteps(["Dumping x", "Archiving y"], DEFS);
		expect(steps).toEqual([
			{ label: "Database", state: "done" },
			{ label: "Files", state: "active" },
			{ label: "Upload", state: "pending" },
		]);
	});
	it("all pending before any match", () => {
		expect(deriveSteps([], DEFS).every((s) => s.state === "pending")).toBe(true);
	});
});
```

- [ ] **Step 2: Run it — FAIL.** **Step 3: Implement `steps.ts`:**

```ts
export interface StepDef {
	match: RegExp;
	label: string;
}

export interface Step {
	label: string;
	state: "done" | "active" | "pending";
}

export function deriveSteps(lines: string[], defs: StepDef[]): Step[] {
	let activeIdx = -1;
	for (let i = 0; i < defs.length; i++) {
		const def = defs[i];
		if (def && lines.some((l) => def.match.test(l))) {
			activeIdx = i;
		}
	}
	return defs.map((def, i) => ({
		label: def.label,
		state: i < activeIdx ? "done" : i === activeIdx ? "active" : "pending",
	}));
}
```

- [ ] **Step 4: Run it — PASS.** **Step 5: Create `op-steps.ts`** (matchers from the real `bin/backup`/`bin/restore` output):

```ts
import type { StepDef } from "./steps";

const BACKUP: StepDef[] = [
	{ match: /Dumping MariaDB/i, label: "Dumping database" },
	{ match: /Archiving wp-content/i, label: "Archiving files" },
	{ match: /Backup written/i, label: "Writing backup" },
	{ match: /Uploading|Transferred:/i, label: "Uploading off-site" },
	{ match: /uploaded to off-server/i, label: "Verifying upload" },
];

const RESTORE: StepDef[] = [
	{ match: /Starting required services/i, label: "Starting services" },
	{ match: /Resetting WordPress database/i, label: "Resetting database" },
	{ match: /Restoring database/i, label: "Restoring database" },
	{ match: /Restoring wp-content/i, label: "Restoring files" },
	{ match: /Normalizing/i, label: "Fixing permissions" },
	{ match: /Flushing caches/i, label: "Flushing caches" },
	{ match: /Restore complete/i, label: "Done" },
];

export const GENERIC_STEPS: StepDef[] = [{ match: /./, label: "Working" }];

export const OP_STEPS: Record<string, StepDef[]> = {
	backup: BACKUP,
	restore: RESTORE,
};
```

- [ ] **Step 6: Commit:**

```bash
git add control-panel/web/src/lib/live/steps.ts control-panel/web/src/lib/live/steps.test.ts control-panel/web/src/lib/live/op-steps.ts
git commit -m "feat(panel): deriveSteps + per-op step definitions"
```

---

### Task 7: `useLiveStream` (pure reducer + hook)

**Files:**
- Create: `control-panel/web/src/lib/live/live-reducer.ts`, `…/live-reducer.test.ts`, `…/use-live-stream.ts`

**Interfaces:**
- Consumes: `StreamEvent` (`{ line, status, done }`) from `@/data/types` (or the contract).
- Produces: pure `liveReducer(state, event)` + `initialLiveState(nowMs)`; `useLiveStream(sourceFactory: () => Promise<AsyncIterable<StreamEvent>> | AsyncIterable<StreamEvent>, active: boolean): LiveState` where `LiveState = { lines: string[]; status: JobStatus; done: boolean; lastLine: string; lastEventAt: number; startedAt: number }`.

- [ ] **Step 1: Write the failing test** `live-reducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { initialLiveState, liveReducer } from "./live-reducer";

describe("liveReducer", () => {
	it("appends non-empty lines and tracks lastEventAt; ignores heartbeat lines", () => {
		let s = initialLiveState(1000);
		s = liveReducer(s, { event: { line: "a", status: "running", done: false }, at: 1100 });
		s = liveReducer(s, { event: { line: "", status: "running", done: false }, at: 1200 });
		expect(s.lines).toEqual(["a"]);
		expect(s.lastLine).toBe("a");
		expect(s.lastEventAt).toBe(1200); // heartbeat still refreshes liveness
	});
	it("captures terminal status on done", () => {
		let s = initialLiveState(0);
		s = liveReducer(s, { event: { line: "", status: "failed", done: true }, at: 5 });
		expect(s.done).toBe(true);
		expect(s.status).toBe("failed");
	});
});
```

- [ ] **Step 2: Run it — FAIL.** **Step 3: Implement `live-reducer.ts`:**

```ts
import type { JobStatus, StreamEvent } from "@/data/types";

export interface LiveState {
	lines: string[];
	status: JobStatus;
	done: boolean;
	lastLine: string;
	lastEventAt: number;
	startedAt: number;
}

export function initialLiveState(nowMs: number): LiveState {
	return {
		lines: [],
		status: "running",
		done: false,
		lastLine: "",
		lastEventAt: nowMs,
		startedAt: nowMs,
	};
}

export function liveReducer(
	state: LiveState,
	action: { event: StreamEvent; at: number }
): LiveState {
	const { event, at } = action;
	const next: LiveState = { ...state, lastEventAt: at, status: event.status };
	if (event.done) {
		next.done = true;
		return next;
	}
	if (event.line.length > 0) {
		next.lines = [...state.lines, event.line];
		next.lastLine = event.line;
	}
	return next;
}
```

- [ ] **Step 4: Run it — PASS.** **Step 5: Implement `use-live-stream.ts`** (thin React wrapper; consumes the iterator, dispatches into the reducer, exposes derived liveness):

```ts
import { useEffect, useReducer } from "react";

import type { StreamEvent } from "@/data/types";
import { initialLiveState, type LiveState, liveReducer } from "./live-reducer";

type Source = () => AsyncIterable<StreamEvent> | Promise<AsyncIterable<StreamEvent>>;

export function useLiveStream(source: Source, active: boolean): LiveState {
	const [state, dispatch] = useReducer(liveReducer, Date.now(), initialLiveState);
	useEffect(() => {
		if (!active) {
			return;
		}
		let on = true;
		(async () => {
			const iter = await source();
			for await (const event of iter) {
				if (!on) {
					break;
				}
				dispatch({ event, at: Date.now() });
			}
		})().catch(() => undefined);
		return () => {
			on = false;
		};
		// source identity is owned by the caller (stable per open)
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active]);
	return state;
}
```
(If `useReducer`'s lazy init with `Date.now()` trips a lint rule, pass `() => initialLiveState(Date.now())` form the linter accepts; keep `Date.now()` out of render-pure paths — it's an initializer, which is fine.)

- [ ] **Step 6: Gate + commit:**

```bash
git add control-panel/web/src/lib/live/live-reducer.ts control-panel/web/src/lib/live/live-reducer.test.ts control-panel/web/src/lib/live/use-live-stream.ts
git commit -m "feat(panel): useLiveStream hook + pure live reducer"
```

---

# Phase 4 — UI surfaces

### Task 8: `<LiveOperation>` + rewire `OperationRunner`

**Files:**
- Create: `control-panel/web/src/components/patterns/live-operation.tsx`
- Modify: `control-panel/web/src/components/patterns/operation-runner.tsx`, and the 4 call sites (`backups.tsx`, `staging.tsx`, `overview.tsx`, `server.tsx`)

**Interfaces:**
- Consumes: `useLiveStream`, `deriveSteps`/`OP_STEPS`/`GENERIC_STEPS`, `parseRcloneProgress`, `client.operationsStream`/`operationsCancel`.
- Produces: `<LiveOperation open onOpenChange title kind jobId />`; `OperationRunner` keeps its current props and adds optional `kind?: string`.

- [ ] **Step 1: Create `live-operation.tsx`.** Render the wider dialog with the friendly checklist, active-step progress, elapsed/liveness, terminal status, raw-log disclosure, and Cancel:

```tsx
import { Progress } from "@control-panel/ui/components/progress";
import { Ban, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GENERIC_STEPS, OP_STEPS } from "@/lib/live/op-steps";
import { parseRcloneProgress } from "@/lib/live/progress";
import { deriveSteps } from "@/lib/live/steps";
import { useLiveStream } from "@/lib/live/use-live-stream";
import { client } from "@/lib/orpc/client";
import { Button } from "@/components/ui/button";

function elapsed(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function LiveOperation({
	open,
	onOpenChange,
	title,
	kind,
	jobId,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	kind: string;
	jobId: string | null;
}) {
	const [now, setNow] = useState(() => Date.now());
	const [canceling, setCanceling] = useState(false);
	const live = useLiveStream(
		() => client.operationsStream({ jobId: jobId as string }),
		Boolean(open && jobId)
	);
	// tick the clock once a second while running
	useState(() => {
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	});

	const steps = deriveSteps(live.lines, OP_STEPS[kind] ?? GENERIC_STEPS);
	const progress = parseRcloneProgress(live.lastLine);
	const idle = !live.done && now - live.lastEventAt > 6000;

	async function cancel() {
		if (!jobId) {
			return;
		}
		setCanceling(true);
		try {
			await client.operationsCancel({ jobId });
		} catch {
			toast.error("Couldn't cancel the operation.");
			setCanceling(false);
		}
	}

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center justify-between gap-3">
						<span>{title}</span>
						<span className="font-mono text-muted-foreground text-xs">
							{elapsed(now - live.startedAt)}
						</span>
					</DialogTitle>
					<DialogDescription>
						{live.done ? "Operation finished." : "Running…"}
					</DialogDescription>
				</DialogHeader>

				<ol className="grid gap-1.5">
					{steps.map((step) => (
						<li className="flex items-center gap-2 text-sm" key={step.label}>
							{step.state === "done" ? (
								<CheckCircle2 aria-hidden className="size-4 text-success" />
							) : null}
							{step.state === "active" ? (
								<Loader2 aria-hidden className="size-4 animate-spin text-primary" />
							) : null}
							{step.state === "pending" ? (
								<span aria-hidden className="size-4 text-muted-foreground">·</span>
							) : null}
							<span
								className={
									step.state === "pending" ? "text-muted-foreground" : undefined
								}
							>
								{step.label}
							</span>
						</li>
					))}
				</ol>

				{progress && !live.done ? (
					<div className="grid gap-1">
						<Progress value={progress.percent} />
						<p className="text-muted-foreground text-xs">
							{progress.percent}% · {progress.transferred} / {progress.total}
							{progress.eta ? ` · ~${progress.eta} left` : ""}
						</p>
					</div>
				) : null}

				{idle && !progress ? (
					<p className="text-muted-foreground text-xs">Still working…</p>
				) : null}

				{live.done ? (
					<TerminalStatus status={live.status} />
				) : (
					<div className="flex justify-end">
						<Button disabled={canceling} onClick={cancel} variant="outline">
							{canceling ? "Canceling…" : "Cancel"}
						</Button>
					</div>
				)}

				<Collapsible>
					<CollapsibleTrigger className="text-muted-foreground text-xs underline">
						Show details
					</CollapsibleTrigger>
					<CollapsibleContent>
						<ScrollArea className="mt-2 h-40 rounded-md border border-border bg-background p-3 font-mono text-muted-foreground text-xs">
							{live.lines.map((line, i) => (
								<div key={`${i}-${line}`}>{line}</div>
							))}
						</ScrollArea>
					</CollapsibleContent>
				</Collapsible>
			</DialogContent>
		</Dialog>
	);
}

function TerminalStatus({ status }: { status: string }) {
	if (status === "failed") {
		return (
			<div className="flex items-center gap-1 text-destructive">
				<XCircle aria-hidden className="size-4" /> <span>Failed</span>
			</div>
		);
	}
	if (status === "canceled") {
		return (
			<div className="flex items-center gap-1 text-muted-foreground">
				<Ban aria-hidden className="size-4" /> <span>Canceled</span>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-1 text-success">
			<CheckCircle2 aria-hidden className="size-4" /> <span>Done</span>
		</div>
	);
}
```
If this file exceeds 220 lines, split `TerminalStatus` and the step list into a sibling `live-operation-parts.tsx`. The `useState(() => { setInterval … })` clock pattern: if the linter dislikes it, use a `useEffect` with `setInterval`/`clearInterval` keyed on `open && !live.done`.

- [ ] **Step 2: Rewire `operation-runner.tsx`** to delegate to `<LiveOperation>` while keeping its public props and adding optional `kind`:

```tsx
import { LiveOperation } from "@/components/patterns/live-operation";

export function OperationRunner({
	open,
	onOpenChange,
	title,
	jobId,
	kind = "generic",
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	jobId: string | null;
	kind?: string;
}) {
	return (
		<LiveOperation
			jobId={jobId}
			kind={kind}
			onOpenChange={onOpenChange}
			open={open}
			title={title}
		/>
	);
}
```

- [ ] **Step 3: Pass `kind` at the call sites.** In each `<OperationRunner … />`, add the matching `kind`: `backups.tsx` (backup vs restore — use a `runnerKind` state set alongside `runnerTitle`: `"backup"` for back-up-now, `"restore"` for restore); `staging.tsx` (`"refresh"`/`"promote"` — there are no step defs so they fall back to GENERIC, which is fine); `overview.tsx` (`"backup"`/`"wpUpdate"`); `server.tsx` (`"harden"`). Unknown kinds use `GENERIC_STEPS` automatically.

- [ ] **Step 4: Gate (incl. `bun run build`) — PASS. Commit:**

```bash
git add control-panel/web/src/components/patterns/live-operation.tsx control-panel/web/src/components/patterns/operation-runner.tsx control-panel/web/src/routes
git commit -m "feat(panel): friendly live operation runner (steps + progress + liveness + cancel)"
```

---

### Task 9: `<LiveLogTail>` + live Logs page

**Files:**
- Create: `control-panel/web/src/components/patterns/live-log-tail.tsx`
- Modify: `control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx`, `control-panel/web/src/data/queries.ts`

**Interfaces:**
- Consumes: `useLiveStream`, `client.logsFollow`.
- Produces: `<LiveLogTail siteId />`; a "Live" toggle on the Logs page that mounts it.

- [ ] **Step 1: Create `live-log-tail.tsx`:**

```tsx
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLiveStream } from "@/lib/live/use-live-stream";
import { client } from "@/lib/orpc/client";

export function LiveLogTail({ siteId, active }: { siteId: string; active: boolean }) {
	const live = useLiveStream(() => client.logsFollow({ siteId }), active);
	const recent = live.lines.slice(-500);
	return (
		<ScrollArea className="h-64 rounded-md border border-border bg-background p-3 font-mono text-muted-foreground text-xs">
			{recent.length === 0 ? (
				<p className="text-muted-foreground">Waiting for log lines…</p>
			) : (
				recent.map((line, i) => <div key={`${i}-${line}`}>{line}</div>)
			)}
		</ScrollArea>
	);
}
```

- [ ] **Step 2: Add a `logsFollowSource` factory** to `queries.ts` (for symmetry; the component can also call `client.logsFollow` directly):

```ts
export const logsFollowSource = (siteId: string) => () =>
	orpc.logsFollow ? client.logsFollow({ siteId }) : client.logsFollow({ siteId });
```
(Simplest: skip the factory and call `client.logsFollow` directly in `<LiveLogTail>` as shown — only add to `queries.ts` if the project convention requires it. Do not over-build.)

- [ ] **Step 3: Wire the Logs page.** In `logs.tsx`, add a "Live" toggle (a `Button`/`Switch` in the `PageHeader` actions). When live is on, render `<LiveLogTail active siteId={siteId} />` instead of the static `logsRecent` table; when off, keep the existing recent view. Keep the file ≤220 lines (extract the static table into a small local component if needed).

- [ ] **Step 4: Gate (incl. build) — PASS. Commit:**

```bash
git add control-panel/web/src/components/patterns/live-log-tail.tsx control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx control-panel/web/src/data/queries.ts
git commit -m "feat(panel): live Logs tail built on useLiveStream"
```

---

# Phase 5 — Routing + validation

### Task 10: `$siteId` index redirect

**Files:**
- Create: `control-panel/web/src/routes/_auth/sites/$siteId/index.tsx`

- [ ] **Step 1: Create the index route** that redirects the bare site URL to overview:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/sites/$siteId/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: "/sites/$siteId/overview",
			params: { siteId: params.siteId },
		});
	},
});
```

- [ ] **Step 2: Regenerate the route tree if the project uses a generated `routeTree.gen.ts`** (TanStack `bun run dev` autogenerates it; if it's committed, run the generator or let `check-types` confirm it picks up — the plugin regenerates on build). Gate (incl. build) — PASS.

- [ ] **Step 3: Commit:**

```bash
git add control-panel/web/src/routes/_auth/sites/$siteId/index.tsx control-panel/web/src/routeTree.gen.ts
git commit -m "fix(panel): redirect bare /sites/:id to overview (no more Not Found)"
```

---

### Task 11: Real-VPS validation (acceptance gate)

**Files:** none (validation only).

- [ ] **Step 1: Redeploy** — rsync the branch + `./bin/panel install --domain panel.vcode.sh …` (idempotent).
- [ ] **Step 2: Live backup** — run a backup on `test2`: the runner shows the **friendly step checklist** (Dumping → Archiving → Writing → Uploading), and during the upload a **real progress bar advances** (percent / MiB / ETA from rclone `--stats`); the dialog is **wider**; elapsed time ticks; no frozen UI. Confirm the **heartbeat** keeps it alive (no "is it stuck?" gap).
- [ ] **Step 3: Terminal states** — confirm a succeeded op shows green "Done", a failed op shows red "Failed", and Cancel shows muted "Canceled" (and still kills the process tree).
- [ ] **Step 4: Live logs** — open Logs, toggle **Live**: new log lines stream in; navigating away ends the stream (verify no orphaned `logs -f` on the box via `ps`).
- [ ] **Step 5: Routing** — visit `https://panel.vcode.sh/sites/test2-vcode-sh` (bare) → redirects to `…/overview` (no "Not Found").
- [ ] **Step 6: Record** pass/fail here + `docs/product-roadmap.md`; tick the boxes.

---

## Self-Review (completed during planning)

**Spec coverage:** heartbeat → Task 2; stderr merge → Task 1; rclone `--stats` → Task 3; `useLiveStream` + parsers/derivers → Tasks 5–7; `<LiveOperation>` (steps/progress/liveness/cancel/wider) → Task 8; `logsFollow` + `<LiveLogTail>` → Tasks 4, 9; routing → Task 10; VPS gate → Task 11. Constraints (TABS, ≤220, exec chokepoint, redaction, semantic tokens, no `any`) carried into every task.

**Placeholders:** none — pure-logic tasks carry complete code + tests; the UI tasks carry the full component code; shell + routing tasks carry exact edits. The `queries.ts` `logsFollowSource` step explicitly says "skip if not needed" (YAGNI), not a placeholder.

**Type consistency:** `StreamEvent {line,status,done}`, `mergeLineStreams`, `VIBE_OPS.logsFollow`, `LineStream(heartbeatMs)`, `parseRcloneProgress`, `deriveSteps`/`StepDef`/`Step`/`OP_STEPS`/`GENERIC_STEPS`, `liveReducer`/`initialLiveState`/`LiveState`, `useLiveStream(source, active)`, `<LiveOperation>` (adds `kind`), `<LiveLogTail>`, `client.logsFollow`/`operationsStream`/`operationsCancel` are used identically across defining and consuming tasks.
