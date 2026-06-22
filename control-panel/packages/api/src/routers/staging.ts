import { z } from "zod";

import type { StagingInfo } from "../contract";
import { startJob } from "../core-bridge/jobs";
import { hostFromUrl, parseEnvFile } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import {
	adminProcedure,
	operatorProcedure,
	protectedProcedure,
} from "../procedures";

export const stagingRouter = {
	stagingInfo: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<StagingInfo> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { present: false, url: null };
			}
			const stageText = await Bun.file(`${site.installDir}/env/stage.env`)
				.text()
				.catch(() => "");
			const stage = parseEnvFile(stageText);
			return stage.WP_HOME
				? { present: true, url: hostFromUrl(stage.WP_HOME), noindex: true }
				: { present: false, url: null };
		}),

	stagingRefresh: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input, context }) =>
			startJob({
				op: "refresh",
				siteId: input.siteId,
				env: "stage",
				kind: "refresh",
				userId: context.session.user.id,
				action: "refresh",
			})
		),

	stagingPromote: adminProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input, context }) =>
			startJob({
				op: "promote",
				siteId: input.siteId,
				env: "stage",
				kind: "promote",
				userId: context.session.user.id,
				action: "promote",
			})
		),
};
