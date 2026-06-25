import { db } from "@control-panel/db";
import { backupVerification } from "@control-panel/db/schema/backup-verification";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { OffsiteVerified } from "../contract";

/** Locations that count as "offsite verified" for the badge. */
const OFFSITE_LOCATIONS = ["offsite", "both"] as const;

/**
 * Upsert a backup-verification outcome. Called when a backup-verify job
 * finishes for a known backupId + location.
 *
 * TODO(offsite-verified upsert wiring): this is NOT yet called from the verify
 * job-finish path. The existing job machinery (jobs.ts drainJob /
 * persistJobFinish) only receives jobId + status + exitCode, not the backupId or
 * location the job verified. Wiring this honestly requires threading
 * {backupId, location} through the job meta into the finish hook — deferred to a
 * separately-reviewed change so the badge never shows a fabricated timestamp.
 * Until then the badge reads "not yet verified" because no rows are written.
 */
export async function persistBackupVerification(params: {
	siteId: string;
	backupId: string;
	location: "local" | "offsite" | "both";
	ok: boolean;
	verifiedAt?: number;
}): Promise<void> {
	const verifiedAt = params.verifiedAt ?? Date.now();
	await db
		.insert(backupVerification)
		.values({
			siteId: params.siteId,
			backupId: params.backupId,
			location: params.location,
			ok: params.ok ? 1 : 0,
			verifiedAt,
		})
		.onConflictDoUpdate({
			target: [backupVerification.siteId, backupVerification.backupId],
			set: { location: params.location, ok: params.ok ? 1 : 0, verifiedAt },
		});
}

/**
 * Read the newest passing OFFSITE (or both) verification for a site and shape it
 * into the badge payload. Returns all-null when no such row exists (the honest
 * "not yet verified" state).
 */
export async function readOffsiteVerified(
	siteId: string,
	now: number = Date.now()
): Promise<OffsiteVerified> {
	const rows = await db
		.select()
		.from(backupVerification)
		.where(
			and(
				eq(backupVerification.siteId, siteId),
				eq(backupVerification.ok, 1),
				inArray(backupVerification.location, [...OFFSITE_LOCATIONS])
			)
		)
		.orderBy(desc(backupVerification.verifiedAt))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return {
			backupId: null,
			hoursAgo: null,
			lastVerifiedISO: null,
			location: null,
		};
	}
	const hoursAgo = Math.max(
		0,
		Math.floor((now - row.verifiedAt) / (60 * 60 * 1000))
	);
	return {
		backupId: row.backupId,
		hoursAgo,
		lastVerifiedISO: new Date(row.verifiedAt).toISOString(),
		location: row.location as OffsiteVerified["location"],
	};
}
