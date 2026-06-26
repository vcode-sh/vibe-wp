import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const nowMs = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;

/**
 * Durable history of monitor snapshots, one row per recorded sample. Rows are
 * derived from a `monitor --json` result (parseMonitorJson) at record time —
 * see core-bridge/monitor-history.ts. The collection logic itself is unchanged;
 * this table only persists what the monitor op already reports plus a few fields
 * extracted from the existing check-name strings (cert days / http status), and
 * a DERIVED/approximate `dnsOk` (see monitor-history-pure.ts for the caveat).
 *
 * Mirrors the jobs.ts conventions: text PK (crypto.randomUUID), snake_case
 * columns, integer timestamp_ms with a `nowMs` default. Pruned at boot by
 * pruneMonitorSamples() alongside pruneHistory().
 */
export const monitorSamples = sqliteTable("monitor_samples", {
	id: text("id").primaryKey(),
	siteId: text("site_id").notNull(),
	ts: integer("ts", { mode: "timestamp_ms" }).default(nowMs).notNull(),
	/** Overall monitor verdict for this sample: ok | warn | fail. */
	status: text("status").notNull(),
	/** 1 when the site was reachable (HTTP uptime check passed), else 0. */
	up: integer("up").notNull(),
	/** Last HTTP status code parsed from the HTTP-uptime check name, or null. */
	httpStatus: integer("http_status"),
	/** TLS days-to-expiry parsed from the cert check name (negative = expired). */
	certDaysLeft: integer("cert_days_left"),
	/** Approximate DNS-ok flag (0/1) — derived from HTTP reachability today. */
	dnsOk: integer("dns_ok"),
	/** Failing check count for this sample. */
	failures: integer("failures").notNull(),
	/** Warning check count for this sample. */
	warnings: integer("warnings").notNull(),
	/** Original monitor check names, kept so overview can reuse fresh samples. */
	checksJson: text("checks_json"),
});
