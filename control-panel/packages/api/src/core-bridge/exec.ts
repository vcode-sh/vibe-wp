import { isPanelHostname } from "./panel-domain";
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
	/** Sample FPM/OPcache/Redis/InnoDB + host RAM over a short window (advisor input). */
	perfMeasure: { argv: ["perf-measure", "--json"], stream: false },
	/**
	 * Feature #5 — write the advisor's RAM-budgeted tunables into the env file.
	 * Admin-gated at the procedure layer; the job wraps it in a backup → verify →
	 * auto-rollback safety net. Tunable VALUES travel via opts.env (VIBE_PERF_* +
	 * VIBE_PERF_KEYS), NEVER on argv, identical to site-config-apply. takesArg is
	 * false: there are no positional args (only the --rollback variant below).
	 */
	perfApply: { argv: ["perf-apply"], stream: true },
	/** Roll back the last perf-apply from the env/<env>.perf.bak snapshot. */
	perfApplyRollback: { argv: ["perf-apply", "--rollback"], stream: true },
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
	/**
	 * Promote staged files to prod WITHOUT the script's own pre-promote backup.
	 * Used only by the panel's "Push to live" job (staging-push.ts), which takes
	 * and captures its OWN authoritative prod snapshot first and rolls back to it
	 * on failure — so the promote script must not take a redundant second backup
	 * (and the --no-backup path also skips the typed-confirm prompt, which has no
	 * TTY in the panel). The flag lives in the op's own argv (allowlisted, exactly
	 * like backupLocal's --local-only), so it never trips buildVibeArgv's leading-
	 * dash guard. --yes is still appended for the same headless-confirm reason.
	 */
	promoteFilesNoBackup: {
		argv: ["promote-files-to-prod", "--no-backup"],
		stream: true,
		yes: true,
	},
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
	// --- Feature E: OPTIONAL CVE feed (scaffolded OFF). Takes NO argv args — the
	// plugin slugs arrive on STDIN (keeps slugs/secrets off the process table)
	// and the source URL + key arrive via env (PANEL_VULN_FEED_URL/KEY). Default
	// OFF: when the source env var is unset the op prints `{}` and exits 0. Driven
	// only through runVulnFeed (which pipes stdin), never buildVibeArgv extraArgs.
	vulnFeedFetch: { argv: ["vuln-feed-fetch"], stream: false },
	// WP user management (Plesk WP-Toolkit parity). wpUserList is a single FIXED
	// read form (validate_wp_args allowlists exactly these non-secret fields — no
	// password hash). wpUserSetPassword takes the login on argv (charset-validated
	// at the root boundary) and the NEW password on STDIN ONLY — see
	// setWpUserPassword, which pipes it like runVulnFeed (never argv/ps).
	wpUserList: {
		argv: [
			"wp",
			"user",
			"list",
			"--fields=ID,user_login,display_name,user_email,roles",
			"--format=json",
		],
		stream: false,
	},
	wpUserSetPassword: {
		argv: ["wp-user-set-password"],
		stream: false,
		takesArg: true,
	},
	// One-click login (Plesk WP-Toolkit parity). Takes the target user id on argv;
	// the token's sha256 HASH arrives on STDIN (the plaintext token never reaches
	// the host) — see mintLoginLink. The vibe-wp-sso mu-plugin redeems the token.
	wpLoginLink: {
		argv: ["wp-login-link"],
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
 * Run the OPTIONAL CVE-feed op (Feature E). The plugin slugs are piped on STDIN
 * (one per line) — NEVER on argv — so they (and any future per-slug query) stay
 * off the process table. The feed SOURCE URL + KEY arrive via env injection
 * (PANEL_VULN_FEED_URL / PANEL_VULN_FEED_KEY); both are env-file-only and must be
 * in bin/panel's sudoers `env_keep` to survive sudo's env_reset, exactly like the
 * R2/SMTP secrets. DEFAULT = OFF: when PANEL_VULN_FEED_URL is unset we short-
 * circuit to an empty feed without spawning anything (the bin/ script is a `{}`
 * no-op too — defense in depth). Output is redacted at the exec boundary like
 * every other host op; the key is never echoed by the script.
 *
 * Returns the op's stdout (a `{slug:[...]}` JSON map, or `{}`); the caller parses
 * it with parseVulnFeed. Best-effort: a non-zero exit yields empty stdout so a
 * flaky/blocked feed never wedges the radar.
 */
/**
 * Env keys runVulnFeed injects into the host op (Feature E). Listed here as the
 * single source of truth so bin/panel's sudoers `env_keep` drift guard
 * (env-keep-sync.test.ts) stays in sync — sudo's env_reset strips anything not
 * preserved, so omitting these would silently disable a configured CVE feed.
 */
export const VULN_FEED_ENV_KEYS = [
	"PANEL_VULN_FEED_URL",
	"PANEL_VULN_FEED_KEY",
] as const;

export async function runVulnFeed(
	hostDir: string,
	slugs: string[],
	opts: { timeoutMs?: number } = {}
): Promise<string> {
	const url = process.env.PANEL_VULN_FEED_URL;
	if (!url || url.length === 0) {
		return "{}"; // feed OFF — no spawn, empty map.
	}
	const key = process.env.PANEL_VULN_FEED_KEY;
	const argv = wrapVibeArgv(
		hostDir,
		buildVibeArgv(hostDir, "prod", "vulnFeedFetch", [])
	);
	const proc = Bun.spawn(argv, {
		cwd: hostDir,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			PANEL_VULN_FEED_URL: url,
			...(key ? { PANEL_VULN_FEED_KEY: key } : {}),
		},
	});
	// Slugs on stdin, newline-separated, then close so the script's read returns.
	const writer = proc.stdin as { write: (s: string) => void; end: () => void };
	writer.write(`${slugs.join("\n")}\n`);
	writer.end();
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 15_000);
	const stdout = await new Response(proc.stdout).text();
	const code = await proc.exited;
	clearTimeout(timer);
	if (code !== 0) {
		return "{}"; // best-effort: a failed feed contributes no CVE rows.
	}
	return redact(stdout);
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
// Support bundle (download) + GUI stack update. Both are SERVER-level ops (not
// per-site), so neither uses wrapVibeArgv. Each maps to its OWN top-level
// bin/vibe-panel-run subcommand (`support-bundle` / `panel-update`), gated on
// PANEL_PRIVILEGED_RUNNER exactly like wrapVibeArgv.
// ---------------------------------------------------------------------------

