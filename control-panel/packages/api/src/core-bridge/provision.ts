import { redact } from "./redact";
import { mergeLineStreams } from "./stream-merge";

/**
 * Provisioning bridge — the panel's allowlisted seam onto the installer's
 * headless brain. The panel NEVER reimplements provisioning logic; it drives
 * the compiled installer binary via `[installerBin, "--headless-json"]`, which
 * reads ONE CoreRequest JSON from STDIN and writes ONE CoreResponse JSON to
 * stdout (installer/src/cli/headless-cli.ts -> core/headless.ts runHeadless).
 * One request per spawn.
 *
 * SECRET SAFETY (verified against installer/src/core/headless.ts on 2026-06-22):
 *   - argv is ALWAYS exactly [bin, "--headless-json"] — never any state, plan,
 *     or password. assertArgvSecretFree() enforces it.
 *   - All inputs (admin/DB/Redis passwords, R2 secret, the whole InstallerState,
 *     and the resulting plan with generated secrets) travel on STDIN as JSON.
 *     STDIN is invisible to `ps`, so no secret can leak into the process table.
 */

/** Allowlisted install modes the bridge will drive (installer InstallMode). */
export const MODES = [
	"new-site",
	"external-services",
	"staging-only",
	"remove-existing",
	"update-existing",
] as const;

export type ProvisionMode = (typeof MODES)[number];

export function isProvisionMode(mode: string): mode is ProvisionMode {
	return (MODES as readonly string[]).includes(mode);
}

/**
 * The installer's InstallerState (installer/src/core/types.ts) is large; the
 * bridge treats it as an opaque, JSON-serializable bag that MUST carry a valid
 * `mode`. The router (5b) owns building the full, validated shape. Staying
 * structural avoids a fragile cross-tree type import.
 */
export type InstallerStateLike = { mode: string } & Record<string, unknown>;

/**
 * CoreRequest / CoreResponse mirror installer/src/core/headless.ts. `plan`,
 * `state`, and `results` are opaque: forwarded verbatim, never inspected.
 */
export type CoreRequest =
	| { kind: "detect" }
	| { kind: "baseState"; domain?: string; mode?: ProvisionMode }
	| { kind: "validate"; state: InstallerStateLike }
	| { kind: "plan"; state: InstallerStateLike; redact?: boolean }
	| { kind: "operations"; hasStaging?: boolean }
	| { kind: "runPlan"; plan: unknown; apply: boolean }
	| {
			kind: "runOperation";
			operationId: string;
			state: InstallerStateLike;
			apply: boolean;
	  };

export interface TaskResultLike {
	code: number;
	id: string;
	output: string;
	status: "pending" | "running" | "done" | "failed" | "skipped";
}

export type CoreResponse =
	| { kind: "detect"; host: unknown }
	| { kind: "baseState"; state: InstallerStateLike }
	| { kind: "validate"; errors: string[] }
	| { kind: "plan"; plan: unknown }
	| { kind: "operations"; operations: unknown[] }
	| { kind: "runPlan"; results: TaskResultLike[] }
	| { kind: "runOperation"; result: TaskResultLike }
	| { kind: "error"; message: string };

/** Default installer binary path. Mirrors PANEL_INSTALLER_BIN in packages/env. */
const DEFAULT_INSTALLER_BIN = "/opt/vibe-wp-panel/bin/vibe-wp-installer";

/** Resolve the installer binary path from env (default under the panel dir). */
export function installerBin(): string {
	const fromEnv = process.env.PANEL_INSTALLER_BIN;
	return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_INSTALLER_BIN;
}

/** The only argv the bridge ever spawns. Pure + exported for tests. */
export function headlessArgv(bin: string = installerBin()): string[] {
	return [bin, "--headless-json"];
}

/**
 * Defence in depth: the spawned argv must be exactly [bin, "--headless-json"].
 * Anything else (e.g. a state value smuggled into argv) is a bug — throw.
 */
export function assertArgvSecretFree(argv: string[]): void {
	if (argv.length !== 2 || argv[1] !== "--headless-json") {
		throw new Error("provision argv must be exactly [bin, --headless-json]");
	}
}

