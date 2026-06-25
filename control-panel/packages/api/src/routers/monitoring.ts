import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { MonitoringSummaryEntry, MonitorSample } from "../contract";
import {
	latestSample,
	type MonitorSampleRow,
	monitoringHistory,
	recordSiteSample,
	samplesInWindow,
} from "../core-bridge/monitor-history";
import { uptimePercentOver } from "../core-bridge/monitor-history-pure";
import { detectSites, findSite } from "../core-bridge/sites";
import { operatorProcedure, protectedProcedure } from "../procedures";

/** Window (days) the summary aggregates uptime-% over. */
const SUMMARY_WINDOW_DAYS = 7;

/** Map a DB row to the wire MonitorSample (timestamp → ISO string). */
function toWireSample(row: MonitorSampleRow): MonitorSample {
	return {
		id: row.id,
		siteId: row.siteId,
		whenISO: row.ts.toISOString(),
		status: row.status as MonitorSample["status"],
		up: (row.up ? 1 : 0) as MonitorSample["up"],
		httpStatus: row.httpStatus,
		certDaysLeft: row.certDaysLeft,
		dnsOk: row.dnsOk === null ? null : ((row.dnsOk ? 1 : 0) as 0 | 1),
		failures: row.failures,
		warnings: row.warnings,
	};
}

/** Compose a per-site summary tile from the latest sample + window samples. */
function summaryEntry(
	siteId: string,
	domain: string,
	latest: MonitorSampleRow | null,
	window: MonitorSampleRow[]
): MonitoringSummaryEntry {
	const uptimePercent = uptimePercentOver(window);
	return {
		siteId,
		domain,
		status: (latest?.status ?? "unknown") as MonitoringSummaryEntry["status"],
		up: latest === null ? null : ((latest.up ? 1 : 0) as 0 | 1),
		httpStatus: latest?.httpStatus ?? null,
		certDaysLeft: latest?.certDaysLeft ?? null,
		dnsOk:
			latest == null || latest.dnsOk === null
				? null
				: ((latest.dnsOk ? 1 : 0) as 0 | 1),
		// dnsOk is HTTP-derived, not a real DNS probe — always flag approximate.
		dnsApproximate: true,
		uptimePercent,
		sampleCount: window.length,
		lastSampleISO: latest ? latest.ts.toISOString() : null,
	};
}

/** Read the latest persisted tile per detected site (NO host spawn). */
async function buildEntries(): Promise<MonitoringSummaryEntry[]> {
	const sites = await detectSites();
	return Promise.all(
		sites.map(async (s) => {
			const [latest, window] = await Promise.all([
				latestSample(s.id),
				samplesInWindow(s.id, SUMMARY_WINDOW_DAYS),
			]);
			return summaryEntry(s.id, s.domain, latest, window);
		})
	);
}

export const monitoringRouter = {
	/**
	 * Persisted samples for one site over a `sinceDays` window. READ-ONLY (no host
	 * spawn) → protectedProcedure, matching health.ts reads.
	 */
	monitoringHistory: protectedProcedure
		.input(
			z.object({
				siteId: z.string(),
				sinceDays: z.number().int().min(1).max(90).default(7),
			})
		)
		.handler(async ({ input }): Promise<MonitorSample[]> => {
			const rows = await monitoringHistory({
				siteId: input.siteId,
				sinceDays: input.sinceDays,
			});
			return rows.map(toWireSample);
		}),

	/**
	 * READ-ONLY all-sites overview: the latest persisted tile per detected site,
	 * straight from the DB — NO host spawn. This is what the at-a-glance overview
	 * page polls, so opening it is cheap and any viewer can see status. Fresh
	 * samples come from the background recorder (or the explicit refresh below).
	 */
	monitoringOverview: protectedProcedure.handler(
		(): Promise<MonitoringSummaryEntry[]> => buildEntries()
	),

	/**
	 * Latest derived tile per detected site. This handler also RECORDS a fresh
	 * sample per site by running the already-allowlisted `monitor` op (the live
	 * TLS handshake + HTTP probe), so it doubles as an explicit "check every site
	 * now". Spawning the host op → operatorProcedure. Recording is best-effort: a
	 * site whose monitor run fails still reports its last persisted tile.
	 */
	monitoringSummary: operatorProcedure.handler(
		async (): Promise<MonitoringSummaryEntry[]> => {
			const sites = await detectSites();
			await Promise.all(
				sites.map((s) =>
					recordSiteSample(s.installDir, s.id).catch(() => {
						// Best-effort: keep the last persisted tile for this site.
					})
				)
			);
			return buildEntries();
		}
	),

	/**
	 * Explicit refresh: run the `monitor` op for ONE site and persist a sample.
	 * Spawns the host op → operatorProcedure. Returns the newly recorded sample.
	 */
	monitoringRecordSample: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<MonitorSample> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			const row = await recordSiteSample(site.installDir, input.siteId);
			return toWireSample(row);
		}),
};
