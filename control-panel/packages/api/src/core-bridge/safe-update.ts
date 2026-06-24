import { runVibe, streamVibe, type VibeEnv, type VibeOp } from "./exec";
import { getRealDeps, launchJob } from "./jobs";

export type SafeTarget =
	| { kind: "plugin" | "theme"; slug: string }
	| { kind: "core" }
	| { kind: "allPlugins" };

interface StreamLike {
	proc: { exited: Promise<number>; kill: () => void };
	lines: AsyncIterable<string>;
}

export interface SafeUpdateDeps {
	streamVibe: (
		d: string,
		e: VibeEnv,
		op: VibeOp,
		o?: { args?: string[] }
	) => StreamLike;
	runVibe: (
		d: string,
		e: VibeEnv,
		op: VibeOp,
		o?: { args?: string[]; timeoutMs?: number }
	) => Promise<{ stdout: string; stderr: string; code: number }>;
	fetchFn: typeof fetch;
	siteUrl: string;
	ttfbMs: number;
	/** Whether off-server R2 backup is configured (else use the env-immune local backup). */
	r2: boolean;
}

export interface SafeUpdateParams {
	workDir: string;
	env: VibeEnv;
	target: SafeTarget;
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

/**
 * Build the safe-update job as a custom { proc, lines } so it slots into the
 * shared launchJob path. `lines` orchestrates backup -> update -> smoke+TTFB and,
 * on any verify failure, auto-restores the snapshot taken seconds earlier. The
 * rollback restore is an INTERNAL step of this job (authorized by the safeUpdate
 * operator gate) — never the admin-gated standalone restore procedure.
 */
// Return type is inferred (it carries pid: 0 so it satisfies launchJob's
// produce(), which expects the streamVibe shape). StreamLike (no pid) is only the
// shape safe-update CONSUMES from deps.streamVibe.
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
		let snapshot: string | null = null;
		try {
			// 1. Pre-update backup.
			yield "[backup] Taking pre-update snapshot…";
			const backupOp: VibeOp = deps.r2 ? "backup" : "backupLocal";
			const bk = deps.streamVibe(workDir, env, backupOp);
			currentKill = bk.proc.kill;
			for await (const line of bk.lines) {
				const cap = line.match(/Backup written to (\S+)/)?.[1];
				if (cap) {
					snapshot = cap;
				}
				yield `[backup] ${line}`;
			}
			if ((await bk.proc.exited) !== 0 || !snapshot) {
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
			for await (const line of up.lines) {
				yield `[update] ${line}`;
			}
			if ((await up.proc.exited) !== 0) {
				yield "[done] Update failed; nothing was applied (no restore needed).";
				exitResolve(1);
				return;
			}
			if (canceled) {
				exitResolve(1);
				return;
			}

			// 3. Verify: smoke + TTFB.
			yield "[smoke] Running smoke tests…";
			const smoke = await deps.runVibe(workDir, env, "smoke", {
				timeoutMs: 120_000,
			});
			let ok = smoke.code === 0;
			yield `[smoke] ${ok ? "ok" : "failed"} (exit ${smoke.code})`;
			if (ok) {
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
			}

			// 4. Success, or auto-rollback.
			if (ok) {
				yield `[done] Update succeeded. Snapshot retained: ${snapshot}`;
				exitResolve(0);
				return;
			}
			yield `[restore] Verification failed — auto-restoring from ${snapshot}…`;
			const rs = deps.streamVibe(workDir, env, "restore", { args: [snapshot] });
			currentKill = rs.proc.kill;
			for await (const line of rs.lines) {
				yield `[restore] ${line}`;
			}
			await rs.proc.exited;
			const post = await deps.runVibe(workDir, env, "smoke", {
				timeoutMs: 120_000,
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
