import { db } from "@control-panel/db";
import { auditLog, jobs } from "@control-panel/db/schema/jobs";
import { desc, eq } from "drizzle-orm";

import type { JobStatus } from "../contract";

/**
 * Called once at server startup. Any job row still marked 'running' was left
 * mid-flight by a previous process — the SSE stream is gone and the process
 * is dead. Flip those rows to 'failed' so the UI does not show phantom active
 * jobs indefinitely.
 */
export async function reconcileOrphanedJobs(): Promise<void> {
	await db
		.update(jobs)
		.set({
			status: "failed" satisfies JobStatus,
			exitCode: null,
			finishedAt: new Date(),
		})
		.where(eq(jobs.status, "running"));
}

export async function persistJobStart(
	jobId: string,
	kind: string,
	siteId: string
): Promise<void> {
	await db.insert(jobs).values({
		id: jobId,
		kind,
		siteId,
		status: "running" satisfies JobStatus,
	});
}

export async function persistJobFinish(
	jobId: string,
	status: JobStatus,
	exitCode: number | null
): Promise<void> {
	await db
		.update(jobs)
		.set({
			status,
			exitCode,
			finishedAt: new Date(),
		})
		.where(eq(jobs.id, jobId));
}

export async function writeAudit(
	userId: string,
	action: string,
	siteId: string | null,
	jobId: string | null
): Promise<void> {
	await db
		.insert(auditLog)
		.values({ id: crypto.randomUUID(), userId, action, siteId, jobId });
}

export function recentAudit(siteId: string, limit = 8) {
	return db
		.select()
		.from(auditLog)
		.where(eq(auditLog.siteId, siteId))
		.orderBy(desc(auditLog.at))
		.limit(limit);
}
