import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { SiteOverview, SiteSummary, Verdict } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseBackups, parseSmoke } from "../core-bridge/parse";
import { collectingSiteOverview } from "../core-bridge/site-overview-builder";
import { readSiteOverviewSnapshot } from "../core-bridge/site-overview-cache";
import {
	kickSiteOverviewRefresh,
	shouldRefreshSiteOverview,
} from "../core-bridge/site-overview-refresher";
import { detectSites, findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

export const sitesRouter = {
	sitesList: protectedProcedure.handler(async (): Promise<SiteSummary[]> => {
		const sites = await detectSites();
		return Promise.all(
			sites.map(async (s) => ({
				id: s.id,
				name: s.slug,
				domain: s.domain,
				hasStaging: s.hasStaging,
				lastBackupISO:
					parseBackups(
						(await runVibe(s.installDir, "prod", "backups")).stdout
					)[0]?.whenISO ?? "",
			}))
		);
	}),

	siteStatus: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<{ status: Verdict }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
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
