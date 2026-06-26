import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Stores Docker json-file log rotation config. The literal siteId "__global__"
 * is the shared default currently exposed by the panel; site rows keep the
 * schema ready for future per-site overrides without changing the contract.
 */
export const logRotationConfig = sqliteTable("log_rotation_config", {
	siteId: text("site_id").primaryKey(),
	/** Docker json-file max-size, curated by the API (1m..100m). */
	maxSize: text("max_size"),
	/** Docker json-file max-file count, bounded by the API/root writer. */
	maxFile: integer("max_file"),
});
