import { redact } from "./redact";
import { mergeLineStreams } from "./stream-merge";

export type VibeEnv = "local" | "stage" | "prod" | "external";

export async function hostExec(
	argv: string[],
	opts: { timeoutMs?: number } = {}
): Promise<string> {
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 10_000);
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	clearTimeout(timer);
	return redact(out);
}

export const VIBE_OPS = {
	smoke: { argv: ["smoke"], stream: false },
	doctorRuntime: { argv: ["doctor-runtime"], stream: false },
	backups: { argv: ["backups"], stream: false },
	backup: { argv: ["backup"], stream: true },
	logsRecent: { argv: ["logs-recent"], stream: false },
	logsFollow: { argv: ["logs"], stream: true },
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
	wpPluginUpdateAll: {
		argv: ["wp", "plugin", "update", "--all"],
		stream: true,
	},
	wpPluginUpdates: {
		argv: ["wp", "plugin", "list", "--update=available", "--format=json"],
		stream: false,
	},
} as const;

export type VibeOp = keyof typeof VIBE_OPS;

/** Default wall-clock limit for streaming operations (30 minutes). */
export const STREAM_TIMEOUT_MS = 30 * 60 * 1000;

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

export async function runVibe(
	siteDir: string,
	env: VibeEnv,
	op: VibeOp,
	opts: {
		timeoutMs?: number;
		args?: string[];
		env?: Record<string, string>;
	} = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
	const argv = buildVibeArgv(siteDir, env, op, opts.args ?? []);
	const proc = Bun.spawn(argv, {
		cwd: siteDir,
		stdout: "pipe",
		stderr: "pipe",
		...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
	});
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 60_000);
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	clearTimeout(timer);
	return { stdout: redact(stdout), stderr: redact(stderr), code };
}

export function streamVibe(
	siteDir: string,
	env: VibeEnv,
	op: VibeOp,
	opts: {
		timeoutMs?: number;
		args?: string[];
		env?: Record<string, string>;
	} = {}
) {
	const argv = buildVibeArgv(siteDir, env, op, opts.args ?? []);
	// On Linux, spawn under setsid so the op gets its own session+group (pgid == pid).
	// This lets killTree signal the whole op tree with process.kill(-pid) without
	// touching the panel server's own process group.
	const onLinux = process.platform === "linux";
	const child = Bun.spawn(onLinux ? ["setsid", ...argv] : argv, {
		cwd: siteDir,
		stdout: "pipe",
		stderr: "pipe",
		...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
	});
	const killTree = () => {
		if (onLinux && child.pid && child.pid > 1) {
			try {
				// Negative pid signals the op's process group (pgid == pid after setsid).
				process.kill(-child.pid, "SIGTERM");
				return;
			} catch {
				// Group already gone — fall through to direct kill.
			}
		}
		child.kill();
	};
	const deadline = opts.timeoutMs ?? STREAM_TIMEOUT_MS;
	const timer = setTimeout(killTree, deadline);
	// Return a facade so callers' proc.kill() always kills the whole group,
	// while proc.exited still resolves when the direct child exits.
	const proc = { exited: child.exited, kill: killTree, pid: child.pid };
	// After the process exits, give a short grace for final buffered lines to
	// flush, then force the merge to end — so an orphaned grandchild holding a
	// pipe open can never wedge the stream open forever.
	const stopSignal = child.exited.then(
		() => new Promise((res) => setTimeout(res, 1500))
	);
	async function* lines(): AsyncIterable<string> {
		try {
			for await (const line of mergeLineStreams(
				[
					child.stdout as ReadableStream<Uint8Array>,
					child.stderr as ReadableStream<Uint8Array>,
				],
				redact,
				stopSignal
			)) {
				yield line;
			}
		} finally {
			clearTimeout(timer);
		}
	}
	return { proc, lines: lines() };
}
