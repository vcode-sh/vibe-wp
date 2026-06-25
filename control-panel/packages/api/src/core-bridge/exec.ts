import { redact } from "./redact";
import { mergeLineStreams } from "./stream-merge";

export type VibeEnv = "local" | "stage" | "prod" | "external" | "shared-db";

/**
 * Privilege boundary. In production the panel server runs as the unprivileged
 * `vibe-panel` user and may only reach the host through the root-owned,
 * sudoers-gated wrapper at PANEL_PRIVILEGED_RUNNER (bin/vibe-panel-run). When
 * that env is SET we prefix every host spawn with `sudo -n <runner> <verb> …`;
 * the wrapper revalidates the site path/env (vibe) or args (installer) before
 * doing anything. When UNSET (dev/local) we spawn directly, exactly as before —
 * no behavior change. Read lazily from process.env (like installerBin) so tests
 * and dev never need it set.
 */
function privilegedRunner(): string | null {
	const fromEnv = process.env.PANEL_PRIVILEGED_RUNNER;
	return fromEnv && fromEnv.length > 0 ? fromEnv : null;
}

/**
 * Rewrite a site `bin/vibe` argv produced by buildVibeArgv —
 * `["<siteDir>/bin/vibe", env, ...rest]` — into the privileged form the wrapper
 * expects: `["sudo","-n",runner,"vibe",siteDir,env,...rest]`. The wrapper then
 * reconstructs and execs `"<siteDir>/bin/vibe" env ...rest`. When no runner is
 * configured the argv is returned unchanged (direct dev spawn). Secrets are
 * never in argv here (only op verbs + paths), matching the existing contract.
 */