export interface RunHeadlessOpts {
	bin?: string;
	/**
	 * Cancellation. When this signal aborts, the spawned installer child's whole
	 * process tree is killed and the in-flight request rejects promptly — so a
	 * user cancel actually stops the privileged subprocess instead of letting it
	 * run to completion while the UI/DB report "canceled".
	 */
	signal?: AbortSignal;
	/** Test seam: spawn implementation (defaults to Bun.spawn). */
	spawn?: SpawnFn;
	timeoutMs?: number;
}

/** Minimal child shape the bridge needs — satisfied by Bun.spawn's return. */
interface SpawnedChild {
	exited: Promise<number>;
	kill: (signal?: number) => void;
	/** Present for real spawns; used to kill the whole process group on Linux. */
	pid?: number;
	stderr: ReadableStream<Uint8Array>;
	stdin: { write: (data: string) => void; end: () => void } | null;
	stdout: ReadableStream<Uint8Array>;
}
export type SpawnFn = (argv: string[]) => SpawnedChild;

/**
 * Tear down the installer child's WHOLE process tree, matching exec.ts's
 * spawnStream: defaultSpawn launches under `setsid` on Linux so the child leads
 * its own session/group (pgid == pid). A group kill (process.kill(-pid)) then
 * reaps the wrapper (sudo -n / setsid), the installer, and any docker/wp
 * grandchildren in one shot instead of orphaning them. Falls back to the plain
 * child.kill() off Linux or when the pid is unavailable (e.g. test seams).
 */
function killChildTree(child: SpawnedChild): void {
	if (process.platform === "linux" && child.pid && child.pid > 1) {
		try {
			process.kill(-child.pid, "SIGTERM");
			return;
		} catch {
			// Group already gone — fall through to a direct kill.
		}
	}
	child.kill();
}

const DEFAULT_HEADLESS_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Privilege boundary for provisioning. When PANEL_PRIVILEGED_RUNNER is set the
 * panel runs unprivileged and the installer must be launched through the
 * root-owned, sudoers-gated wrapper, which only accepts the literal
 * `installer --headless-json` subcommand. The CANONICAL argv stays
 * `[bin, "--headless-json"]` (so assertArgvSecretFree's secret-free invariant is
 * unchanged); we only rewrite the *spawn* argv to the privileged form at the
 * last moment. Secrets still travel exclusively on STDIN — never argv. When the
 * runner is unset (dev/local) the argv spawns directly, exactly as before.
 */
function spawnArgvFor(canonical: string[]): string[] {
	const runner = process.env.PANEL_PRIVILEGED_RUNNER;
	if (runner && runner.length > 0) {
		return ["sudo", "-n", runner, "installer", "--headless-json"];
	}
	return canonical;
}

function defaultSpawn(argv: string[]): SpawnedChild {
	const spawnArgv = spawnArgvFor(argv);
	// On Linux, lead a new session/group so killChildTree can reap the whole tree
	// (the installer plus any docker/wp grandchildren) with one group signal —
	// the same setsid kill-group contract exec.ts uses for streamVibe.
	const onLinux = process.platform === "linux";
	return Bun.spawn(onLinux ? ["setsid", ...spawnArgv] : spawnArgv, {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	}) as unknown as SpawnedChild;
}

/**
 * Spawn `[bin, --headless-json]`, write ONE CoreRequest to stdin, read ONE
 * CoreResponse from stdout, JSON.parse it, and return it. Non-zero exit, parse
 * failure, or an explicit {kind:"error"} all throw (with stderr redacted).
 */
