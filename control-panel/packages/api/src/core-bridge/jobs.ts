import type { Job, StreamEvent } from "../contract";

import {
	STREAM_TIMEOUT_MS,
	streamVibe,
	type VibeEnv,
	type VibeOp,
} from "./exec";
import { persistJobFinish, persistJobStart, writeAudit } from "./jobs-db";
import { LineStream } from "./line-stream";
import { findSite } from "./sites";

interface JobEntry {
	job: Job;
	proc: { kill: () => void };
	stream: LineStream;
}

const registry = new Map<string, JobEntry>();

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

export function cancelJob(jobId: string): void {
	const entry = registry.get(jobId);
	if (!entry) {
		throw new Error("Unknown job");
	}
	entry.job.status = "canceled";
	entry.proc.kill();
}

async function drainJob(
	job: Job,
	stream: LineStream,
	proc: ReturnType<typeof streamVibe>["proc"],
	lines: ReturnType<typeof streamVibe>["lines"],
	jobId: string
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
	await persistJobFinish(jobId, job.status, code);
}

export async function startJob(
	input: StartJobInput
): Promise<{ jobId: string }> {
	const site = await findSite(input.siteId);
	if (!site) {
		throw new Error("Unknown site");
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
	const { proc, lines } = streamVibe(site.installDir, input.env, input.op, {
		args: input.args,
		timeoutMs: STREAM_TIMEOUT_MS,
	});
	registry.set(jobId, { job, proc, stream });
	await persistJobStart(jobId, input.kind, input.siteId);
	await writeAudit(input.userId, input.action, input.siteId, jobId);

	drainJob(job, stream, proc, lines, jobId).catch(async () => {
		// Preserve a cancel even if the drain throws (canceled must stay canceled).
		if (job.status !== "canceled") {
			job.status = "failed";
		}
		job.finishedAt = new Date().toISOString();
		stream.end(job.status);
		await persistJobFinish(jobId, job.status, null);
	});

	return { jobId };
}
