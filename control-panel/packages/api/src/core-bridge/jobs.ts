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

/** Sentinel siteId that resolves to the host-level PANEL_HOST_DIR checkout. */
const SERVER_SITE_ID = "server";

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
export async function getRealDeps(): Promise<JobDeps> {
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

/**
 * How long a finalized job entry stays in the in-memory registry after the
 * job reaches a terminal state. Late SSE reconnects within this window can
 * still read the final status from memory; after it the row is authoritative.
 */
const FINALIZED_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Evict a finalized job from the in-memory maps after the TTL expires. */
function scheduleEviction(jobId: string): void {
	setTimeout(() => {
		registry.delete(jobId);
		finalized.delete(jobId);
	}, FINALIZED_TTL_MS);
}

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
	/** Extra environment variables injected into the spawned process. */
	extraEnv?: Record<string, string>;
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
		scheduleEviction(jobId);
		await deps.persistJobFinish(jobId, job.status, code);
	}
}

/** Metadata shared by every tracked job, regardless of what it spawns. */
export interface JobMeta {
	action: string;
	kind: string;
	siteId: string;
	userId: string;
}

/**
 * Shared launch path for ALL tracked jobs: persist + audit FIRST, then register
 * and drain a pre-built `{ proc, lines }`. Used by streamVibe jobs and one-shot
 * provision jobs so both share the same durability + cancel + drain guarantees.
 */
export async function launchJob(
	meta: JobMeta,
	produce: () => ReturnType<typeof streamVibe>,
	d: JobDeps
): Promise<{ jobId: string }> {
	const jobId = crypto.randomUUID();
	const stream = new LineStream();
	const job: Job = {
		exitCode: null,
		finishedAt: null,
		id: jobId,
		kind: meta.kind,
		siteId: meta.siteId,
		startedAt: new Date().toISOString(),
		status: "running",
	};
	// Persist + audit FIRST — a privileged op must not spawn without a durable record.
	await d.persistJobStart(jobId, meta.kind, meta.siteId);
	await d.writeAudit(meta.userId, meta.action, meta.siteId, jobId);
	// Only now spawn + register + drain.
	const { proc, lines } = produce();
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
			scheduleEviction(jobId);
			try {
				await d.persistJobFinish(jobId, job.status, null);
			} catch {
				// Stream is already ended; swallow DB errors to avoid unhandled rejection.
			}
		}
	});

	return { jobId };
}

export async function startJob(
	input: StartJobInput,
	deps?: JobDeps
): Promise<{ jobId: string }> {
	const d = deps ?? (await getRealDeps());

	// Resolve the working directory. The sentinel siteId "server" maps to the
	// host-level PANEL_HOST_DIR checkout so host ops (e.g. harden) can run
	// without a provisioned site. All other siteIds resolve via findSite.
	let workDir: string;
	if (input.siteId === SERVER_SITE_ID) {
		// "server" is a host-level sentinel reserved for the admin-only harden job;
		// no other op may target the canonical checkout.
		if (input.op !== "harden") {
			throw new Error("Unknown site");
		}
		// Lazy-import env so tests that mock the env module are not broken by a
		// top-level static import.
		const { env } = await import("@control-panel/env/server");
		workDir = env.PANEL_HOST_DIR;
	} else {
		const site = await d.findSite(input.siteId);
		if (!site) {
			throw new Error("Unknown site");
		}
		workDir = site.installDir;
	}

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
			d.streamVibe(workDir, input.env, input.op, {
				args: input.args,
				timeoutMs: STREAM_TIMEOUT_MS,
				env: input.extraEnv,
			}),
		d
	);
}
