import { db } from "@control-panel/db";
import { monitorSamples } from "@control-panel/db/schema/monitoring";
import { and, desc, eq, gte, lt } from "drizzle-orm";

import { runVibe } from "./exec";
import {
	extractSampleFields,
	type MonitorParsed,
	sinceCutoffMs,
} from "./monitor-history-pure";
import { parseMonitorJson } from "./parse";

export type { MonitorParsed } from "./monitor-history-pure";

/** A persisted monitor sample row, as returned to the router. */
export interface MonitorSampleRow {
	certDaysLeft: number | null;
	dnsOk: number | null;
	failures: number;
	httpStatus: number | null;
	id: string;
	siteId: string;
	status: string;
	ts: Date;
	up: number;
	warnings: number;
}

/** Hard cap on the number of history rows returned by a single query. */
const HISTORY_MAX_ROWS = 2000;

/** Retention window for monitor samples (90 days), pruned at boot. */
const PRUNE_AGE_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Insert one monitor sample derived from a parseMonitorJson result. Pure field
 * extraction lives in monitor-history-pure.ts; this only adds the id + ts and
 * writes the row. Returns the persisted (derived) fields for the caller's tile.
 */
export async function recordMonitorSample(
	siteId: string,
	parsed: MonitorParsed
): Promise<MonitorSampleRow> {
	const fields = extractSampleFields(parsed);
	const row = {
		id: crypto.randomUUID(),
		siteId,
		ts: new Date(),
		...fields,
	};
	await db.insert(monitorSamples).values(row);
	return row;
}

/**
 * Samples for one site within a `sinceDays` window (clamped 1..90), oldest-first
 * for charting, capped at HISTORY_MAX_ROWS most-recent rows.
 */
export async function monitoringHistory(opts: {
	siteId: string;
	sinceDays: number;
}): Promise<MonitorSampleRow[]> {
	const cutoff = new Date(sinceCutoffMs(opts.sinceDays));
	// Take the most-recent rows within the window (DESC + limit), then present
	// oldest-first so a sparkline reads left-to-right in time order.
	const recent = await db
		.select()
		.from(monitorSamples)
		.where(
			and(
				eq(monitorSamples.siteId, opts.siteId),
				gte(monitorSamples.ts, cutoff)
			)
		)
		.orderBy(desc(monitorSamples.ts))
		.limit(HISTORY_MAX_ROWS);
	return recent.reverse();
}

/** The single newest sample for one site, or null when none recorded yet. */
export async function latestSample(
	siteId: string
): Promise<MonitorSampleRow | null> {
	const rows = await db
		.select()
		.from(monitorSamples)
		.where(eq(monitorSamples.siteId, siteId))
		.orderBy(desc(monitorSamples.ts))
		.limit(1);
	return rows[0] ?? null;
}

/**
 * Run the already-allowlisted `monitor` op ONCE for a site (live HTTP probe +
 * TLS handshake; `--json --no-notify` are baked into the VIBE_OPS entry so this
 * never fires alerts) and persist a derived sample. This is the SINGLE recording
 * path shared by the oRPC handlers and the periodic recorder, so every persisted
 * sample is produced identically. `monitor` exits non-zero when a check fails;
 * we still parse stdout for the snapshot. The panel manages production sites, so
 * the env is fixed to "prod" — matching health.ts and the rest of the routers.
 */
export async function recordSiteSample(
	siteDir: string,
	siteId: string
): Promise<MonitorSampleRow> {
	const { stdout } = await runVibe(siteDir, "prod", "monitor", {
		timeoutMs: 90_000,
	});
	return recordMonitorSample(siteId, parseMonitorJson(stdout));
}

/**
 * Samples for one site within a window used for uptime-% aggregation. Ascending
 * by ts; capped like monitoringHistory. Separated from monitoringHistory so the
 * summary can use a fixed window without coupling to the history query input.
 */
export function samplesInWindow(
	siteId: string,
	sinceDays: number
): Promise<MonitorSampleRow[]> {
	return monitoringHistory({ siteId, sinceDays });
}

/** Delete monitor samples older than the retention window. Boot-time only. */
export async function pruneMonitorSamples(): Promise<void> {
	const cutoff = new Date(Date.now() - PRUNE_AGE_MS);
	await db.delete(monitorSamples).where(lt(monitorSamples.ts, cutoff));
}
