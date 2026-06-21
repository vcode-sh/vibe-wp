import { z } from "zod";

import type { LogLine } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseLogLines } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

export const logsRouter = {
	logsRecent: protectedProcedure
		.input(
			z.object({ siteId: z.string(), source: z.enum(["nginx", "php", "wp"]) })
		)
		.handler(async ({ input }): Promise<LogLine[]> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return [];
			}
			return parseLogLines(
				(await runVibe(site.installDir, "prod", "logsRecent")).stdout,
				input.source
			);
		}),
};
