import { db } from "@control-panel/db";
import { user } from "@control-panel/db/schema/auth";
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

export interface JobsHistoryOptions {
	limit?: number;
	siteId?: string;
}

export interface JobHistoryRow {
	action: string | null;
	actorId: string | null;
	actorName: string | null;
	exitCode: number | null;
	finishedAt: Date | null;
	id: string;
	kind: string;
	siteId: string;
	startedAt: Date;
	status: string;
}

/**
 * Recent persisted jobs enriched with their audit actor. Each job left-joins
 * its audit row (action + actor id) and the actor's display name. A job has at
 * most one audit row (written once at launch in `launchJob`), so the join does
 * not multiply rows. Newest-first, capped at 100. Pass `siteId` to scope to one
 * site; omit it for a server-wide view.
 */
export async function jobsHistory(
	opts: JobsHistoryOptions = {}
): Promise<JobHistoryRow[]> {
	const limit = Math.min(opts.limit ?? 100, 100);
	return await db
		.select({
			id: jobs.id,
			siteId: jobs.siteId,
			kind: jobs.kind,
			status: jobs.status,
			exitCode: jobs.exitCode,
			startedAt: jobs.startedAt,
			finishedAt: jobs.finishedAt,
			action: auditLog.action,
			actorId: auditLog.userId,
			actorName: user.name,
		})
		.from(jobs)
		.leftJoin(auditLog, eq(auditLog.jobId, jobs.id))
		.leftJoin(user, eq(user.id, auditLog.userId))
		.where(opts.siteId ? eq(jobs.siteId, opts.siteId) : undefined)
		.orderBy(desc(jobs.startedAt))
		.limit(limit);
}
