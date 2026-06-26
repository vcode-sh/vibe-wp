import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { SiteOverview, SiteSummary, Verdict } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseSmoke } from "../core-bridge/parse";
import { collectingSiteOverview } from "../core-bridge/site-overview-builder";
import {
	readSiteOverviewSnapshot,
	type SiteOverviewSnapshot,
} from "../core-bridge/site-overview-cache";
import {
	kickSiteOverviewRefresh,
	shouldRefreshSiteOverview,
} from "../core-bridge/site-overview-refresher";
import { type DetectedSite, detectSites, findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

function summaryFromSnapshot(
	site: DetectedSite,
	snapshot: SiteOverviewSnapshot | null
): SiteSummary {
	return {
		id: site.id,
		name: site.slug,
		domain: site.domain,
		hasStaging: site.hasStaging,
		status: snapshot?.payload.status ?? "watch",
		lastBackupISO: snapshot?.payload.lastBackupISO ?? "",
	};
}

export const sitesRouter = {
	sitesList: protectedProcedure.handler(async (): Promise<SiteSummary[]> => {
		const sites = await detectSites();
		return Promise.all(
			sites.map(async (site) => {
				const snapshot = await readSiteOverviewSnapshot(site.id);
				if (shouldRefreshSiteOverview(snapshot)) {
					kickSiteOverviewRefresh(site);
				}
				return summaryFromSnapshot(site, snapshot);
			})
		);
	}),

	siteStatus: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<{ status: Verdict }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			const snapshot = await readSiteOverviewSnapshot(site.id);
			if (shouldRefreshSiteOverview(snapshot)) {
				kickSiteOverviewRefresh(site);
			}
			if (snapshot) {
				return { status: snapshot.payload.status };
			}
			const { stdout, code } = await runVibe(site.installDir, "prod", "smoke", {
				timeoutMs: 90_000,
			});
			const passed = code === 0 && parseSmoke(stdout).passed;
			return { status: passed ? "good" : "act" };
		}),

	siteOverview: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<SiteOverview> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			const snapshot = await readSiteOverviewSnapshot(site.id);
			if (shouldRefreshSiteOverview(snapshot)) {
				kickSiteOverviewRefresh(site);
			}
			return snapshot?.payload ?? collectingSiteOverview(site);
		}),
};
