import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * Latest expensive overview snapshot per site. The UI reads this table instead
 * of spawning host probes on every page load; background refreshers keep it
 * current and operation-finish events trigger immediate refreshes.
 */
export const siteOverviewCache = sqliteTable("site_overview_cache", {
	siteId: text("site_id").primaryKey(),
	payload: text("payload").notNull(),
	refreshedAt: integer("refreshed_at", { mode: "timestamp_ms" })
		.default(nowMs)
		.notNull(),
});
