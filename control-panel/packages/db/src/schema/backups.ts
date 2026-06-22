import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Stores R2 backup config per site (or the shared global defaults row).
 * The literal siteId "__global__" holds shared default credentials.
 * All credential + preference columns are nullable — absent = inherit from global.
 */
export const backupConfig = sqliteTable("backup_config", {
	siteId: text("site_id").primaryKey(),
	provider: text("provider"),
	endpoint: text("endpoint"),
	accessKeyId: text("access_key_id"),
	/** Write-only: never returned by the API. */
	secret: text("secret"),
	bucket: text("bucket"),
	prefix: text("prefix"),
	/** 1 = enabled, 0 = disabled, null = inherit from global. */
	enabled: integer("enabled"),
	/** Days of local backups to keep. */
	retention: integer("retention"),
});
