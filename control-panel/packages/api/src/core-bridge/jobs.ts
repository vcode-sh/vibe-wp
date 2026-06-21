import type { Job, StreamEvent } from "../contract";

import { streamVibe } from "./exec";
import { LineStream } from "./line-stream";
import { findSite } from "./sites";

interface JobEntry {
	job: Job;
	stream: LineStream;
}

const registry = new Map<string, JobEntry>();

async function runJob(
	job: Job,
	stream: LineStream,
	installDir: string
): Promise<void> {
	const { proc, lines } = streamVibe(installDir, "prod", "backup");
	for await (const line of lines) {
		stream.push(line);
	}
	const code = await proc.exited;
	job.exitCode = code;
	job.status = code === 0 ? "succeeded" : "failed";
	job.finishedAt = new Date().toISOString();
	stream.end(job.status);
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

export async function startBackupJob(
	siteId: string
): Promise<{ jobId: string }> {
	const site = await findSite(siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	const jobId = crypto.randomUUID();
	const stream = new LineStream();
	const job: Job = {
		id: jobId,
		kind: "backup",
		siteId,
		status: "running",
		startedAt: new Date().toISOString(),
		finishedAt: null,
		exitCode: null,
	};
	registry.set(jobId, { job, stream });
	runJob(job, stream, site.installDir).catch(() => {
		job.status = "failed";
		job.finishedAt = new Date().toISOString();
		stream.end("failed");
	});
	return { jobId };
}
