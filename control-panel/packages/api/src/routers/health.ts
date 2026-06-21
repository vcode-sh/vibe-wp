import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { HealthReport, MetricTile, Verdict } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseSmoke } from "../core-bridge/parse";
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
			const smoke = parseSmoke(
				(
					await runVibe(site.installDir, "prod", "smoke", {
						timeoutMs: 90_000,
					})
				).stdout
			);
			return {
				tiles: smoke.checks
					.slice(0, 4)
					.map((c) => tile(c.name, c.name, c.ok, c.name)),
				// ttfb/cache/uptime require parsing perf-report/monitor text — follow-up.
				ttfbMs: 0,
				cacheHitPercent: 0,
				tlsDays: 0,
				uptimePercent: 0,
				alertChannels: [],
			};
		}),
};
