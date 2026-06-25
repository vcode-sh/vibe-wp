/**
 * Pure helpers to turn a per-site monitor history (oldest-first MonitorSample[])
 * into the display shape MonitoringCard expects, without re-fetching the
 * server-wide summary. Keeps the route presentational + makes the math testable.
 */

import type { client } from "@/lib/orpc/client";

type Sample = Awaited<ReturnType<typeof client.monitoringHistory>>[number];
type SummaryEntry = Awaited<
	ReturnType<typeof client.monitoringSummary>
>[number];

/** Honest fraction-of-probes-reachable over the samples, one decimal. */
export function uptimePercent(samples: { up: 0 | 1 }[]): number | null {
	if (samples.length === 0) {
		return null;
	}
	const up = samples.reduce((n, s) => n + s.up, 0);
	return Math.round((up / samples.length) * 1000) / 10;
}

/** The `up` series for the sparkline (already oldest-first from the server). */
export function upSeries(samples: { up: 0 | 1 }[]): number[] {
	return samples.map((s) => s.up);
}

/**
 * Build a MonitoringSummaryEntry-shaped tile from this site's history. The
 * latest sample drives the current cert/dns/http/status; the window drives
 * uptime %. Returns a tile with status "unknown" when no samples exist.
 */
export function tileFromHistory(
	siteId: string,
	domain: string,
	samples: Sample[]
): SummaryEntry {
	const latest = samples.at(-1) ?? null;
	return {
		siteId,
		domain,
		status: latest?.status ?? "unknown",
		up: latest === null ? null : latest.up,
		httpStatus: latest?.httpStatus ?? null,
		certDaysLeft: latest?.certDaysLeft ?? null,
		dnsOk: latest?.dnsOk ?? null,
		dnsApproximate: true,
		uptimePercent: uptimePercent(samples),
		sampleCount: samples.length,
		lastSampleISO: latest?.whenISO ?? null,
	};
}
