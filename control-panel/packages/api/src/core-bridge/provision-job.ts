import { STREAM_TIMEOUT_MS } from "./exec";
import { getRealDeps, hasRunningJob, type JobDeps, launchJob } from "./jobs";
import {
	type InstallerStateLike,
	type ProvisionResult,
	provisionSequence,
	type RunHeadlessOpts,
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

/**
 * Adapt provisionSequence to the `{ proc, lines }` shape that jobs.ts drains, so
 * a provision is tracked, persisted, and audited exactly like a streamVibe job.
 * Because runPlan is single-shot (see provisionSequence), this is a ONE-SHOT
 * job: `lines` yields nothing until the sequence resolves, then emits the
 * redacted TaskResult summary; `proc.exited` resolves to 0 on success or 1 on
 * validation/task failure. `proc.kill()` aborts an in-flight sequence.
 *
 * Live per-task progress is a DEFERRED v2 installer enhancement: it would need
 * the installer's runPlan to emit NDJSON progress to stdout, which this adapter
 * would then forward line by line instead of buffering to a final summary.
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
			const result = await provisionSequence(state, opts);
			for (const line of summarizeResults(result)) {
				yield line;
			}
			exitResolve(result.ok ? 0 : 1);
		} catch (error) {
			if (!ac.signal.aborted) {
				yield redact(error instanceof Error ? error.message : String(error));
			}
			exitResolve(1);
		}
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
