import { z } from "zod";

import type { SiteInsights } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseInsights } from "../core-bridge/parse-insights";
import { findSite } from "../core-bridge/sites";
import { operatorProcedure } from "../procedures";

export const inventoryRouter = {
	siteInventory: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<SiteInsights | null> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return null;
			}
			const { stdout, code } = await runVibe(site.installDir, "prod", "insights", {
				timeoutMs: 10_000,
			});
			if (code !== 0) {
				return null; // not collected yet (file absent)
			}
			return parseInsights(stdout); // throws on malformed → surfaced as a 500/parse error
		}),

	refreshInventory: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<{ ok: boolean }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { ok: false };
			}
			const { code } = await runVibe(site.installDir, "prod", "insightsRefresh", {
				timeoutMs: 60_000,
			});
			return { ok: code === 0 };
		}),
};