/** Largest support-bundle archive we will buffer/return (defensive cap). */
export const SUPPORT_BUNDLE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** Wall-clock limit for collecting the support bundle. */
const SUPPORT_BUNDLE_TIMEOUT_MS = 60_000;

/**
 * Build the argv for the support-bundle collector. With a privileged runner
 * (prod): `["sudo","-n",runner,"support-bundle"]` — the root wrapper asserts the
 * collector is root-owned and execs it, streaming its archive bytes straight
 * back. Without a runner (dev): spawn the repo script directly from
 * PANEL_HOST_DIR/bin. ZERO args ever — there is no caller input to validate.
 */
export function wrapSupportBundleArgv(): string[] {
	const runner = privilegedRunner();
	if (runner) {
		return ["sudo", "-n", runner, "support-bundle"];
	}
	const hostDir = process.env.PANEL_HOST_DIR ?? ".";
	return [`${hostDir}/bin/support-bundle`];
}

/**
 * Run the support-bundle collector and return its gzip-tar archive as raw bytes.
 *
 * IMPORTANT: stdout here is BINARY (a gzipped tar) — we read it as bytes, NOT
 * text, and we do NOT run redact() on it. redact() operates on text and would
 * corrupt the gzip stream. Redaction is done per-MEMBER inside bin/support-bundle
 * BEFORE the tar is built, so the archive is already secret-free. The collector
 * writes all human/status output to stderr, keeping stdout a clean archive.
 *
 * Rejects if the archive exceeds SUPPORT_BUNDLE_MAX_BYTES (defensive) or the
 * collector exits non-zero.
 */