export function wrapVibeArgv(siteDir: string, vibeArgv: string[]): string[] {
	const runner = privilegedRunner();
	if (!runner) {
		return vibeArgv;
	}
	// vibeArgv[0] is "<siteDir>/bin/vibe"; drop it and pass siteDir explicitly so
	// the root wrapper — not the unprivileged caller — owns path reconstruction.
	const rest = vibeArgv.slice(1);
	return ["sudo", "-n", runner, "vibe", siteDir, ...rest];
}

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
	monitor: { argv: ["monitor", "--json", "--no-notify"], stream: false },
	perfReport: { argv: ["perf-report", "--json"], stream: false },
	securityStatus: { argv: ["security-status"], stream: false },
	/** List compose service status as JSON (non-streaming, read-only). */
	psJson: { argv: ["compose", "ps", "--format", "json"], stream: false },
	/** Read a single non-secret env key (takes one key-name arg). */
	env: { argv: ["env"], stream: false, takesArg: true },
	backups: { argv: ["backups"], stream: false },
	backup: { argv: ["backup"], stream: true },
	backupLocal: { argv: ["backup", "--local-only"], stream: true },
	backupConfigApply: { argv: ["backup-config-apply"], stream: false },
	/** Install/remove the scheduled-backup timer (arg: off|daily|weekly). */
	backupScheduleApply: {
		argv: ["backup-schedule-apply"],
		stream: false,
		takesArg: true,
	},
	/** Install/remove the hourly health-monitor timer (arg: on|off). */
	monitorScheduleApply: {
		argv: ["monitor-schedule-apply"],
		stream: false,
		takesArg: true,
	},
	/** Read the current backup cadence, monitor state, and WP debug flags. */
	scheduleStatus: { argv: ["schedule-status"], stream: false },
	/** Persist per-site WP runtime settings (debug flags) into the env file. */
	siteConfigApply: { argv: ["site-config-apply"], stream: false },
	/** Add/remove the www.<domain> Caddy alias and hot-reload (arg: on|off). */
	caddyWwwApply: {
		argv: ["caddy-www-apply"],
		stream: false,
		takesArg: true,
	},
	backupTest: { argv: ["backup-test"], stream: false },
	/** List a backup's files + DB tables as NDJSON-TAB (non-secret, read-only). */
	backupListContents: {
		argv: ["backup-list-contents"],
		stream: false,
		takesArg: true,
	},
	/** Restore ONE file or ONE table from a backup (destructive, streamed job). */
	backupRestoreItem: {
		argv: ["backup-restore-item"],
		stream: true,
		takesArg: true,
	},
	notifyConfigApply: { argv: ["notify-config-apply"], stream: false },
	notifyTest: { argv: ["notify-test"], stream: false },
	smtpConfigApply: { argv: ["smtp-config-apply"], stream: false },
	smtpTest: { argv: ["smtp-test"], stream: false },
	logsRecent: { argv: ["logs-recent"], stream: false, takesArg: true },
	logsFollow: { argv: ["logs"], stream: true, takesArg: true },
	logsExport: { argv: ["logs-recent"], stream: false, takesArg: true },
	up: { argv: ["up"], stream: true },
	down: { argv: ["down"], stream: true },
	restart: { argv: ["restart"], stream: true },
	/** Force-recreate nginx so its entrypoint re-renders config from env. */
	nginxRecreate: { argv: ["nginx-recreate"], stream: true },
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
	insights: { argv: ["insights"], stream: false },
	insightsRefresh: {
		argv: ["wp", "cron", "event", "run", "vibe_insights_collect_cron"],
		stream: false,
	},
	// --- Feature #4: per-item plugin/theme management (slug arrives as args[0]) ---
	wpPluginActivate: {
		argv: ["wp", "plugin", "activate"],
		stream: true,
		takesArg: true,
	},
	wpPluginDeactivate: {
		argv: ["wp", "plugin", "deactivate"],
		stream: true,
		takesArg: true,
	},
	wpPluginUpdate: {
		argv: ["wp", "plugin", "update"],
		stream: true,
		takesArg: true,
	},
	wpPluginDelete: {
		argv: ["wp", "plugin", "delete"],
		stream: true,
		takesArg: true,
	},
	wpPluginAutoUpdatesEnable: {
		argv: ["wp", "plugin", "auto-updates", "enable"],
		stream: false,
		takesArg: true,
	},
	wpPluginAutoUpdatesDisable: {
		argv: ["wp", "plugin", "auto-updates", "disable"],
		stream: false,
		takesArg: true,
	},
	wpThemeActivate: {
		argv: ["wp", "theme", "activate"],
		stream: true,
		takesArg: true,
	},
	wpThemeUpdate: {
		argv: ["wp", "theme", "update"],
		stream: true,
		takesArg: true,
	},
	wpThemeDelete: {
		argv: ["wp", "theme", "delete"],
		stream: true,
		takesArg: true,
	},
	wpThemeAutoUpdatesEnable: {
		argv: ["wp", "theme", "auto-updates", "enable"],
		stream: false,
		takesArg: true,
	},
	wpThemeAutoUpdatesDisable: {
		argv: ["wp", "theme", "auto-updates", "disable"],
		stream: false,
		takesArg: true,
	},
	/** Install/remove the scheduled plugin auto-update timer (arg: off|weekly|daily). */
	autoUpdateScheduleApply: {
		argv: ["auto-update-schedule-apply"],
		stream: false,
		takesArg: true,
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
	const argv = wrapVibeArgv(
		siteDir,
		buildVibeArgv(siteDir, env, op, opts.args ?? [])
	);
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

/**
 * Spawn a host process and expose it as a streamed job: a `{ proc, lines }`
 * shape where `proc.kill()` tears down the whole process tree and `lines` is a
 * redacted, merged stdout+stderr line iterator. Shared by streamVibe and
 * streamProvision so both inherit the same setsid kill-tree + timeout + redact
 * guarantees. Secrets must arrive via `opts.env`, never in `argv`.
 */
function spawnStream(
	argv: string[],
	opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> } = {}
) {
	// On Linux, spawn under setsid so the op gets its own session+group (pgid == pid).
	// This lets killTree signal the whole op tree with process.kill(-pid) without
	// touching the panel server's own process group. When a privileged runner is
	// configured the chain is `setsid sudo -n <runner> <verb> …`: setsid still wraps
	// the WHOLE chain, so the session leader is the `sudo` process and pgid == its
	// pid. killpg(-pid, SIGTERM) therefore reaps sudo + the wrapper + the site's
	// bin/vibe + its docker/wp subprocesses in one shot; `sudo -n` forwards the
	// SIGTERM it receives to its own child, so nothing is orphaned.
	const onLinux = process.platform === "linux";
	const child = Bun.spawn(onLinux ? ["setsid", ...argv] : argv, {
		...(opts.cwd ? { cwd: opts.cwd } : {}),
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
	const argv = wrapVibeArgv(
		siteDir,
		buildVibeArgv(siteDir, env, op, opts.args ?? [])
	);
	return spawnStream(argv, {
		cwd: siteDir,
		timeoutMs: opts.timeoutMs,
		env: opts.env,
	});
}

// ---------------------------------------------------------------------------
// Shared-DB ops (the ONE global MariaDB project). These are NOT per-site, so
// they do NOT use wrapVibeArgv (which is `sudo -n runner vibe <siteDir> …`). A
// dedicated top-level `shared-db <op> [slug]` wrapper subcommand handles them;
// the wrapper validates the op + slug and runs the matching bin/ script as root.
// ---------------------------------------------------------------------------

/** sub → the repo bin/ script the wrapper runs (dev direct-spawn path only). */
const SHARED_DB_SCRIPTS = {
	init: "shared-db-init",
	status: "shared-db-status",
	provision: "db-provision",
	deprovision: "db-deprovision",
	backup: "backup-shared-db",
	"rotate-root": "shared-db-rotate-root",
} as const;

export type SharedDbOp = keyof typeof SHARED_DB_SCRIPTS;

/**
 * Build the argv for a shared-db op. With a privileged runner configured (prod):
 * `["sudo","-n",runner,"shared-db",sub,...args]` — the root wrapper owns the
 * op+slug re-validation and script-path resolution. Without a runner (dev): spawn
 * the repo script directly from PANEL_HOST_DIR/bin (no shared container exists in
 * dev, so this is best-effort). Secrets are NEVER in argv (only the op + slug).
 */
export function wrapSharedDbArgv(
	sub: SharedDbOp,
	args: string[] = []
): string[] {
	const runner = privilegedRunner();
	if (runner) {
		return ["sudo", "-n", runner, "shared-db", sub, ...args];
	}
	const binDir = process.env.PANEL_HOST_DIR
		? `${process.env.PANEL_HOST_DIR}/bin`
		: "bin";
	return [`${binDir}/${SHARED_DB_SCRIPTS[sub]}`, ...args];
}

/**
 * Run a NON-SECRET shared-db op (init/status/deprovision/backup) and return its
 * redacted output. DO NOT use this for `provision`: its stdout is the per-site
 * password, and redact() would destroy it — use provisionSiteDb (shared-db.ts),
 * which captures the raw stdout in-process and never logs it.
 */
export async function runSharedDb(
	sub: Exclude<SharedDbOp, "provision">,
	args: string[] = [],
	opts: { timeoutMs?: number } = {}
): Promise<{ stdout: string; stderr: string; code: number }> {
	const argv = wrapSharedDbArgv(sub, args);
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 60_000);
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	clearTimeout(timer);
	return { stdout: redact(stdout), stderr: redact(stderr), code };
}

/**
 * Stream a long-running shared-db op (the only streamed one is `init`, which
 * runs `docker compose up -d --build` + a health wait). Same setsid kill-tree +
 * timeout + redact guarantees as streamVibe.
 */
export function streamSharedDb(
	sub: Extract<SharedDbOp, "init" | "backup">,
	args: string[] = [],
	opts: { timeoutMs?: number } = {}
) {
	return spawnStream(wrapSharedDbArgv(sub, args), {
		timeoutMs: opts.timeoutMs,
	});
}
