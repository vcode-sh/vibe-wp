import { z } from "zod";

import { startJob } from "../core-bridge/jobs";
import { pluginUpdatesFromOverview } from "../core-bridge/site-overview-builder";
import { readSiteOverviewSnapshot } from "../core-bridge/site-overview-cache";
import {
	kickSiteOverviewRefresh,
	shouldRefreshSiteOverview,
} from "../core-bridge/site-overview-refresher";
import { findSite } from "../core-bridge/sites";
import { operatorProcedure, protectedProcedure } from "../procedures";

export const updatesRouter = {
	updatesAvailable: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<{ plugins: number }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { plugins: 0 };
			}
			const snapshot = await readSiteOverviewSnapshot(site.id);
			if (shouldRefreshSiteOverview(snapshot)) {
				kickSiteOverviewRefresh(site);
			}
			return {
				plugins: snapshot ? pluginUpdatesFromOverview(snapshot.payload) : 0,
			};
		}),

	updatesApply: operatorProcedure
		.input(z.object({ siteId: z.string(), what: z.enum(["core", "plugins"]) }))
		.handler(({ input, context }) =>
			startJob({
				op: input.what === "core" ? "wpCoreUpdate" : "wpPluginUpdateAll",
				siteId: input.siteId,
				env: "prod",
				kind: "wpUpdate",
				userId: context.session.user.id,
				action: "wpUpdate",
			})
		),
};
