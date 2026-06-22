import type { Job, StreamEvent } from "../contract";

import {
	STREAM_TIMEOUT_MS,
	streamVibe,
	type VibeEnv,
	type VibeOp,
} from "./exec";
import type { persistJobFinish, persistJobStart, writeAudit } from "./jobs-db";
import { LineStream } from "./line-stream";
import type { DetectedSite } from "./sites";

interface JobEntry {
	job: Job;
	proc: { kill: () => void };
	stream: LineStream;
}

/** Injection points used by tests — real callers never pass this. */
export interface JobDeps {
	findSite: (id: string) => Promise<DetectedSite | null>;
	persistJobFinish: typeof persistJobFinish;
	persistJobStart: typeof persistJobStart;
	streamVibe: typeof streamVibe;
	writeAudit: typeof writeAudit;
}

/**
 * Lazily resolved real deps — deferred so the DB/env modules are not imported
 * at module load time (which lets tests import jobs.ts without a live DB).
 */
async function getRealDeps(): Promise<JobDeps> {
	const [{ findSite }, { persistJobFinish, persistJobStart, writeAudit }] =
		await Promise.all([import("./sites"), import("./jobs-db")]);
	return {
		findSite,
		persistJobFinish,
		persistJobStart,
		streamVibe,
		writeAudit,
	};
}

/** Tracks jobs for which the terminal DB row has already been written. */
const finalized = new Set<string>();

const registry = new Map<string, JobEntry>();

export function hasRunningJob(siteId: string, kind: string): boolean {
	for (const entry of registry.values()) {
		if (
			entry.job.status === "running" &&
			entry.job.siteId === siteId &&
			entry.job.kind === kind
		) {
			return true;
		}
	}
	return false;
}

export interface StartJobInput {
	action: string;
	args?: string[];
	env: VibeEnv;
	kind: string;
	op: VibeOp;
	siteId: string;
	userId: string;
}

export function getJob(jobId: string): Job | null {
	return registry.get(jobId)?.job ?? null;
}

export function streamJob(jobId: string): AsyncIterable<StreamEvent> {
	const entry = registry.get(jobId);
	if (!entry) {
		throw new Error("Unknown job");
	}
	return entry.stream.subscribe();
}

/**
 * Cancels an in-flight job. Returns true if the job was running and the cancel
 * took effect; returns false if the job is already in a terminal state (the
 * persisted row remains authoritative in that case).
 */
export function cancelJob(jobId: string): boolean {
	const entry = registry.get(jobId);
	if (!entry) {
		throw new Error("Unknown job");
	}
	if (entry.job.status !== "running") {
		return false;
	}
	entry.job.status = "canceled";
	entry.proc.kill();
	return true;
}

async function drainJob(
	job: Job,
	stream: LineStream,
	proc: ReturnType<typeof streamVibe>["proc"],
	lines: ReturnType<typeof streamVibe>["lines"],
	jobId: string,
	deps: JobDeps
): Promise<void> {
	for await (const line of lines) {
		stream.push(line);
	}
	const code = await proc.exited;
	job.exitCode = code;
	if (job.status !== "canceled") {
		job.status = code === 0 ? "succeeded" : "failed";
	}
	job.finishedAt = new Date().toISOString();
	stream.end(job.status);
	if (!finalized.has(jobId)) {
		finalized.add(jobId);
		await deps.persistJobFinish(jobId, job.status, code);
	}
}

export async function startJob(
	input: StartJobInput,
	deps?: JobDeps
): Promise<{ jobId: string }> {
	const d = deps ?? (await getRealDeps());
	const site = await d.findSite(input.siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	if (hasRunningJob(input.siteId, input.kind)) {
		throw new Error(
			"An operation of this type is already running for this site."
		);
	}
	const jobId = crypto.randomUUID();
	const stream = new LineStream();
	const job: Job = {
		exitCode: null,
		finishedAt: null,
		id: jobId,
		kind: input.kind,
		siteId: input.siteId,
		startedAt: new Date().toISOString(),
		status: "running",
	};
	// Persist + audit FIRST — a privileged op must not spawn without a durable record.
	await d.persistJobStart(jobId, input.kind, input.siteId);
	await d.writeAudit(input.userId, input.action, input.siteId, jobId);
	// Only now spawn + register + drain.
	const { proc, lines } = d.streamVibe(site.installDir, input.env, input.op, {
		args: input.args,
		timeoutMs: STREAM_TIMEOUT_MS,
	});
	registry.set(jobId, { job, proc, stream });

	drainJob(job, stream, proc, lines, jobId, d).catch(async () => {
		// Preserve a cancel even if the drain throws (canceled must stay canceled).
		if (job.status !== "canceled") {
			job.status = "failed";
		}
		job.finishedAt = new Date().toISOString();
		stream.end(job.status);
		if (!finalized.has(jobId)) {
			finalized.add(jobId);
			try {
				await d.persistJobFinish(jobId, job.status, null);
			} catch {
				// Stream is already ended; swallow DB errors to avoid unhandled rejection.
			}
		}
	});

	return { jobId };
}
