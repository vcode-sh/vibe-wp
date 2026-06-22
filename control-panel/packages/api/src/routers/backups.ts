import { z } from "zod";

import type { BackupRecord } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { parseBackups } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import {
	adminProcedure,
	operatorProcedure,
	protectedProcedure,
} from "../procedures";

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

	backupsVerify: operatorProcedure
		.input(z.object({ siteId: z.string(), backupId: z.string() }))
		.handler(({ input, context }) =>
			startJob({
				op: "backupVerify",
				siteId: input.siteId,
				env: "prod",
				kind: "backupVerify",
				args: [input.backupId],
				userId: context.session.user.id,
				action: "backupVerify",
			})
		),

	backupsRestore: adminProcedure
		.input(z.object({ siteId: z.string(), backupId: z.string() }))
		.handler(({ input, context }) =>
			startJob({
				op: "restore",
				siteId: input.siteId,
				env: "prod",
				kind: "restore",
				args: [input.backupId],
				userId: context.session.user.id,
				action: "restore",
			})
		),
};
