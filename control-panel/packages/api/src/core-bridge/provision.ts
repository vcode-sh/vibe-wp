import { redact } from "./redact";

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
	/** Test seam: spawn implementation (defaults to Bun.spawn). */
	spawn?: SpawnFn;
	timeoutMs?: number;
}

/** Minimal child shape the bridge needs — satisfied by Bun.spawn's return. */
interface SpawnedChild {
	exited: Promise<number>;
	kill: (signal?: number) => void;
	stderr: ReadableStream<Uint8Array>;
	stdin: { write: (data: string) => void; end: () => void } | null;
	stdout: ReadableStream<Uint8Array>;
}
export type SpawnFn = (argv: string[]) => SpawnedChild;

const DEFAULT_HEADLESS_TIMEOUT_MS = 30 * 60 * 1000;

function defaultSpawn(argv: string[]): SpawnedChild {
	return Bun.spawn(argv, {
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
	const spawn = opts.spawn ?? defaultSpawn;
	const child = spawn(argv);
	const timer = setTimeout(
		() => child.kill(),
		opts.timeoutMs ?? DEFAULT_HEADLESS_TIMEOUT_MS
	);
	// The request (with secrets) goes to STDIN only — never argv.
	child.stdin?.write(JSON.stringify(request));
	child.stdin?.end();
	const [stdout, stderr, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	clearTimeout(timer);
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