export async function runHeadlessRequest(
	request: CoreRequest,
	opts: RunHeadlessOpts = {}
): Promise<CoreResponse> {
	const argv = headlessArgv(opts.bin);
	assertArgvSecretFree(argv);
	if (opts.signal?.aborted) {
		throw new Error("provision canceled");
	}
	const spawn = opts.spawn ?? defaultSpawn;
	const child = spawn(argv);
	const timer = setTimeout(
		() => killChildTree(child),
		opts.timeoutMs ?? DEFAULT_HEADLESS_TIMEOUT_MS
	);
	// When the caller cancels, kill the child's whole process tree AND reject the
	// await promptly (below) so the job finalizes now instead of blocking on the
	// drain until the privileged subprocess finally exits on its own.
	let abortReject: ((reason: Error) => void) | undefined;
	const onAbort = () => {
		killChildTree(child);
		abortReject?.(new Error("provision canceled"));
	};
	if (opts.signal) {
		opts.signal.addEventListener("abort", onAbort, { once: true });
	}
	// The request (with secrets) goes to STDIN only — never argv.
	child.stdin?.write(JSON.stringify(request));
	child.stdin?.end();
	const body = Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	let stdout: string;
	let stderr: string;
	let code: number;
	try {
		const aborted = new Promise<never>((_resolve, reject) => {
			abortReject = reject;
		});
		[stdout, stderr, code] = await (opts.signal
			? Promise.race([body, aborted])
			: body);
	} finally {
		clearTimeout(timer);
		opts.signal?.removeEventListener("abort", onAbort);
	}
	if (code !== 0) {
		throw new Error(
			`installer headless exited ${code}: ${redact(stderr).trim()}`
		);
	}
	let parsed: CoreResponse;
	try {
		parsed = JSON.parse(stdout) as CoreResponse;
	} catch {
		throw new Error(
			`installer headless returned non-JSON: ${redact(stdout).slice(0, 200)}`
		);
	}
	if (parsed.kind === "error") {
		throw new Error(`installer headless error: ${parsed.message}`);
	}
	return parsed;
}

/**
 * One live per-task progress record, mirroring installer ProgressEvent
 * (installer/src/core/types.ts). Emitted as a single NDJSON line by the
 * installer's runPlan stream; forwarded verbatim, never inspected for secrets
 * (mergeLineStreams already redacts every line before we parse it).
 */
export interface ProgressEvent {
	index: number;
	kind: "progress";
	name: string;
	output?: string;
	phase: "start" | "result";
	status?: TaskResultLike["status"];
	taskId: string;
	total: number;
}

/** Streamed runPlan: live progress events plus the resolved terminal response. */
export interface RunPlanStream {
	/** Progress events as the installer emits them (one per task start/result). */
	events: AsyncGenerator<ProgressEvent>;
	/** Resolves with the terminal CoreResponse (kind "runPlan" or "error"). */
	result: Promise<CoreResponse>;
}

/**
 * Streaming sibling of runHeadlessRequest for the runPlan kind ONLY. Spawns the
 * SAME `[bin, --headless-json]` through spawnArgvFor/defaultSpawn (setsid on
 * Linux) so killChildTree reaps the whole tree; writes the runPlan CoreRequest
 * (carrying generated secrets) to STDIN — never argv; reads STDOUT incrementally
 * through mergeLineStreams (which redacts each line). Each `{kind:"progress"}`
 * line is yielded as an event; the terminal `{kind:"runPlan"|"error"}` line
 * resolves `result`. Unparseable lines are ignored. On abort, killChildTree +
 * reject promptly — mirroring runHeadlessRequest's cancel parity.
 * runHeadlessRequest itself is untouched (buffered one-shot for all other kinds).
 */
