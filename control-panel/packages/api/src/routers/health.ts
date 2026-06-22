import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type {
	HealthReport,
	MetricTile,
	PerfReport,
	Verdict,
} from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseMonitorJson, parsePerfJson } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

const tile = (
	key: string,
	label: string,
	ok: boolean,
	detail: string
): MetricTile => ({
	key,
	label,
	verdict: (ok ? "good" : "act") as Verdict,
	value: ok ? "OK" : "Failing",
	detail,
	help: "From the latest monitor checks.",
});

export const healthRouter = {
	healthCheck: protectedProcedure.handler(() => ({
		service: "vibe-wp-control-panel",
		status: "ok",
		checkedAt: new Date().toISOString(),
	})),

	healthReport: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<HealthReport> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			// monitor exits 1 when a check fails; still parse stdout for the report.
			const { stdout } = await runVibe(site.installDir, "prod", "monitor", {
				timeoutMs: 90_000,
			});
			const monitor = parseMonitorJson(stdout);
			return {
				// Each monitor check (HTTP, disk, TLS, backup freshness, containers)
				// becomes a tile. TLS is surfaced here as a check tile rather than a
				// fabricated days-to-expiry number.
				tiles: monitor.checks.map((c) => tile(c.name, c.name, c.ok, c.name)),
				uptimePercent: monitor.uptimePercent,
				// Notification wiring lands in Phase 3.
				alertChannels: [],
			};
		}),

	healthPerf: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<PerfReport> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			// Heavy, on-demand report (exec'd into containers); allow extra time.
			const { stdout } = await runVibe(site.installDir, "prod", "perfReport", {
				timeoutMs: 120_000,
			});
			return parsePerfJson(stdout);
		}),
};
