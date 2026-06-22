import { z } from "zod";

import type { BackupRecord } from "../contract";
import { backupConfigEnv } from "../core-bridge/backup-config";
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
			const env = await backupConfigEnv(input.siteId);
			return parseBackups(
				(await runVibe(site.installDir, "prod", "backups", { env })).stdout
			);
		}),

	backupsRun: operatorProcedure
		.input(
			z.object({
				siteId: z.string(),
				destination: z.enum(["local", "both"]).default("both"),
			})
		)
		.handler(async ({ input, context }) => {
			const env = await backupConfigEnv(input.siteId);
			const runEnv =
				input.destination === "local"
					? { ...env, VIBE_BACKUP_R2_ENABLED: "0" }
					: env;
			return startJob({
				op: "backup",
				siteId: input.siteId,
				env: "prod",
				kind: "backup",
				userId: context.session.user.id,
				action: "backup",
				extraEnv: runEnv,
			});
		}),

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
