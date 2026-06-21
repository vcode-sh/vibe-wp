import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { HealthReport, MetricTile, Verdict } from "../contract";
import { runVibe } from "../core-bridge/exec";
import {
	parseChecksJson,
	parseMonitorJson,
	parsePerfJson,
} from "../core-bridge/parse";
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
	help: "From the latest checks.",
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
			const smoke = parseChecksJson(
				(
					await runVibe(site.installDir, "prod", "smokeJson", {
						timeoutMs: 90_000,
					})
				).stdout
			);
			const perf = parsePerfJson(
				(
					await runVibe(site.installDir, "prod", "perfJson", {
						timeoutMs: 120_000,
					})
				).stdout
			);
			const mon = parseMonitorJson(
				(await runVibe(site.installDir, "prod", "monitorJson")).stdout
			);
			return {
				tiles: smoke.checks
					.slice(0, 4)
					.map((c) => tile(c.name, c.name, c.ok, c.name)),
				ttfbMs: perf.ttfbMs,
				cacheHitPercent: perf.cacheHitPercent,
				tlsDays: 0,
				uptimePercent: mon.uptimePercent,
				alertChannels: [],
			};
		}),
};