export async function runSupportBundle(
	opts: { timeoutMs?: number; maxBytes?: number } = {}
): Promise<Uint8Array> {
	const argv = wrapSupportBundleArgv();
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
	const timer = setTimeout(
		() => proc.kill(),
		opts.timeoutMs ?? SUPPORT_BUNDLE_TIMEOUT_MS
	);
	try {
		// Read stdout as bytes (NOT text) — it is a gzip archive.
		// no redact: archive members are redacted pre-tar in bin/support-bundle.
		const bytes = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
		const code = await proc.exited;
		if (code !== 0) {
			const stderr = redact(await new Response(proc.stderr).text());
			throw new Error(`support-bundle exited ${code}: ${stderr.slice(0, 500)}`);
		}
		const cap = opts.maxBytes ?? SUPPORT_BUNDLE_MAX_BYTES;
		if (bytes.byteLength > cap) {
			throw new Error(
				`support bundle is too large (${bytes.byteLength} bytes > ${cap})`
			);
		}
		return bytes;
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Build the argv for the GUI stack update. With a privileged runner (prod):
 * `["sudo","-n",runner,"panel-update"]` — the root wrapper runs `bin/panel
 * update` DETACHED (systemd-run) so the panel's own self-restart at the end of
 * the update cannot kill the updater. Without a runner (dev): spawn the repo
 * bin/panel directly with the single fixed `update` verb (no detach needed in
 * dev — nothing restarts the dev server). ZERO free args ever.
 */
export function wrapPanelUpdateArgv(): string[] {
	const runner = privilegedRunner();
	if (runner) {
		return ["sudo", "-n", runner, "panel-update"];
	}
	const hostDir = process.env.PANEL_HOST_DIR ?? ".";
	return [`${hostDir}/bin/panel`, "update"];
}

/**
 * Stream the GUI stack update as a `{ proc, lines }` job.
 *
 * Why the source is `journalctl -f`, not the updater's own stdout: in prod the
 * detached updater runs as a transient systemd unit (vibe-wp-panel-update) and
 * ITS last step restarts the panel server (us). If we streamed the updater's
 * stdout pipe directly, the panel restart would tear our process group down and
 * the stream would die mid-update with no completion. Instead we kick the
 * detached update off, then follow the transient unit's JOURNAL — those lines
 * survive the panel restart, so once the panel is back the web client can
 * reconnect (operationsStream → or DB-backed operationsGet) and see the result.
 *
 * In dev (no runner) there is no detach + no journal, so we stream bin/panel's
 * own stdout directly (spawnStream of the wrapPanelUpdateArgv argv).
 */
export function streamPanelUpdate(opts: { timeoutMs?: number } = {}) {
	const runner = privilegedRunner();
	const deadline = opts.timeoutMs ?? STREAM_TIMEOUT_MS;
	if (!runner) {
		// Dev: run bin/panel update directly and stream its stdout/stderr.
		return spawnStream(wrapPanelUpdateArgv(), { timeoutMs: deadline });
	}
	// Prod: launch the detached update (fire-and-forget — the wrapper execs
	// systemd-run, which returns once the transient unit is started), then follow
	// the unit's journal so the lines survive the panel's self-restart.
	const launch = Bun.spawn(wrapPanelUpdateArgv(), {
		stdout: "ignore",
		stderr: "ignore",
	});
	// The launch process is fire-and-forget (systemd-run returns immediately once
	// the transient unit starts). Swallow its exit promise so an early failure
	// never surfaces as an unhandled rejection — the journal follow + the job's
	// own exit code are authoritative for success/failure.
	launch.exited.catch(() => {
		// ignored: status is reported via the journalctl stream below.
	});
	return spawnStream(
		[
			"journalctl",
			"--unit=vibe-wp-panel-update.service",
			"--follow",
			"--lines=200",
			"--no-pager",
		],
		{ timeoutMs: deadline }
	);
}

// ---------------------------------------------------------------------------
// Panel custom-domain apply. A SERVER-level op (the panel's Caddy site + origin
// are owned by bin/panel, not a per-site bin/vibe), so it maps to its OWN
// top-level bin/vibe-panel-run subcommand (`panel-domain`), gated on
// PANEL_PRIVILEGED_RUNNER exactly like wrapPanelUpdateArgv. The domain is the only
// caller input — re-validated with the shared strict isPanelHostname() BEFORE the
// spawn (the root wrapper re-validates regardless). It travels as a single argv
// element, NEVER interpolated into a shell string. No VIBE_OPS entry, no opts.env
// injection → no panel_env_keep change.
// ---------------------------------------------------------------------------

/**
 * Build the argv for the panel custom-domain apply. With a privileged runner
 * (prod): `["sudo","-n",runner,"panel-domain",domain]` — the root wrapper
 * re-validates the domain, asserts bin/panel-domain-apply is root-owned, and runs
 * it DETACHED (systemd-run) so the panel's self-restart at the end can't kill it.
 * Without a runner (dev): spawn the repo bin/panel-domain-apply directly.
 *
 * THROWS if the domain fails isPanelHostname — the value lands in a Caddy config
 * file, so an invalid host must never reach the spawn (the wrapper would reject it
 * too, but failing here keeps a bad value off the process table entirely).
 */
export function wrapPanelDomainArgv(domain: string): string[] {
	if (!isPanelHostname(domain)) {
		throw new Error(`Refusing invalid panel domain: ${domain}`);
	}
	const runner = privilegedRunner();
	if (runner) {
		return ["sudo", "-n", runner, "panel-domain", domain];
	}
	const hostDir = process.env.PANEL_HOST_DIR ?? ".";
	return [`${hostDir}/bin/panel-domain-apply`, domain];
}

/** Parsed result of a panel-domain apply (the op prints `status=…` k=v lines). */
export interface PanelDomainRunResult {
	code: number;
	status: "ok" | "pending";
	stdout: string;
}

/**
 * Parse the apply op's k=v stdout into a status. The op prints `status=ok` only
 * when the custom domain already resolves to this host AND answers over HTTPS;
 * otherwise `status=pending` (DNS not pointing yet — the cert issues once it
 * propagates). Anything else (a crash before the status line) is treated as
 * pending so the GUI never claims a false "live".
 */
export function parsePanelDomainStatus(stdout: string): "ok" | "pending" {
	for (const line of stdout.split("\n")) {
		const trimmed = line.trim();
		if (trimmed === "status=ok") {
			return "ok";
		}
		if (trimmed === "status=pending") {
			return "pending";
		}
	}
	return "pending";
}

/**
 * Run the panel custom-domain apply and return its parsed status. Used in DEV
 * (no privileged runner): the op runs in-process and we read its stdout directly.
 *
 * In PROD the op detaches itself (systemd-run) and restarts the panel, so its
 * stdout does NOT come back here — the procedure layer uses a streamed/journal
 * job (streamPanelDomain) instead and the GUI re-reads panelAccess to confirm.
 * The domain is re-validated by wrapPanelDomainArgv before spawning.
 */
export async function runPanelDomain(
	domain: string,
	opts: { timeoutMs?: number } = {}
): Promise<PanelDomainRunResult> {
	const argv = wrapPanelDomainArgv(domain);
	const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
	const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 120_000);
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	clearTimeout(timer);
	const merged = redact(stdout + stderr);
	return { status: parsePanelDomainStatus(merged), stdout: merged, code };
}

/**
 * Stream the panel custom-domain apply as a `{ proc, lines }` job.
 *
 * Mirrors streamPanelUpdate: in prod the apply op detaches (transient
 * vibe-wp-panel-domain unit) and its LAST step restarts the panel server (us). If
 * we streamed the op's own stdout the panel restart would tear our process group
 * down mid-apply. Instead we kick the detached apply off, then follow the
 * transient unit's JOURNAL — those lines survive the panel restart, so once the
 * panel is back the web client reconnects and sees the result. In dev (no runner)
 * there is no detach, so we stream bin/panel-domain-apply's own stdout directly.
 */
export function streamPanelDomain(
	domain: string,
	opts: { timeoutMs?: number } = {}
) {
	// Validate BEFORE building argv (wrapPanelDomainArgv throws on bad input too).
	const argv = wrapPanelDomainArgv(domain);
	const runner = privilegedRunner();
	const deadline = opts.timeoutMs ?? STREAM_TIMEOUT_MS;
	if (!runner) {
		// Dev: run the apply directly and stream its stdout/stderr.
		return spawnStream(argv, { timeoutMs: deadline });
	}
	// Prod: launch the detached apply (fire-and-forget — the wrapper execs
	// systemd-run, which returns once the transient unit starts), then follow the
	// unit's journal so the lines survive the panel's self-restart.
	const launch = Bun.spawn(argv, { stdout: "ignore", stderr: "ignore" });
	launch.exited.catch(() => {
		// ignored: status is reported via the journalctl stream below.
	});
	return spawnStream(
		[
			"journalctl",
			"--unit=vibe-wp-panel-domain.service",
			"--follow",
			"--lines=200",
			"--no-pager",
		],
		{ timeoutMs: deadline }
	);
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
