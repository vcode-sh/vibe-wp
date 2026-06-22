import { STREAM_TIMEOUT_MS } from "./exec";
import { getRealDeps, hasRunningJob, type JobDeps, launchJob } from "./jobs";
import {
	type CoreResponse,
	type InstallerStateLike,
	isProvisionMode,
	type ProgressEvent,
	type ProvisionResult,
	type RunHeadlessOpts,
	runHeadlessRequest,
	runHeadlessRunPlanStream,
} from "./provision";
import { redact } from "./redact";

/** Render TaskResults as redacted job-output lines for the operations tray. */
export function summarizeResults(result: ProvisionResult): string[] {
	if (result.validationErrors.length > 0) {
		return [
			"Validation failed — nothing was executed:",
			...result.validationErrors.map((e) => `  - ${redact(e)}`),
		];
	}
	const lines = result.results.map((r) =>
		redact(`[${r.status}] ${r.id}${r.output ? `: ${r.output}` : ""}`)
	);
	lines.push(result.ok ? "Provision complete." : "Provision failed.");
	return lines;
}

/** Render one human, redacted job-output line for a per-task progress event. */
export function progressLine(event: ProgressEvent): string {
	if (event.phase === "start") {
		return redact(`[running] ${event.name}`);
	}
	const status = event.status ?? "done";
	const detail = event.output ? `: ${event.output.split("\n")[0]}` : "";
	return redact(`[${status}] ${event.name}${detail}`);
}

/**
 * Adapt the LIVE per-task provision stream to the `{ proc, lines }` shape that
 * jobs.ts drains, so a provision is tracked, persisted, and audited exactly like
 * a streamVibe job. validate + plan run one-shot via runHeadlessRequest; on a
 * validation failure we yield summarizeResults and exit 1 (unchanged behavior).
 * Otherwise we drive runHeadlessRunPlanStream and yield ONE human line per
 * progress event (`[running] <name>` on start, `[<status>] <name>` on result),
 * then a final `Provision complete.`/`Provision failed.` line.
 *
 * Cancel parity: aborting `ac` kills the installer child's WHOLE process tree
 * (setsid group kill) AND rejects the in-flight request promptly, so cancelJob
 * actually stops the privileged subprocess instead of letting it run to
 * completion while the UI/DB report "canceled".
 */
export function streamProvision(
	state: InstallerStateLike,
	opts: { apply: boolean } & RunHeadlessOpts
) {
	const ac = new AbortController();
	let exitResolve: (code: number) => void = () => undefined;
	const exited = new Promise<number>((resolve) => {
		exitResolve = resolve;
	});
	async function* lines(): AsyncIterable<string> {
		try {
			yield* drive(state, opts, ac.signal);
			// drive() resolves the exit code via the returned ok flag below.
		} catch (error) {
			if (ac.signal.aborted) {
				yield "Provision canceled.";
			} else {
				yield redact(error instanceof Error ? error.message : String(error));
			}
			exitResolve(1);
			return;
		}
	}
	// drive yields lines AND signals the final exit code through exitResolve.
	async function* drive(
		s: InstallerStateLike,
		o: { apply: boolean } & RunHeadlessOpts,
		signal: AbortSignal
	): AsyncIterable<string> {
		if (!isProvisionMode(s.mode)) {
			throw new Error(`Disallowed provision mode: ${s.mode}`);
		}
		const validateRes = await runHeadlessRequest(
			{ kind: "validate", state: s },
			{ ...o, signal }
		);
		if (validateRes.kind === "validate" && validateRes.errors.length > 0) {
			for (const line of summarizeResults({
				validationErrors: validateRes.errors,
				results: [],
				ok: false,
			})) {
				yield line;
			}
			exitResolve(1);
			return;
		}
		const planRes = await runHeadlessRequest(
			{ kind: "plan", state: s },
			{ ...o, signal }
		);
		if (planRes.kind !== "plan") {
			throw new Error("expected a plan response from the installer core");
		}
		// Live runPlan: forward each progress event as a human line, then finalize.
		const stream = runHeadlessRunPlanStream(planRes.plan, o.apply, {
			...o,
			signal,
		});
		for await (const event of stream.events) {
			yield progressLine(event);
		}
		const final = await stream.result;
		const ok = finalOk(final);
		yield ok ? "Provision complete." : "Provision failed.";
		exitResolve(ok ? 0 : 1);
	}
	const proc = {
		exited,
		kill: () => {
			ac.abort();
			exitResolve(1);
		},
		pid: 0,
	};
	return { proc, lines: lines() };
}

/** A runPlan terminal response is ok only when no executed task failed. */
function finalOk(final: CoreResponse): boolean {
	return (
		final.kind === "runPlan" &&
		final.results.every((r) => r.status !== "failed")
	);
}

/** Input for a one-shot provision job driven through the headless core. */
export interface StartProvisionJobInput {
	action: string;
	apply: boolean;
	kind: string;
	/** Site key for audit/registry — for createSite this is the NEW site's slug. */
	siteId: string;
	state: InstallerStateLike;
	userId: string;
}

/**
 * Start a provision as a one-shot tracked job. Unlike startJob it does NOT
 * require the site to already exist (e.g. createSite provisions a brand-new
 * site), so it skips findSite. Secrets live only in `state`, piped to the
 * installer over stdin by streamProvision — never argv. Reuses launchJob so the
 * provision is persisted + audited + drained identically to a streamVibe job.
 */
export async function startProvisionJob(
	input: StartProvisionJobInput,
	deps?: JobDeps
): Promise<{ jobId: string }> {
	const d = deps ?? (await getRealDeps());
	if (hasRunningJob(input.siteId, input.kind)) {
		throw new Error(
			"An operation of this type is already running for this site."
		);
	}
	return launchJob(
		{
			action: input.action,
			kind: input.kind,
			siteId: input.siteId,
			userId: input.userId,
		},
		() =>
			streamProvision(input.state, {
				apply: input.apply,
				timeoutMs: STREAM_TIMEOUT_MS,
			}),
		d
	);
}
