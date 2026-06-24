import { runVibe, streamVibe, type VibeEnv, type VibeOp } from "./exec";
import { getRealDeps, launchJob } from "./jobs";

/** Captures the backup directory printed by bin/backup ("Backup written to <p>"). */
const BACKUP_PATH_RE = /Backup written to (\S+)/;
const SMOKE_TIMEOUT_MS = 120_000;

export type SafeTarget =
	| { kind: "plugin" | "theme"; slug: string }
	| { kind: "core" }
	| { kind: "allPlugins" };

interface StreamLike {
	lines: AsyncIterable<string>;
	proc: { exited: Promise<number>; kill: () => void };
}

export interface SafeUpdateDeps {
	fetchFn: typeof fetch;
	/** Whether off-server R2 backup is configured (else use the env-immune local backup). */
	r2: boolean;
	runVibe: (
		d: string,
		e: VibeEnv,
		op: VibeOp,
		o?: { args?: string[]; timeoutMs?: number }
	) => Promise<{ stdout: string; stderr: string; code: number }>;
	siteUrl: string;
	streamVibe: (
		d: string,
		e: VibeEnv,
		op: VibeOp,
		o?: { args?: string[] }
	) => StreamLike;
	ttfbMs: number;
}

export interface SafeUpdateParams {
	env: VibeEnv;
	target: SafeTarget;
	workDir: string;
}

function updateOp(t: SafeTarget): { op: VibeOp; args?: string[] } {
	if (t.kind === "core") {
		return { op: "wpCoreUpdate" };
	}
	if (t.kind === "allPlugins") {
		return { op: "wpPluginUpdateAll" };
	}
	if (t.kind === "plugin") {
		return { op: "wpPluginUpdate", args: [t.slug] };
	}
	return { op: "wpThemeUpdate", args: [t.slug] };
}

function describeTarget(t: SafeTarget): string {
	if (t.kind === "core") {
		return "WordPress core";
	}
	if (t.kind === "allPlugins") {
		return "all plugins";
	}
	return `${t.kind} ${t.slug}`;
}

/** Stream a step's lines under a label; the delegated return is the exit code. */
async function* streamStep(
	stream: StreamLike,
	label: string
): AsyncGenerator<string, number> {
	for await (const line of stream.lines) {
		yield `${label} ${line}`;
	}
	return await stream.proc.exited;
}

/** Stream the backup step, capturing the snapshot path. Returns code + snapshot. */
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

/** Run smoke + homepage TTFB; the delegated return is whether the site is healthy. */
async function* verifyStep(
	deps: SafeUpdateDeps,
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
 * Build the safe-update job as a custom { proc, lines } so it slots into the
 * shared launchJob path. The rollback restore is an INTERNAL step of this job
 * (authorized by the safeUpdate operator gate) — never the admin-gated standalone
 * restore procedure. Return type is inferred (it carries pid: 0 so it satisfies
 * launchJob's produce(); StreamLike, without pid, is only what we consume).
 */
export function buildSafeUpdateStream(
	deps: SafeUpdateDeps,
	params: SafeUpdateParams
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

	async function* run(): AsyncIterable<string> {
		const { workDir, env, target } = params;
		try {
			// 1. Pre-update backup.
			yield "[backup] Taking pre-update snapshot…";
			const backupOp: VibeOp = deps.r2 ? "backup" : "backupLocal";
			const bk = deps.streamVibe(workDir, env, backupOp);
			currentKill = bk.proc.kill;
			const { code: bkCode, snapshot } = yield* backupStep(bk);
			if (bkCode !== 0 || !snapshot) {
				yield "[done] Could not take a pre-update backup — aborting (nothing changed).";
				exitResolve(1);
				return;
			}
			if (canceled) {
				exitResolve(1);
				return;
			}

			// 2. Apply the update.
			const { op, args } = updateOp(target);
			yield `[update] Updating ${describeTarget(target)}…`;
			const up = deps.streamVibe(workDir, env, op, args ? { args } : undefined);
			currentKill = up.proc.kill;
			const upCode = yield* streamStep(up, "[update]");
			if (upCode !== 0) {
				yield "[done] Update failed; nothing was applied (no restore needed).";
				exitResolve(1);
				return;
			}
			if (canceled) {
				exitResolve(1);
				return;
			}

			// 3. Verify, then succeed or auto-rollback.
			const ok = yield* verifyStep(deps, workDir, env);
			if (ok) {
				yield `[done] Update succeeded. Snapshot retained: ${snapshot}`;
				exitResolve(0);
				return;
			}
			yield `[restore] Verification failed — auto-restoring from ${snapshot}…`;
			const rs = deps.streamVibe(workDir, env, "restore", { args: [snapshot] });
			currentKill = rs.proc.kill;
			yield* streamStep(rs, "[restore]");
			const post = await deps.runVibe(workDir, env, "smoke", {
				timeoutMs: SMOKE_TIMEOUT_MS,
			});
			yield `[smoke] Post-restore smoke: ${post.code === 0 ? "passed" : "FAILED — investigate"}`;
			yield "[done] Update rolled back. Check error logs.";
			exitResolve(1);
		} catch (e) {
			yield `[done] Safe-update aborted: ${String(e)}`;
			exitResolve(1);
		}
	}

	// pid: 0 — synthetic compound stream (no single child); matches provision-job's
	// pattern. Nothing reads pid for a tracked job (cancel uses proc.kill()).
	return { proc: { exited, kill, pid: 0 }, lines: run() };
}

/**
 * Launch a tracked safe-update job. Resolves real job deps (persist/audit/findSite)
 * and wires the compound stream through the shared launchJob durability path.
 */
export async function startSafeUpdate(input: {
	siteId: string;
	env: VibeEnv;
	target: SafeTarget;
	userId: string;
	siteUrl: string;
	r2: boolean;
}): Promise<{ jobId: string }> {
	const d = await getRealDeps();
	const site = await d.findSite(input.siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	const ttfbMs = Number(process.env.VIBE_SAFEUPDATE_TTFB_THRESHOLD_MS ?? 3000);
	return launchJob(
		{
			action: "safeUpdate",
			kind: "safeUpdate",
			siteId: input.siteId,
			userId: input.userId,
		},
		() =>
			buildSafeUpdateStream(
				{
					streamVibe,
					runVibe,
					fetchFn: fetch,
					siteUrl: input.siteUrl,
					ttfbMs,
					r2: input.r2,
				},
				{ workDir: site.installDir, env: input.env, target: input.target }
			),
		d
	);
}
