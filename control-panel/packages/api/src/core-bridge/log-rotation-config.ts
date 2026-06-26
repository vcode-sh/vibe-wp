/**
 * Docker json-file log rotation config: DB-backed global storage + per-site env
 * application. Compose reads VIBE_LOG_MAX_SIZE / VIBE_LOG_MAX_FILE, so existing
 * and unattended site processes share the same runtime contract.
 */
import { db } from "@control-panel/db";
import { logRotationConfig } from "@control-panel/db/schema/log-rotation";
import { eq } from "drizzle-orm";

import { runVibe } from "./exec";
import {
	GLOBAL_SITE_ID,
	type LogRotationConfig,
	type LogRotationConfigPatch,
	type LogRotationConfigRow,
	logRotationToEnv,
	mergeLogRotationConfig,
} from "./log-rotation-config-pure";
import { findSite } from "./sites";

export async function getLogRotationConfig(): Promise<LogRotationConfig> {
	const rows = await db
		.select()
		.from(logRotationConfig)
		.where(eq(logRotationConfig.siteId, GLOBAL_SITE_ID));
	return mergeLogRotationConfig((rows[0] as LogRotationConfigRow) ?? null);
}

export async function setLogRotationConfig(
	patch: LogRotationConfigPatch
): Promise<LogRotationConfig> {
	const current = await getLogRotationConfig();
	const next = mergeLogRotationConfig({ ...current, ...patch });
	await db
		.insert(logRotationConfig)
		.values({
			siteId: GLOBAL_SITE_ID,
			maxSize: next.maxSize,
			maxFile: next.maxFile,
		})
		.onConflictDoUpdate({
			target: logRotationConfig.siteId,
			set: { maxSize: next.maxSize, maxFile: next.maxFile },
		});
	return next;
}

export async function applyLogRotationToSite(siteId: string): Promise<void> {
	const site = await findSite(siteId);
	if (!site) {
		return;
	}
	const result = await runVibe(site.installDir, "prod", "siteConfigApply", {
		env: logRotationToEnv(await getLogRotationConfig()),
	});
	if (result.code !== 0) {
		throw new Error(
			`log-rotation apply failed for ${siteId} (exit ${result.code}): ${result.stderr.trim()}`
		);
	}
}
