import { db } from "@control-panel/db";
import { backupVerification } from "@control-panel/db/schema/backup-verification";
import { and, desc, eq, inArray } from "drizzle-orm";

import type { OffsiteVerified } from "../contract";

/** Locations that count as "offsite verified" for the badge. */
const OFFSITE_LOCATIONS = ["offsite", "both"] as const;

/**
 * Upsert a backup-verification outcome. Called from the backup-verify job's
 * terminal hook (see backupsVerify in routers/backups.ts) once the verify job
 * settles, with the backup's REAL listed location resolved at verify-start.
 *
 * The badge therefore only ever reflects an actual successful verify of a copy
 * whose listing location is offsite/both — never a fabricated timestamp. A
 * failed verify writes ok=0, which the badge query ignores (it reads ok=1 only),
 * so a later failure does not erase the "last good" badge unless it overwrites
 * the SAME (site, backup) row — which is correct: that copy is no longer known
 * good.
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
