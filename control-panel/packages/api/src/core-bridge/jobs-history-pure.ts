/**
 * Pure (DB-free) helpers for the operations/job-history view.
 * Imported by both jobs-db.ts (DB layer) and tests — no db/env imports here.
 */

/** One deduped history entry: a job plus its LAUNCH audit actor. */
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
 * One raw joined row: a job plus (optionally) one of its audit rows. A job can
 * have MORE THAN ONE audit row — `launchJob` writes the launch row, and a later
 * cancel (operationsCancel) writes a second "cancel" row against the same jobId.
 * The left-join therefore yields one of these per audit row, so callers must
 * dedupe down to one entry per job.
 */
export interface JoinedAuditRow extends JobHistoryRow {
	/** Audit row timestamp; used to pick the launch (earliest) row. Null = no audit row. */
	auditAt: Date | null;
}

/**
 * Collapse the multi-row left-join down to exactly one entry per job, keeping
 * the LAUNCH audit row (the earliest `auditAt`). The launch row is written by
 * `launchJob` before the job spawns; any later rows (e.g. "cancel") have a
 * strictly larger `auditAt`, so MIN(auditAt) deterministically selects the
 * launch actor + action. The job's CURRENT status still comes from the jobs
 * row, so canceled jobs keep their canceled status while showing the launcher.
 * Input order is preserved for the first occurrence of each job, so an upstream
 * `ORDER BY jobs.startedAt DESC` stays newest-first.
 */
export function dedupeLaunchAudit(rows: JoinedAuditRow[]): JobHistoryRow[] {
	const byJob = new Map<string, JoinedAuditRow>();
	for (const row of rows) {
		const existing = byJob.get(row.id);
		if (!existing) {
			byJob.set(row.id, row);
			continue;
		}
		// Prefer the earlier audit row (the launch row). A row with no audit
		// timestamp never displaces one that has one.
		const existingAt = existing.auditAt?.getTime() ?? Number.POSITIVE_INFINITY;
		const candidateAt = row.auditAt?.getTime() ?? Number.POSITIVE_INFINITY;
		if (candidateAt < existingAt) {
			byJob.set(row.id, row);
		}
	}
	return [...byJob.values()].map((r) => ({
		action: r.action,
		actorId: r.actorId,
		actorName: r.actorName,
		exitCode: r.exitCode,
		finishedAt: r.finishedAt,
		id: r.id,
		kind: r.kind,
		siteId: r.siteId,
		startedAt: r.startedAt,
		status: r.status,
	}));
}
