import { z } from "zod";

import type { StagingInfo } from "../contract";
import { hostFromUrl, parseEnvFile } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

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
};
