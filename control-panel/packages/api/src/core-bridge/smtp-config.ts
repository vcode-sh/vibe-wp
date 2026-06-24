/**
 * SMTP relay config: DB-backed storage + resolve/env helpers.
 *
 * Pure merge/env-mapping logic lives in smtp-config-pure.ts so it can be
 * unit-tested without importing the database module.
 */
import { db } from "@control-panel/db";
import { smtpConfig } from "@control-panel/db/schema/smtp";
import { eq } from "drizzle-orm";

import { runVibe } from "./exec";
import type { SmtpConfigRow } from "./smtp-config-pure";
import {
	GLOBAL_SITE_ID,
	mergeSmtpConfig,
	toEnv,
} from "./smtp-config-pure";
import { findSite } from "./sites";

export type SmtpConfigPatch = Omit<Partial<SmtpConfigRow>, "siteId">;

// ---------------------------------------------------------------------------
// DB-backed functions
// ---------------------------------------------------------------------------

/** Returns the raw row for `siteId`, or null if no row exists. */
export async function getSmtpConfig(
	siteId: string
): Promise<SmtpConfigRow | null> {
	const rows = await db
		.select()
		.from(smtpConfig)
		.where(eq(smtpConfig.siteId, siteId));
	return rows[0] ?? null;
}

/**
 * Upserts config for `siteId`. The `password` field is only overwritten
 * when `patch.password` is a non-empty string — omitting or emptying it
 * preserves whatever is already stored.
 */
export async function setSmtpConfig(
	siteId: string,
	patch: SmtpConfigPatch
): Promise<void> {
	const passwordUpdate: { password?: string } =
		patch.password && patch.password.trim() !== ""
			? { password: patch.password }
			: {};

	const { password: _password, ...rest } = patch;
	const values = {
		siteId,
		...rest,
		...passwordUpdate,
		// Fill nullable columns absent from patch with null for a complete upsert;
		// the onConflictDoUpdate set clause takes precedence for existing rows.
		mode: rest.mode ?? null,
		host: rest.host ?? null,
		port: rest.port ?? null,
		secure: rest.secure ?? null,
		auth: rest.auth ?? null,
		username: rest.username ?? null,
		fromAddress: rest.fromAddress ?? null,
		fromName: rest.fromName ?? null,
		password: passwordUpdate.password ?? null,
	};

	await db
		.insert(smtpConfig)
		.values(values)
		.onConflictDoUpdate({
			target: smtpConfig.siteId,
			set: {
				...rest,
				...passwordUpdate,
			},
		});
}

/**
 * Resolves the effective config for a site by merging the global row and the
 * site-specific row.
 */
export async function resolveSmtpConfig(
	siteId: string
): Promise<SmtpConfigRow> {
	const [global, site] = await Promise.all([
		getSmtpConfig(GLOBAL_SITE_ID),
		siteId === GLOBAL_SITE_ID ? Promise.resolve(null) : getSmtpConfig(siteId),
	]);
	return mergeSmtpConfig(global, site);
}

/**
 * Returns a map of SMTP_* environment variables for injection into
 * `bin/vibe` for the given site. Always safe to inject.
 */
export async function smtpConfigEnv(
	siteId: string
): Promise<Record<string, string>> {
	const cfg = await resolveSmtpConfig(siteId);
	return toEnv(cfg);
}

/**
 * Writes the resolved SMTP relay settings into the site's `prod.env` via
 * `bin/vibe`, so both the panel and WordPress use the same relay config.
 * Secrets travel as injected env (redacted in logs), never as argv. No-op
 * when the site is not found in the registry.
 */
export async function applySmtpConfigToSite(siteId: string): Promise<void> {
	const site = await findSite(siteId);
	if (!site) {
		return;
	}
	const env = await smtpConfigEnv(siteId);
	const result = await runVibe(site.installDir, "prod", "smtpConfigApply", {
		env,
	});
	// runVibe never throws on a non-zero exit, so a failed env-file write would
	// otherwise be reported to the caller as success. Surface it instead.
	if (result.code !== 0) {
		throw new Error(
			`smtp-config-apply failed for ${siteId} (exit ${result.code}): ${result.stderr.trim()}`
		);
	}
}

/**
 * Returns the SMTP_* env map for `siteId` augmented with SMTP_TEST_TO so the
 * send-test-email op knows who to deliver to.
 */
export async function smtpTestEnv(
	siteId: string,
	testTo: string
): Promise<Record<string, string>> {
	return { ...(await smtpConfigEnv(siteId)), SMTP_TEST_TO: testTo };
}
