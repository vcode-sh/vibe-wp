import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { HealthReport, PerfReport } from "../contract";
import { runVibe } from "../core-bridge/exec";
import {
	buildHealthReport,
	healthAlertChannels,
} from "../core-bridge/health-report";
import { latestSample } from "../core-bridge/monitor-history";
import { resolveNotifyConfig } from "../core-bridge/notify-config";
import { parsePerfJson } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

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
			const [sample, alertChannels] = await Promise.all([
				latestSample(input.siteId),
				resolveNotifyConfig(input.siteId).then(healthAlertChannels),
			]);
			return buildHealthReport(sample, alertChannels);
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
