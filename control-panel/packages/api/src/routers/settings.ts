/**
 * Settings router — backup R2 config + monitor alert channels (get/set/test).
 */
import { z } from "zod";
import {
	applyBackupConfigToSite,
	backupTestEnv,
	getBackupConfig,
	listConfiguredSiteIds,
	setBackupConfig,
} from "../core-bridge/backup-config";
import type { BackupConfigRow } from "../core-bridge/backup-config-pure";
import { GLOBAL_SITE_ID } from "../core-bridge/backup-config-pure";
import { runVibe } from "../core-bridge/exec";
import {
	applyNotifyConfigToSite,
	getNotifyConfig,
	setNotifyConfig,
} from "../core-bridge/notify-config";
import type { NotifyConfigRow } from "../core-bridge/notify-config-pure";
import {
	applySmtpConfigToSite,
	getSmtpConfig,
	setSmtpConfig,
} from "../core-bridge/smtp-config";
import { maskSmtpRow } from "../core-bridge/smtp-config-pure";
import {
	applyBackupSchedule,
	applyDebugFlags,
	applyFastcgiCache,
	applyMonitorState,
	applyWordpressImage,
	applyWwwAlias,
	getSiteSettings,
} from "../core-bridge/site-config";
import { ALLOWED_WORDPRESS_IMAGES } from "../core-bridge/site-config-pure";
import { detectSites, findSite } from "../core-bridge/sites";
import { adminProcedure, protectedProcedure } from "../procedures";

/** Replace the secret with a `hasSecret` boolean — never leak the value. */
function maskRow(row: BackupConfigRow | null): Record<string, unknown> | null {
	if (!row) {
		return null;
	}
	const { secret, ...rest } = row;
	return { ...rest, hasSecret: secret !== null && secret.trim() !== "" };
}

