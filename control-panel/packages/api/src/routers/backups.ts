import { z } from "zod";

import type { BackupRecord } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { parseBackups } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { operatorProcedure, protectedProcedure } from "../procedures";

export const backupsRouter = {
	backupsList: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<BackupRecord[]> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new Error("Unknown site");
			}
			return parseBackups(
				(await runVibe(site.installDir, "prod", "backups")).stdout
			);
		}),

	backupsRun: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input, context }) =>
			startJob({
				op: "backup",
				siteId: input.siteId,
				env: "prod",
				kind: "backup",
				userId: context.session.user.id,
				action: "backup",
			})
		),
};
