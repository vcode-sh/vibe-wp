/**
 * Settings router — backup R2 config (get/set).
 *
 * NOTE: `backupConfigTest` (rclone lsd probe) is deferred to Phase 2 — it
 * requires an allowlisted rclone exec path that is not yet wired.
 */
import { z } from "zod";
import { getBackupConfig, setBackupConfig } from "../core-bridge/backup-config";
import type { BackupConfigRow } from "../core-bridge/backup-config-pure";
import { GLOBAL_SITE_ID } from "../core-bridge/backup-config-pure";
import { adminProcedure } from "../procedures";

/** Replace the secret with a `hasSecret` boolean — never leak the value. */
function maskRow(row: BackupConfigRow | null): Record<string, unknown> | null {
	if (!row) {
		return null;
	}
	const { secret, ...rest } = row;
	return { ...rest, hasSecret: secret !== null && secret.trim() !== "" };
}

const backupConfigSetInput = z.object({
	siteId: z.string().min(1),
	provider: z.string().optional(),
	endpoint: z.string().optional(),
	accessKeyId: z.string().optional(),
	/** Write-only. Omit or send empty string to preserve existing secret. */
	secret: z.string().optional(),
	bucket: z.string().optional(),
	prefix: z.string().optional(),
	enabled: z.number().int().min(0).max(1).optional(),
	retention: z.number().int().positive().optional(),
});

export const settingsRouter = {
	backupConfigGet: adminProcedure
		.input(z.object({ siteId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const [site, global] = await Promise.all([
				getBackupConfig(input.siteId),
				getBackupConfig(GLOBAL_SITE_ID),
			]);
			return { site: maskRow(site), global: maskRow(global) };
		}),

	backupConfigSet: adminProcedure
		.input(backupConfigSetInput)
		.handler(async ({ input }) => {
			const { siteId, ...patch } = input;
			await setBackupConfig(siteId, patch);
			return { ok: true };
		}),
};