/** Replace the telegram token with a `hasToken` boolean — never leak it. */
function maskNotifyRow(
	row: NotifyConfigRow | null
): Record<string, unknown> | null {
	if (!row) {
		return null;
	}
	const { telegramToken, ...rest } = row;
	return {
		...rest,
		hasToken: telegramToken !== null && telegramToken.trim() !== "",
	};
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

const notifyConfigSetInput = z.object({
	siteId: z.string().min(1),
	/** Write-only. Omit or send empty string to preserve existing token. */
	telegramToken: z.string().optional(),
	telegramChatId: z.string().optional(),
	webhookUrl: z.string().optional(),
	email: z.string().optional(),
	alertOnWarn: z.number().int().min(0).max(1).optional(),
});

const smtpConfigSetInput = z.object({
	siteId: z.string().min(1),
	mode: z.enum(["off", "relay", "log"]).optional(),
	host: z.string().optional(),
	port: z.number().int().min(1).max(65_535).optional(),
	secure: z.enum(["starttls", "tls", "none"]).optional(),
	auth: z.enum(["on", "off"]).optional(),
	username: z.string().optional(),
	/** Write-only. Omit/empty to preserve the existing password. */
	password: z.string().optional(),
	fromAddress: z.string().optional(),
	fromName: z.string().optional(),
});

/**
 * Applies the saved config to one site (per-site save) or fans out to every
 * configured site (global save), reporting any sites that failed to receive it.
 */
async function applyToSites(
	siteId: string,
	listIds: () => Promise<string[]>,
	apply: (id: string) => Promise<void>
): Promise<void> {
	if (siteId !== GLOBAL_SITE_ID) {
		await apply(siteId);
		return;
	}
	const ids = await listIds();
	const outcomes = await Promise.allSettled(ids.map((id) => apply(id)));
	const failed = ids.filter((_, i) => outcomes[i]?.status === "rejected");
	if (failed.length > 0) {
		throw new Error(
			`Saved, but failed to apply config to: ${failed.join(", ")}`
		);
	}
}

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
			// Push the resolved config into each affected site's prod.env so it is
			// authoritative for both the panel and the cron backup timer.
			await applyToSites(
				siteId,
				listConfiguredSiteIds,
				applyBackupConfigToSite
			);
			return { ok: true };
		}),

	notifyConfigGet: adminProcedure
		.input(z.object({ siteId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const [site, global] = await Promise.all([
				getNotifyConfig(input.siteId),
				getNotifyConfig(GLOBAL_SITE_ID),
			]);
			return { site: maskNotifyRow(site), global: maskNotifyRow(global) };
		}),

	notifyConfigSet: adminProcedure
		.input(notifyConfigSetInput)
		.handler(async ({ input }) => {
			const { siteId, ...patch } = input;
			await setNotifyConfig(siteId, patch);
			// Notifications are configured globally (there is no per-site notify UI),
			// so a global save must reach EVERY real site — not only sites with a
			// per-site notify row (which never exist). resolveNotifyConfig for a site
			// with no row resolves to the global config, so each site's env receives
			// the global channels and the cron monitor delivers alerts.
			await applyToSites(
				siteId,
				async () => (await detectSites()).map((s) => s.id),
				applyNotifyConfigToSite
			);
			return { ok: true };
		}),

	notifyTest: adminProcedure
		.input(z.object({ siteId: z.string().min(1) }))
		.handler(async ({ input }) => {
			// The global card sends siteId === GLOBAL_SITE_ID (no site-specific row),
			// so fall back to the first detected site — same pattern as
			// backupConfigTest. The test reads channels from that site's prod.env.
			let site =
				input.siteId === GLOBAL_SITE_ID ? null : await findSite(input.siteId);
			if (!site) {
				const sites = await detectSites();
				site = sites[0] ?? null;
			}
			if (!site) {
				return { ok: false, message: "No site found — deploy a site first." };
			}
			const result = await runVibe(site.installDir, "prod", "notifyTest");
			const message = (result.stdout || result.stderr).trim();
			return { ok: result.code === 0, message };
		}),

	smtpConfigGet: adminProcedure
		.input(z.object({ siteId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const [site, global] = await Promise.all([
				getSmtpConfig(input.siteId),
				getSmtpConfig(GLOBAL_SITE_ID),
			]);
			return { site: maskSmtpRow(site), global: maskSmtpRow(global) };
		}),

	smtpConfigSet: adminProcedure
		.input(smtpConfigSetInput)
		.handler(async ({ input }) => {
			const { siteId, ...patch } = input;
			await setSmtpConfig(siteId, patch);
			await applyToSites(
				siteId,
				async () => (await detectSites()).map((s) => s.id),
				applySmtpConfigToSite
			);
			return { ok: true };
		}),

	smtpTest: adminProcedure
		.input(z.object({ siteId: z.string().min(1), to: z.string().email() }))
		.handler(async ({ input }) => {
			let site =
				input.siteId === GLOBAL_SITE_ID ? null : await findSite(input.siteId);
			if (!site) {
				const sites = await detectSites();
				site = sites[0] ?? null;
			}
			if (!site) {
				return { ok: false, message: "No site found — deploy a site first." };
			}
			const result = await runVibe(site.installDir, "prod", "smtpTest", {
				env: { SMTP_TEST_TO: input.to },
			});
			const message = (result.stdout || result.stderr).trim();
			return { ok: result.code === 0, message };
		}),

	backupConfigTest: adminProcedure
		.input(z.object({ siteId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const testEnv = await backupTestEnv(input.siteId);
			if (!testEnv) {
				return {
					ok: false,
					message:
						"Configure R2 credentials (provider, key, secret, bucket) first.",
				};
			}

			// Pick the target site. For the global card siteId === GLOBAL_SITE_ID
			// so there is no site-specific row — fall back to the first detected site
			// (same pattern as securityStatus / serverHarden in server.ts).
			let site =
				input.siteId === GLOBAL_SITE_ID ? null : await findSite(input.siteId);
			if (!site) {
				const sites = await detectSites();
				site = sites[0] ?? null;
			}
			if (!site) {
				return { ok: false, message: "No site found — deploy a site first." };
			}

			const result = await runVibe(site.installDir, "prod", "backupTest", {
				env: testEnv,
				timeoutMs: 30_000,
			});
			const message = (result.stdout || result.stderr).trim();
			return { ok: result.code === 0, message };
		}),

	/**
	 * Effective per-site settings (backup cadence, monitor state, WP debug
	 * flags). Read-only, so any authenticated role may view it; the mutating
	 * procedures below are admin-gated.
	 */
	siteSettingsGet: protectedProcedure
		.input(z.object({ siteId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const settings = await getSiteSettings(input.siteId);
			return { settings };
		}),

	/** Set the scheduled-backup cadence (rewrites the systemd timer). */
	siteBackupScheduleSet: adminProcedure
		.input(
			z.object({
				siteId: z.string().min(1),
				cadence: z.enum(["off", "daily", "weekly"]),
			})
		)
		.handler(async ({ input }) => {
			await applyBackupSchedule(input.siteId, input.cadence);
			return { ok: true };
		}),

	/** Enable or disable the hourly health-monitor timer. */
	siteMonitorSet: adminProcedure
		.input(z.object({ siteId: z.string().min(1), enabled: z.boolean() }))
		.handler(async ({ input }) => {
			await applyMonitorState(input.siteId, input.enabled ? "on" : "off");
			return { ok: true };
		}),

	/**
	 * Set WP debug flags in the site env file. Returns restartRequired so the UI
	 * can prompt the operator to restart the container (wp-config is rendered at
	 * container start, so the change is inert until then).
	 */
	siteDebugSet: adminProcedure
		.input(
			z.object({
				siteId: z.string().min(1),
				debugLog: z.boolean().optional(),
				debugDisplay: z.boolean().optional(),
				scriptDebug: z.boolean().optional(),
			})
		)
		.handler(async ({ input }) => {
			const { siteId, ...patch } = input;
			return await applyDebugFlags(siteId, patch);
		}),

	/**
	 * Set the site's WordPress image (PHP version). Returns rebuildRequired so
	 * the UI can trigger `vibe up --build` — the image is a FROM build arg, so a
	 * plain restart would reuse the old image. The enum is the curated allowlist;
	 * the root shell writer revalidates it independently.
	 */
	sitePhpImageSet: adminProcedure
		.input(
			z.object({
				siteId: z.string().min(1),
				image: z.enum(ALLOWED_WORDPRESS_IMAGES),
			})
		)
		.handler(
			async ({ input }) => await applyWordpressImage(input.siteId, input.image)
		),

	/**
	 * Toggle the FastCGI page cache (NGINX_FASTCGI_CACHE) in the site env file.
	 * Returns recreateRequired so the UI can start the streamed nginx-recreate job
	 * — nginx renders its config from env only at the image entrypoint, so a plain
	 * restart would leave the old value in place.
	 */
	siteFastcgiCacheSet: adminProcedure
		.input(z.object({ siteId: z.string().min(1), enabled: z.boolean() }))
		.handler(
			async ({ input }) => await applyFastcgiCache(input.siteId, input.enabled)
		),

	/**
	 * Add or remove the host Caddy www.<domain> alias for a site. The op edits the
	 * snippet's address line and hot-reloads Caddy, so there is nothing to restart
	 * — it just succeeds or throws. www requires a DNS record for www.<domain>;
	 * the UI surfaces that as a non-blocking hint (the op does not enforce DNS).
	 */
	siteWwwAliasSet: adminProcedure
		.input(z.object({ siteId: z.string().min(1), enabled: z.boolean() }))
		.handler(
			async ({ input }) => await applyWwwAlias(input.siteId, input.enabled)
		),
};
