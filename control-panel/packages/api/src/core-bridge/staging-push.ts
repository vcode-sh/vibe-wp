import { runVibe, streamVibe, type VibeEnv, type VibeOp } from "./exec";
import { getRealDeps, launchJob } from "./jobs";

/** Captures the backup directory printed by bin/backup ("Backup written to <p>"). */
const BACKUP_PATH_RE = /Backup written to (\S+)/;
const SMOKE_TIMEOUT_MS = 120_000;

interface StreamLike {
	lines: AsyncIterable<string>;
	proc: { exited: Promise<number>; kill: () => void };
}

export interface StagingPushDeps {
	fetchFn: typeof fetch;
	/** Whether off-server R2 backup is configured (else the env-immune local backup). */
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

export interface StagingPushParams {
	workDir: string;
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

/** Stream the backup step, capturing the prod snapshot path. Returns code + snapshot. */
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

/** Run prod smoke + homepage TTFB; the delegated return is whether prod is healthy. */
async function* verifyStep(
	deps: StagingPushDeps,
	workDir: string
): AsyncGenerator<string, boolean> {
	const smoke = await deps.runVibe(workDir, "prod", "smoke", {
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

/** Roll prod back to the captured snapshot, then re-smoke. Internal step only. */
async function* rollback(
	deps: StagingPushDeps,
	workDir: string,
	snapshot: string,
	currentKill: (k: () => void) => void
): AsyncGenerator<string, void> {
	yield `[restore] auto-restoring from ${snapshot}…`;
	const rs = deps.streamVibe(workDir, "prod", "restore", { args: [snapshot] });
	currentKill(rs.proc.kill);
	yield* streamStep(rs, "[restore]");
	const post = await deps.runVibe(workDir, "prod", "smoke", {
		timeoutMs: SMOKE_TIMEOUT_MS,
	});
	yield `[smoke] Post-restore smoke: ${post.code === 0 ? "passed" : "FAILED — investigate"}`;
	yield "[done] Rolled back. Check error logs.";
}

/**
 * Build the "Push staging to live" job as a custom { proc, lines } so it slots
 * into the shared launchJob path, mirroring buildSafeUpdateStream. The rollback
 * restore is an INTERNAL step of this job (authorized by the stagingPushToLive
 * admin gate) — NEVER the admin-gated standalone restore procedure.
 *
 * Unlike safe-update's "update failed -> no restore needed" branch, a FAILED
 * promotion MUST roll back: the promote script may have already rm -rf'd + tar'd
 * partial files into prod before failing, so prod can be left in a broken state.
 */
export function buildStagingPushStream(
	deps: StagingPushDeps,
	params: StagingPushParams
) {
	let canceled = false;
	let exitResolve!: (code: number) => void;
	const exited = new Promise<number>((res) => {
		exitResolve = res;
	});
	let currentKill: (() => void) | null = null;
	const setKill = (k: () => void) => {
		currentKill = k;
	};
	const kill = () => {
		canceled = true;
		currentKill?.();
	};

	async function* run(): AsyncIterable<string> {
		const { workDir } = params;
		try {
			// 1. Pre-promote PROD snapshot — the single authoritative rollback point.
			// Always prod-env (backups are per-env: backups/<env>/<ts>) so the restore
			// targets prod. This is the top invariant: a stage-env snapshot would roll
			// the wrong environment back.
			yield "[backup] Taking pre-promote production snapshot…";
			const backupOp: VibeOp = deps.r2 ? "backup" : "backupLocal";
			const bk = deps.streamVibe(workDir, "prod", backupOp);
			setKill(bk.proc.kill);
			const { code: bkCode, snapshot } = yield* backupStep(bk);
			if (bkCode !== 0 || !snapshot) {
				yield "[done] Could not take a pre-promote backup — aborting (nothing changed).";
				exitResolve(1);
				return;
			}
			if (canceled) {
				exitResolve(1);
				return;
			}

			// 2. Promote staged files to prod, WITHOUT the script's own backup (the
			// panel snapshot above is the authoritative rollback point).
			yield "[promote] Publishing staging files to live…";
			const pr = deps.streamVibe(workDir, "stage", "promoteFilesNoBackup");
			setKill(pr.proc.kill);
			const prCode = yield* streamStep(pr, "[promote]");
			if (prCode !== 0) {
				yield `[promote] promotion failed; prod files may be partially copied — auto-restoring from ${snapshot}…`;
				yield* rollback(deps, workDir, snapshot, setKill);
				exitResolve(1);
				return;
			}
			if (canceled) {
				exitResolve(1);
				return;
			}

			// 3. Verify prod, then succeed or auto-rollback.
			const ok = yield* verifyStep(deps, workDir);
			if (ok) {
				yield `[done] Push to live succeeded. Snapshot retained: ${snapshot}`;
				exitResolve(0);
				return;
			}
			yield `[restore] Verification failed — auto-restoring from ${snapshot}…`;
			yield* rollback(deps, workDir, snapshot, setKill);
			exitResolve(1);
		} catch (e) {
			yield `[done] Push to live aborted: ${String(e)}`;
			exitResolve(1);
		}
	}

	// pid: 0 — synthetic compound stream (no single child); identical shape to
	// safe-update. Nothing reads pid for a tracked job (cancel uses proc.kill()).
	return { proc: { exited, kill, pid: 0 }, lines: run() };
}

/**
 * Launch a tracked "Push staging to live" job. Resolves the prod public URL (for
 * the TTFB probe) and the env-immune LOCAL snapshot flag, then wires the compound
 * stream through the shared launchJob durability path. r2 is always false: the
 * rollback snapshot is local so it never depends on off-site network state — the
 * same choice safe-update makes in resolveSafeUpdateContext.
 */
export async function startStagingPushToLive(input: {
	siteId: string;
	userId: string;
}): Promise<{ jobId: string }> {
	const d = await getRealDeps();
	const site = await d.findSite(input.siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	// WP_HOME is the public prod URL and is in the wrapper's non-secret env allowlist.
	const { stdout } = await runVibe(site.installDir, "prod", "env", {
		args: ["WP_HOME"],
	});
	const siteUrl = stdout.trim() || "http://localhost";
	const ttfbMs = Number(process.env.VIBE_SAFEUPDATE_TTFB_THRESHOLD_MS ?? 3000);
	return launchJob(
		{
			action: "stagingPushToLive",
			kind: "stagingPushToLive",
			siteId: input.siteId,
			userId: input.userId,
		},
		() =>
			buildStagingPushStream(
				{ streamVibe, runVibe, fetchFn: fetch, siteUrl, ttfbMs, r2: false },
				{ workDir: site.installDir }
			),
		d
	);
}
