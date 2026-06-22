import { z } from "zod";

import { runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { parseWpUpdateCount } from "../core-bridge/parse";
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
			const out = await runVibe(site.installDir, "prod", "wpPluginUpdates");
			return { plugins: parseWpUpdateCount(out.stdout) };
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
