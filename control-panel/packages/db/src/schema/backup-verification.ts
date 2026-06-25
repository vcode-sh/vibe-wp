import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

/**
 * Records the outcome of a backup-verify job, per (site, backup). This is the
 * HONEST source of truth for the "offsite (R2) backup verified N hours ago"
 * badge: a row exists only after an actual successful backup-verify, and the
 * badge query reads the newest ok row whose location is offsite/both.
 *
 * verifiedAt is a unix-epoch timestamp (ms). location mirrors the `backups`
 * listing location enum. ok is 1 on a passing verification, 0 on failure.
 */
export const backupVerification = sqliteTable(
	"backup_verification",
	{
		siteId: text("site_id").notNull(),
		backupId: text("backup_id").notNull(),
		/** Unix-epoch milliseconds at which the verify finished. */
		verifiedAt: integer("verified_at").notNull(),
		/** "local" | "offsite" | "both" — copied from the backups listing. */
		location: text("location").notNull(),
		/** 1 = verification passed, 0 = failed. */
		ok: integer("ok").notNull(),
	},
	(t) => [primaryKey({ columns: [t.siteId, t.backupId] })]
);
