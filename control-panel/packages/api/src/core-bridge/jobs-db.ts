import { db } from "@control-panel/db";
import { user } from "@control-panel/db/schema/auth";
import { auditLog, jobs } from "@control-panel/db/schema/jobs";
import {
	and,
	desc,
	eq,
	inArray,
	isNull,
	lt,
	notInArray,
	or,
	sql,
} from "drizzle-orm";

import type { JobStatus } from "../contract";
import {
	dedupeLaunchAudit,
	type JobHistoryRow,
	type JoinedAuditRow,
} from "./jobs-history-pure";

export type { JobHistoryRow, JoinedAuditRow } from "./jobs-history-pure";

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

/** Statuses that are permanently settled — safe to prune. */
const TERMINAL_STATUSES = [
	"succeeded",
	"failed",
	"canceled",
] as const satisfies JobStatus[];

/**
 * Retention policy for terminal job history:
 *   - age window : keep rows newer than PRUNE_AGE_MS (90 days)
 *   - count cap  : keep at most PRUNE_MAX_ROWS of the most-recent terminal jobs
 *
 * Both limits are applied independently; a row is deleted if it violates
 * either one. Only terminal jobs (succeeded / failed / canceled) are touched —
 * queued and running rows are never deleted here.
 *
 * After pruning jobs the orphaned audit_log rows (whose job_id no longer
 * refers to an existing job, plus any old job-less audit rows beyond the same
 * age window) are also removed.
 *
 * A periodic timer could be wired later (e.g. setInterval at midnight) but a
 * single boot-time call is sufficient for the current deployment model.
 */
const PRUNE_MAX_ROWS = 1000;
const PRUNE_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export async function pruneHistory(): Promise<void> {
	const cutoffDate = new Date(Date.now() - PRUNE_AGE_MS);

	// ── 1. Age-based prune: terminal jobs older than 90 days ────────────────
	await db
		.delete(jobs)
		.where(
			and(
				inArray(jobs.status, [...TERMINAL_STATUSES]),
				lt(jobs.startedAt, cutoffDate)
			)
		);

	// ── 2. Count-based prune: terminal jobs beyond the most-recent 1000 ─────
	// Select the IDs of the oldest terminal jobs that exceed the count cap.
	// Using a subquery with OFFSET is not supported by Drizzle's type layer for
	// deletes, so we fetch the boundary ID set in JS and delete by id list.
	const kept = await db
		.select({ id: jobs.id })
		.from(jobs)
		.where(inArray(jobs.status, [...TERMINAL_STATUSES]))
		.orderBy(desc(jobs.startedAt))
		.limit(PRUNE_MAX_ROWS);

	const keptIds = kept.map((r) => r.id);

	if (keptIds.length === PRUNE_MAX_ROWS) {
		// There are at least 1000 rows — anything not in that list is excess.
		await db
			.delete(jobs)
			.where(
				and(
					inArray(jobs.status, [...TERMINAL_STATUSES]),
					notInArray(jobs.id, keptIds)
				)
			);
	}

	// ── 3. Prune orphaned audit_log rows ────────────────────────────────────
	// Case A: rows that reference a job_id which no longer exists in jobs.
	// Case B: rows with no job_id that are older than the age window.
	// We never delete audit rows for active (queued/running) jobs because
	// reconcileOrphanedJobs() has already run before this function is called,
	// so the only 'running' rows remaining are genuinely live.
	const remainingJobIds = await db.select({ id: jobs.id }).from(jobs);

	const liveIds = remainingJobIds.map((r) => r.id);

	await db.delete(auditLog).where(
		or(
			// Orphaned: points at a job that was just pruned (or never existed)
			and(
				sql`${auditLog.jobId} is not null`,
				liveIds.length > 0 ? notInArray(auditLog.jobId, liveIds) : sql`1`
			),
			// No job link and older than retention window
			and(isNull(auditLog.jobId), lt(auditLog.at, cutoffDate))
		)
	);
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

/**
 * Recent persisted jobs enriched with their LAUNCH audit actor. A job may have
 * several audit rows (launch + later cancel), so the raw left-join multiplies
 * rows; `dedupeLaunchAudit` collapses each job to a single entry that shows the
 * launch actor/action. Newest-first, capped at 100. Pass `siteId` to scope to
 * one site; omit it for a server-wide view.
 */
export async function jobsHistory(
	opts: JobsHistoryOptions = {}
): Promise<JobHistoryRow[]> {
	const limit = Math.min(opts.limit ?? 100, 100);
	const rows: JoinedAuditRow[] = await db
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
			auditAt: auditLog.at,
		})
		.from(jobs)
		.leftJoin(auditLog, eq(auditLog.jobId, jobs.id))
		.leftJoin(user, eq(user.id, auditLog.userId))
		.where(opts.siteId ? eq(jobs.siteId, opts.siteId) : undefined)
		.orderBy(desc(jobs.startedAt))
		.limit(limit);
	return dedupeLaunchAudit(rows);
}
