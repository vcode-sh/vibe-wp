import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type {
	BackupContents,
	BackupRecord,
	OffsiteVerified,
} from "../contract";
import { listBackupContents } from "../core-bridge/backup-contents";
import {
	isValidBackupId,
	isValidItemName,
	resolveBackupLocation,
} from "../core-bridge/backup-contents-pure";
import {
	persistBackupVerification,
	readOffsiteVerified,
} from "../core-bridge/backup-verification-db";
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
			// prod.env is the authoritative R2 source (written by the Settings save),
			// so the listing reads it directly — no env injection.
			return parseBackups(
				(await runVibe(site.installDir, "prod", "backups")).stdout
			);
		}),

	backupsRun: operatorProcedure
		.input(
			z.object({
				siteId: z.string(),
				destination: z.enum(["local", "both"]).default("both"),
			})
		)
		.handler(({ input, context }) =>
			// "local" uses the --local-only CLI flag (env-immune); "both" relies on
			// the site's prod.env R2 settings.
			startJob({
				op: input.destination === "local" ? "backupLocal" : "backup",
				siteId: input.siteId,
				env: "prod",
				kind: "backup",
				userId: context.session.user.id,
				action: "backup",
			})
		),

	/**
	 * Verify a backup is structurally restorable. On success we durably record the
	 * outcome so the "off-site verified N h ago" badge reflects a REAL verification.
	 *
	 * We resolve the backup's listed location (local/offsite/both) BEFORE spawning
	 * — from the same `backups` listing the UI shows — and pass an onFinish hook
	 * that persists a backup_verification row keyed by (site, backup). The hook
	 * fires once the job settles: ok=1 on success, ok=0 on failure/cancel. The
	 * badge query only ever reads ok=1 offsite/both rows, so a failed verify can
	 * never fabricate a "verified" badge.
	 */
	backupsVerify: operatorProcedure
		.input(z.object({ siteId: z.string(), backupId: z.string() }))
		.handler(async ({ input, context }) => {
			if (!isValidBackupId(input.backupId)) {
				throw new ORPCError("BAD_REQUEST", { message: "Invalid backup id." });
			}
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND", { message: "Unknown site." });
			}
			// Resolve the copy's real storage location from the authoritative listing.
			const backups = parseBackups(
				(await runVibe(site.installDir, "prod", "backups")).stdout
			);
			const location =
				resolveBackupLocation(backups, input.backupId) ?? "local";
			return startJob({
				op: "backupVerify",
				siteId: input.siteId,
				env: "prod",
				kind: "backupVerify",
				args: [input.backupId],
				userId: context.session.user.id,
				action: "backupVerify",
				onFinish: (status) =>
					persistBackupVerification({
						siteId: input.siteId,
						backupId: input.backupId,
						location,
						ok: status === "succeeded",
					}),
			});
		}),

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

	/**
	 * Browse one backup's contents (files + DB table names). Read-only and
	 * non-secret, so viewers may browse. The backupId is validated to the panel's
	 * canonical relative shape BEFORE the host call; the root wrapper re-confines
	 * it under the site's backups root.
	 */
	listBackupContents: protectedProcedure
		.input(z.object({ siteId: z.string(), backupId: z.string() }))
		.handler(async ({ input }): Promise<BackupContents> => {
			if (!isValidBackupId(input.backupId)) {
				throw new ORPCError("BAD_REQUEST", { message: "Invalid backup id." });
			}
			return await listBackupContents(input.siteId, input.backupId);
		}),

	/**
	 * Restore ONE file or ONE table from a backup. Destructive -> admin-gated +
	 * streamed as a tracked job (the SINGLE host-exec chokepoint is startJob ->
	 * streamVibe; this procedure does NOT spawn). Inputs are validated to mirror
	 * the wrapper's per-kind name rules BEFORE the host call.
	 */
	restoreBackupItem: adminProcedure
		.input(
			z.object({
				siteId: z.string(),
				backupId: z.string(),
				kind: z.enum(["file", "table"]),
				name: z.string(),
			})
		)
		.handler(({ input, context }) => {
			if (!isValidBackupId(input.backupId)) {
				throw new ORPCError("BAD_REQUEST", { message: "Invalid backup id." });
			}
			if (!isValidItemName(input.kind, input.name)) {
				throw new ORPCError("BAD_REQUEST", { message: "Invalid item name." });
			}
			return startJob({
				op: "backupRestoreItem",
				siteId: input.siteId,
				env: "prod",
				kind: "restoreItem",
				args: [input.backupId, input.kind, input.name],
				userId: context.session.user.id,
				action: "restoreItem",
			});
		}),

	/**
	 * The "offsite (R2) backup verified N hours ago" badge source. Reads the
	 * durable backup_verification table — the honest source of truth, populated by
	 * the backupsVerify job's onFinish hook above. Returns all-null
	 * ("not yet verified") until a real offsite/both verify has passed.
	 */
	offsiteVerified: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(
			({ input }): Promise<OffsiteVerified> => readOffsiteVerified(input.siteId)
		),
};
