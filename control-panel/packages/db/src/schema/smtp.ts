import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Stores SMTP relay configuration per site.
 * All columns except siteId are nullable — absent = not configured.
 * The `password` column is write-only: it must never be returned by the API.
 */
export const smtpConfig = sqliteTable("smtp_config", {
	siteId: text("site_id").primaryKey(),
	/** off | relay | log */
	mode: text("mode"),
	host: text("host"),
	port: integer("port"),
	/** starttls | tls | none */
	secure: text("secure"),
	/** on | off */
	auth: text("auth"),
	username: text("username"),
	/** Write-only: never returned by the API. */
	password: text("password"),
	fromAddress: text("from_address"),
	fromName: text("from_name"),
});