export function runHeadlessRunPlanStream(
	plan: unknown,
	apply: boolean,
	opts: RunHeadlessOpts = {}
): RunPlanStream {
	const argv = headlessArgv(opts.bin);
	assertArgvSecretFree(argv);
	const spawn = opts.spawn ?? defaultSpawn;
	let resolveResult: (r: CoreResponse) => void = () => undefined;
	let rejectResult: (e: Error) => void = () => undefined;
	const result = new Promise<CoreResponse>((res, rej) => {
		resolveResult = res;
		rejectResult = rej;
	});

	async function* events(): AsyncGenerator<ProgressEvent> {
		if (opts.signal?.aborted) {
			rejectResult(new Error("provision canceled"));
			throw new Error("provision canceled");
		}
		const child = spawn(argv);
		const timer = setTimeout(
			() => killChildTree(child),
			opts.timeoutMs ?? DEFAULT_HEADLESS_TIMEOUT_MS
		);
		// On abort: kill the child's whole tree AND resolve the stop promise so the
		// merge unblocks NOW even if the child's streams never close on their own
		// (mirrors runHeadlessRequest rejecting promptly instead of awaiting exit).
		let resolveAbort: () => void = () => undefined;
		const aborted = new Promise<void>((r) => {
			resolveAbort = r;
		});
		const onAbort = () => {
			killChildTree(child);
			resolveAbort();
		};
		opts.signal?.addEventListener("abort", onAbort, { once: true });
		// Secrets travel on STDIN only — never argv.
		child.stdin?.write(JSON.stringify({ kind: "runPlan", plan, apply }));
		child.stdin?.end();
		// Force the merge closed shortly after exit so a wedged grandchild can't keep
		// the stream open forever (same grace contract as exec.ts spawnStream), OR
		// immediately on abort so a cancel finalizes promptly.
		const stopSignal = Promise.race([
			child.exited.then(() => new Promise((r) => setTimeout(r, 1500))),
			aborted,
		]);
		let terminal: CoreResponse | null = null;
		try {
			for await (const line of mergeLineStreams(
				[child.stdout, child.stderr],
				redact,
				stopSignal
			)) {
				if (opts.signal?.aborted) {
					break;
				}
				const parsed = tryParseLine(line.trim());
				if (!parsed) {
					continue; // ignore blank/non-JSON noise (e.g. stderr warnings)
				}
				if (parsed.kind === "progress") {
					yield parsed;
				} else {
					terminal = parsed; // terminal runPlan/error line
				}
			}
		} finally {
			clearTimeout(timer);
			opts.signal?.removeEventListener("abort", onAbort);
		}
		if (opts.signal?.aborted) {
			rejectResult(new Error("provision canceled"));
			return;
		}
		if (terminal) {
			resolveResult(terminal);
			return;
		}
		const code = await child.exited;
		rejectResult(
			new Error(
				`installer headless stream ended without a result (exit ${code})`
			)
		);
	}

	return { events: events(), result };
}

/** Parse one stream line into a ProgressEvent or terminal CoreResponse. */
function tryParseLine(line: string): ProgressEvent | CoreResponse | null {
	try {
		return JSON.parse(line) as ProgressEvent | CoreResponse;
	} catch {
		return null;
	}
}

export interface ProvisionResult {
	/** True when every executed task succeeded and validation passed. */
	ok: boolean;
	/** runPlan TaskResults — empty when validation failed (no execution). */
	results: TaskResultLike[];
	validationErrors: string[];
}

/**
 * Run a full provision against the headless core, one spawn per step:
 *   1. validate(state)  -> stop and return errors if any (no execution)
 *   2. plan(state)      -> obtain the install plan (carries generated secrets)
 *   3. runPlan(plan, apply) -> EXECUTE; stop on the first failed task
 *
 * Secrets only ever travel inside the piped STDIN JSON of each spawn.
 *
 * NOTE: runPlan is single-shot — the installer's runPlan returns TaskResult[]
 * at the end and does NOT emit per-task progress to stdout. True per-task LIVE
 * streaming is a deferred v2 installer enhancement (it would require runPlan to
 * emit NDJSON progress to stdout, which the bridge would then forward line by
 * line). Do not assume live progress here.
 */
export async function provisionSequence(
	state: InstallerStateLike,
	opts: { apply: boolean } & RunHeadlessOpts
): Promise<ProvisionResult> {
	if (!isProvisionMode(state.mode)) {
		throw new Error(`Disallowed provision mode: ${state.mode}`);
	}
	const validateRes = await runHeadlessRequest(
		{ kind: "validate", state },
		opts
	);
	if (validateRes.kind === "validate" && validateRes.errors.length > 0) {
		return { validationErrors: validateRes.errors, results: [], ok: false };
	}
	const planRes = await runHeadlessRequest({ kind: "plan", state }, opts);
	if (planRes.kind !== "plan") {
		throw new Error("expected a plan response from the installer core");
	}
	const runRes = await runHeadlessRequest(
		{ kind: "runPlan", plan: planRes.plan, apply: opts.apply },
		opts
	);
	if (runRes.kind !== "runPlan") {
		throw new Error("expected a runPlan response from the installer core");
	}
	const ok = runRes.results.every((r) => r.status !== "failed");
	return { validationErrors: [], results: runRes.results, ok };
}
