import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

export const jobs = sqliteTable("jobs", {
	id: text("id").primaryKey(),
	kind: text("kind").notNull(),
	siteId: text("site_id").notNull(),
	status: text("status").notNull(),
	exitCode: integer("exit_code"),
	startedAt: integer("started_at", { mode: "timestamp_ms" })
		.default(nowMs)
		.notNull(),
	finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
});

export const auditLog = sqliteTable("audit_log", {
	id: text("id").primaryKey(),
	userId: text("user_id").notNull(),
	action: text("action").notNull(),
	siteId: text("site_id"),
	jobId: text("job_id"),
	at: integer("at", { mode: "timestamp_ms" }).default(nowMs).notNull(),
});
