/**
 * Backup R2 config: DB-backed storage + resolve/env helpers.
 *
 * Pure merge/env-mapping logic lives in backup-config-pure.ts so it can be
 * unit-tested without importing the database module.
 */
import { db } from "@control-panel/db";
import { backupConfig } from "@control-panel/db/schema/backups";
import { eq } from "drizzle-orm";

import type {
	BackupConfigRow,
	EffectiveBackupConfig,
} from "./backup-config-pure";
import { GLOBAL_SITE_ID, mergeConfig, toEnv } from "./backup-config-pure";
import { findSite } from "./sites";

export type BackupConfigPatch = Omit<Partial<BackupConfigRow>, "siteId">;

// ---------------------------------------------------------------------------
// DB-backed functions
// ---------------------------------------------------------------------------

/** Returns the raw row for `siteId`, or null if no row exists. */
export async function getBackupConfig(
	siteId: string
): Promise<BackupConfigRow | null> {
	const rows = await db
		.select()
		.from(backupConfig)
		.where(eq(backupConfig.siteId, siteId));
	return rows[0] ?? null;
}

/**
 * Upserts config for `siteId`. The `secret` field is only overwritten when
 * `patch.secret` is a non-empty string — omitting or emptying it preserves
 * whatever is already stored.
 */
export async function setBackupConfig(
	siteId: string,
	patch: BackupConfigPatch
): Promise<void> {
	const secretUpdate: { secret?: string } =
		patch.secret && patch.secret.trim() !== "" ? { secret: patch.secret } : {};

	const { secret: _secret, ...rest } = patch;
	const values = {
		siteId,
		...rest,
		...secretUpdate,
		// Fill nullable columns that are not in patch with null for a complete upsert;
		// the onConflictDoUpdate set clause takes precedence for existing rows.
		provider: rest.provider ?? null,
		endpoint: rest.endpoint ?? null,
		accessKeyId: rest.accessKeyId ?? null,
		bucket: rest.bucket ?? null,
		prefix: rest.prefix ?? null,
		enabled: rest.enabled ?? null,
		retention: rest.retention ?? null,
		secret: secretUpdate.secret ?? null,
	};

	await db
		.insert(backupConfig)
		.values(values)
		.onConflictDoUpdate({
			target: backupConfig.siteId,
			set: {
				...rest,
				...secretUpdate,
			},
		});
}

/**
 * Resolves the effective config for a site by merging the global row and the
 * site-specific row. The site domain is read from `findSite`.
 */
export async function resolveBackupConfig(
	siteId: string
): Promise<EffectiveBackupConfig> {
	const [global, site, detectedSite] = await Promise.all([
		getBackupConfig(GLOBAL_SITE_ID),
		siteId === GLOBAL_SITE_ID ? Promise.resolve(null) : getBackupConfig(siteId),
		siteId === GLOBAL_SITE_ID ? Promise.resolve(null) : findSite(siteId),
	]);

	const domain = detectedSite?.domain ?? siteId;
	return mergeConfig(global, site, domain);
}

/**
 * Returns a map of environment variables for injection into `bin/vibe` for the
 * given site. Always safe to inject — returns `{ VIBE_BACKUP_R2_ENABLED: "0" }`
 * when R2 is not configured or disabled.
 */
export async function backupConfigEnv(
	siteId: string
): Promise<Record<string, string>> {
	const cfg = await resolveBackupConfig(siteId);
	return toEnv(cfg);
}
