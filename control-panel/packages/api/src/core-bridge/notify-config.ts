/**
 * Monitor alert channel config: DB-backed storage + resolve/env helpers.
 *
 * Pure merge/env-mapping logic lives in notify-config-pure.ts so it can be
 * unit-tested without importing the database module.
 */
import { db } from "@control-panel/db";
import { notifyConfig } from "@control-panel/db/schema/notify";
import { eq } from "drizzle-orm";

import { runVibe } from "./exec";
import type {
	EffectiveNotifyConfig,
	NotifyConfigRow,
} from "./notify-config-pure";
import { GLOBAL_SITE_ID, mergeNotifyConfig, toEnv } from "./notify-config-pure";
import { findSite } from "./sites";

export type NotifyConfigPatch = Omit<Partial<NotifyConfigRow>, "siteId">;

// ---------------------------------------------------------------------------
// DB-backed functions
// ---------------------------------------------------------------------------

/** Returns the raw row for `siteId`, or null if no row exists. */
export async function getNotifyConfig(
	siteId: string
): Promise<NotifyConfigRow | null> {
	const rows = await db
		.select()
		.from(notifyConfig)
		.where(eq(notifyConfig.siteId, siteId));
	return rows[0] ?? null;
}

/**
 * Upserts config for `siteId`. The `telegramToken` field is only overwritten
 * when `patch.telegramToken` is a non-empty string — omitting or emptying it
 * preserves whatever is already stored.
 */
export async function setNotifyConfig(
	siteId: string,
	patch: NotifyConfigPatch
): Promise<void> {
	const tokenUpdate: { telegramToken?: string } =
		patch.telegramToken && patch.telegramToken.trim() !== ""
			? { telegramToken: patch.telegramToken }
			: {};

	const { telegramToken: _token, ...rest } = patch;
	const values = {
		siteId,
		...rest,
		...tokenUpdate,
		// Fill nullable columns absent from patch with null for a complete upsert;
		// the onConflictDoUpdate set clause takes precedence for existing rows.
		telegramChatId: rest.telegramChatId ?? null,
		webhookUrl: rest.webhookUrl ?? null,
		email: rest.email ?? null,
		alertOnWarn: rest.alertOnWarn ?? null,
		telegramToken: tokenUpdate.telegramToken ?? null,
	};

	await db
		.insert(notifyConfig)
		.values(values)
		.onConflictDoUpdate({
			target: notifyConfig.siteId,
			set: {
				...rest,
				...tokenUpdate,
			},
		});
}

/**
 * Resolves the effective config for a site by merging the global row and the
 * site-specific row.
 */
export async function resolveNotifyConfig(
	siteId: string
): Promise<EffectiveNotifyConfig> {
	const [global, site] = await Promise.all([
		getNotifyConfig(GLOBAL_SITE_ID),
		siteId === GLOBAL_SITE_ID ? Promise.resolve(null) : getNotifyConfig(siteId),
	]);
	return mergeNotifyConfig(global, site);
}

/**
 * Returns a map of VIBE_MONITOR_* environment variables for injection into
 * `bin/vibe` for the given site. Always safe to inject.
 */
export async function notifyConfigEnv(
	siteId: string
): Promise<Record<string, string>> {
	const cfg = await resolveNotifyConfig(siteId);
	return toEnv(cfg);
}

/**
 * Writes the resolved monitor channels into the site's `prod.env` via
 * `bin/vibe`, so both the panel and the unattended cron health monitor read
 * the same settings. Secrets travel as injected env (redacted in logs), never
 * as argv. No-op when the site is not found in the registry.
 */
export async function applyNotifyConfigToSite(siteId: string): Promise<void> {
	const site = await findSite(siteId);
	if (!site) {
		return;
	}
	const env = await notifyConfigEnv(siteId);
	const result = await runVibe(site.installDir, "prod", "notifyConfigApply", {
		env,
	});
	// runVibe never throws on a non-zero exit, so a failed env-file write would
	// otherwise be reported to the caller as success. Surface it instead.
	if (result.code !== 0) {
		throw new Error(
			`notify-config-apply failed for ${siteId} (exit ${result.code}): ${result.stderr.trim()}`
		);
	}
}
