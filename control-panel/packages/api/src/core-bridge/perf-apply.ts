import type { PerfRecommendation } from "../contract";
import { runVibe, streamVibe, type VibeEnv, type VibeOp } from "./exec";
import { getRealDeps, launchJob } from "./jobs";
import { PERF_TUNABLE_KEYS } from "./perf-advisor";

/**
 * perf-apply (core-bridge) — EXPERIMENTAL, NOT YET VALIDATED on a real VPS.
 *
 * Mirrors safe-update.ts exactly: backup snapshot → write env (perf-apply) →
 * recreate the affected services so their entrypoints re-render config from env
 * → smoke + homepage TTFB verify → on failure auto-rollback (perf-apply
 * --rollback) and re-smoke. The compound { proc, lines } slots into launchJob.
 *
 * SAFETY: the tunable VALUES travel via opts.env (VIBE_PERF_* + VIBE_PERF_KEYS),
 * NEVER on argv. The pure advisor already enforced reserved<=85% RAM; bin/
 * perf-apply RE-ASSERTS the same cap at the root boundary (distrust the panel),
 * so a too-large innodb buffer pool is rejected BEFORE any container recreate.
 * The most likely real failure is db refusing to start with an oversized pool —
 * the verify/rollback path restores the env sidecar and recreates to recover.
 */

const PERF_KEY_SET = new Set<string>(PERF_TUNABLE_KEYS);
const BACKUP_PATH_RE = /Backup written to (\S+)/;
const SMOKE_TIMEOUT_MS = 120_000;
/** Restarting wordpress+db can be slow; give the recreate room. */
const RECREATE_TIMEOUT_MS = 180_000;

interface StreamLike {
	lines: AsyncIterable<string>;
	proc: { exited: Promise<number>; kill: () => void };
}

export interface PerfApplyDeps {
	fetchFn: typeof fetch;
	r2: boolean;
	runVibe: (
		d: string,
		e: VibeEnv,
		op: VibeOp,
		o?: { args?: string[]; timeoutMs?: number; env?: Record<string, string> }
	) => Promise<{ stdout: string; stderr: string; code: number }>;
	siteUrl: string;
	streamVibe: (
		d: string,
		e: VibeEnv,
		op: VibeOp,
		o?: { args?: string[]; env?: Record<string, string> }
	) => StreamLike;
	ttfbMs: number;
}

export interface PerfApplyParams {
	env: VibeEnv;
	/** The advisor recommendations the admin chose to apply (atomic-all). */
	recommendations: PerfRecommendation[];
	workDir: string;
}

/**
 * Build the VIBE_PERF_* env map + VIBE_PERF_KEYS declaration from the chosen
 * recommendations. Only keys in the FIXED tunable set are forwarded; anything
 * else is dropped here (and would be rejected at the root boundary anyway).
 */
export function perfRecsToEnv(
	recs: PerfRecommendation[]
): Record<string, string> {
	const env: Record<string, string> = {};
	const keys: string[] = [];
	for (const r of recs) {
		if (!PERF_KEY_SET.has(r.key)) {
			continue;
		}
		env[`VIBE_PERF_${r.key}`] = r.suggested;
		keys.push(r.key);
	}
	env.VIBE_PERF_KEYS = keys.join(" ");
	return env;
}

async function* streamStep(
	stream: StreamLike,
	label: string
): AsyncGenerator<string, number> {
	for await (const line of stream.lines) {
		yield `${label} ${line}`;
	}
	return await stream.proc.exited;
}

async function* backupStep(
	stream: StreamLike
): AsyncGenerator<string, { code: number; snapshot: string | null }> {
	let snapshot: string | null = null;
	for await (const line of stream.lines) {
		const cap = line.match(BACKUP_PATH_RE)?.[1];
		if (cap) {
			snapshot = cap;
		}
		yield `[backup] ${line}`;
	}
	return { code: await stream.proc.exited, snapshot };
}

async function* verifyStep(
	deps: PerfApplyDeps,
	workDir: string,
	env: VibeEnv
): AsyncGenerator<string, boolean> {
	const smoke = await deps.runVibe(workDir, env, "smoke", {
		timeoutMs: SMOKE_TIMEOUT_MS,
	});
	let ok = smoke.code === 0;
	yield `[smoke] ${ok ? "ok" : "failed"} (exit ${smoke.code})`;
	if (!ok) {
		return false;
	}
	const start = Date.now();
	try {
		const res = await deps.fetchFn(`${deps.siteUrl}/`);
		const ttfb = Date.now() - start;
		ok = (res as { ok: boolean }).ok && ttfb <= deps.ttfbMs;
		yield `[ttfb] Homepage ${ttfb}ms ${ok ? "✓" : `> ${deps.ttfbMs}ms ✗`}`;
	} catch (e) {
		ok = false;
		yield `[ttfb] request failed: ${String(e)}`;
	}
	return ok;
}

/**
 * Build the perf-apply job as a compound { proc, lines } so it slots into the
 * shared launchJob path. The rollback (perf-apply --rollback) + recreate is an
 * INTERNAL step of this job, never the standalone admin restore procedure.
 */
export function buildPerfApplyStream(
	deps: PerfApplyDeps,
	params: PerfApplyParams
) {
	let canceled = false;
	let exitResolve!: (code: number) => void;
	const exited = new Promise<number>((res) => {
		exitResolve = res;
	});
	let currentKill: (() => void) | null = null;
	const kill = () => {
		canceled = true;
		currentKill?.();
	};

	const perfEnv = perfRecsToEnv(params.recommendations);

	async function* run(): AsyncIterable<string> {
		const { workDir, env } = params;
		try {
			if (Object.keys(perfEnv).length <= 1) {
				yield "[done] No applicable performance recommendations — nothing to apply.";
				exitResolve(0);
				return;
			}

			yield "[note] EXPERIMENTAL: perf-apply is not yet validated on a real VPS.";

			// 1. Pre-apply backup (env-immune local snapshot for the rollback path).
			yield "[backup] Taking pre-apply snapshot…";
			const backupOp: VibeOp = deps.r2 ? "backup" : "backupLocal";
			const bk = deps.streamVibe(workDir, env, backupOp);
			currentKill = bk.proc.kill;
			const { code: bkCode, snapshot } = yield* backupStep(bk);
			if (bkCode !== 0 || !snapshot) {
				yield "[done] Could not take a pre-apply backup — aborting (nothing changed).";
				exitResolve(1);
				return;
			}
			if (canceled) {
				exitResolve(1);
				return;
			}

			// 2. Write the tunables (root re-asserts the 85% RAM cap + allowlist).
			yield "[apply] Writing performance tunables to the env file…";
			const ap = deps.streamVibe(workDir, env, "perfApply", { env: perfEnv });
			currentKill = ap.proc.kill;
			const apCode = yield* streamStep(ap, "[apply]");
			if (apCode !== 0) {
				yield "[done] perf-apply refused (cap or validation failure) — nothing applied.";
				exitResolve(1);
				return;
			}
			if (canceled) {
				exitResolve(1);
				return;
			}

			// 3. Recreate wordpress+db so the entrypoints re-render config from env.
			yield "[recreate] Recreating wordpress + db to apply the new config…";
			const rc = deps.streamVibe(workDir, env, "up");
			currentKill = rc.proc.kill;
			const rcCode = yield* streamStep(rc, "[recreate]");
			if (rcCode !== 0) {
				yield "[recreate] Recreate failed — rolling back the env changes.";
				yield* rollback(deps, params, "env-only");
				exitResolve(1);
				return;
			}

			// 4. Verify, then succeed or auto-rollback (env + recreate).
			const ok = yield* verifyStep(deps, workDir, env);
			if (ok) {
				yield `[done] Performance tuning applied. Snapshot retained: ${snapshot}`;
				exitResolve(0);
				return;
			}
			yield "[rollback] Verification failed — restoring previous tunables…";
			yield* rollback(deps, params, "full");
			yield "[done] Performance tuning rolled back. Check error logs.";
			exitResolve(1);
		} catch (e) {
			yield `[done] perf-apply aborted: ${String(e)}`;
			exitResolve(1);
		}
	}

	/** Restore env from the sidecar, then (full) recreate + re-smoke. */
	async function* rollback(
		d: PerfApplyDeps,
		p: PerfApplyParams,
		mode: "env-only" | "full"
	): AsyncGenerator<string> {
		const rb = d.streamVibe(p.workDir, p.env, "perfApplyRollback");
		currentKill = rb.proc.kill;
		yield* streamStep(rb, "[rollback]");
		if (mode === "full") {
			const rc = d.streamVibe(p.workDir, p.env, "up");
			currentKill = rc.proc.kill;
			yield* streamStep(rc, "[rollback-recreate]");
			const post = await d.runVibe(p.workDir, p.env, "smoke", {
				timeoutMs: SMOKE_TIMEOUT_MS,
			});
			yield `[smoke] Post-rollback smoke: ${post.code === 0 ? "passed" : "FAILED — investigate"}`;
		}
	}

	return { proc: { exited, kill, pid: 0 }, lines: run() };
}

/**
 * Launch a tracked perf-apply job. Admin-gated at the procedure layer. Resolves
 * real job deps and wires the compound stream through launchJob's durability +
 * cancel path. EXPERIMENTAL.
 */
export async function startPerfApply(input: {
	siteId: string;
	env: VibeEnv;
	recommendations: PerfRecommendation[];
	userId: string;
	siteUrl: string;
	r2: boolean;
}): Promise<{ jobId: string }> {
	const d = await getRealDeps();
	const site = await d.findSite(input.siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	const ttfbMs = Number(process.env.VIBE_PERFAPPLY_TTFB_THRESHOLD_MS ?? 3000);
	return launchJob(
		{
			action: "perfApply",
			kind: "perfApply",
			siteId: input.siteId,
			userId: input.userId,
		},
		() =>
			buildPerfApplyStream(
				{
					streamVibe,
					runVibe,
					fetchFn: fetch,
					siteUrl: input.siteUrl,
					ttfbMs,
					r2: input.r2,
				},
				{
					workDir: site.installDir,
					env: input.env,
					recommendations: input.recommendations,
				}
			),
		d
	);
}

export { RECREATE_TIMEOUT_MS };
