/**
 * Per-site settings bridge: reads effective values from the host (systemd
 * timers + the site env file) and applies changes via the single host-exec
 * chokepoint. There is no DB store — the env file and the installed systemd
 * timers are the source of truth, exactly as the runtime contract intends, so
 * the panel and the unattended timers can never disagree.
 *
 * Pure parsing/mapping lives in site-config-pure.ts for DB/IO-free testing.
 */
import { ORPCError } from "@orpc/server";

import { runVibe } from "./exec";
import type {
	BackupCadence,
	MonitorState,
	SecurityFixKind,
	SiteSettings,
	WordpressImage,
} from "./site-config-pure";
import {
	debugPatchToEnv,
	fastcgiCachePatchToEnv,
	imagePatchToEnv,
	isAllowedWordpressImage,
	parseScheduleStatus,
	securityFixToEnv,
} from "./site-config-pure";
import { findSite } from "./sites";

/**
 * Resolve the effective settings for a site. Returns null when the site is not
 * found in the registry. A single `schedule-status` read reports the backup
 * cadence + monitor state (from the installed systemd timers) and the WP debug
 * flags (from the env file).
 */
export async function getSiteSettings(
	siteId: string
): Promise<SiteSettings | null> {
	const site = await findSite(siteId);
	if (!site) {
		return null;
	}
	// schedule-status reports cadence/monitor/debug flags; the current image is
	// not part of it, so read WORDPRESS_IMAGE separately via the read-only `env`
	// op (same approach as the Developer details panel). Run both concurrently.
	const [status, image] = await Promise.all([
		runVibe(site.installDir, "prod", "scheduleStatus"),
		runVibe(site.installDir, "prod", "env", {
			args: ["WORDPRESS_IMAGE"],
			timeoutMs: 5000,
		}),
	]);
	const settings = parseScheduleStatus(status.code === 0 ? status.stdout : "");
	settings.wordpressImage = image.code === 0 ? image.stdout.trim() : "";
	return settings;
}

function ensureOk(
	label: string,
	siteId: string,
	result: { code: number; stderr: string; stdout: string }
): void {
	// runVibe never throws on a non-zero exit, so a failed host change would
	// otherwise be reported to the caller as success. Surface it instead.
	if (result.code !== 0) {
		const detail = (result.stderr || result.stdout).trim();
		throw new Error(
			`${label} failed for ${siteId} (exit ${result.code}): ${detail}`
		);
	}
}

/**
 * Resolve a site for a mutating operation, or throw NOT_FOUND so the admin sees
 * a real error instead of a silent success on an unknown siteId.
 */
async function requireSite(siteId: string) {
	const site = await findSite(siteId);
	if (!site) {
		throw new ORPCError("NOT_FOUND");
	}
	return site;
}

/** Install/remove the scheduled-backup timer for the site. */
export async function applyBackupSchedule(
	siteId: string,
	cadence: BackupCadence
): Promise<void> {
	const site = await requireSite(siteId);
	const result = await runVibe(site.installDir, "prod", "backupScheduleApply", {
		args: [cadence],
		timeoutMs: 30_000,
	});
	ensureOk("backup-schedule-apply", siteId, result);
}

/** Install/remove the hourly health-monitor timer for the site. */
export async function applyMonitorState(
	siteId: string,
	state: MonitorState
): Promise<void> {
	const site = await requireSite(siteId);
	const result = await runVibe(
		site.installDir,
		"prod",
		"monitorScheduleApply",
		{
			args: [state],
			timeoutMs: 30_000,
		}
	);
	ensureOk("monitor-schedule-apply", siteId, result);
}

/**
 * Persist WP debug flags into the site env file. Returns whether the change
 * needs a container restart to take effect (always true when any flag changed,
 * since wp-config is rendered at container start).
 */
export async function applyDebugFlags(
	siteId: string,
	patch: { debugLog?: boolean; debugDisplay?: boolean; scriptDebug?: boolean }
): Promise<{ restartRequired: boolean }> {
	const env = debugPatchToEnv(patch);
	if (Object.keys(env).length === 0) {
		return { restartRequired: false };
	}
	const site = await requireSite(siteId);
	const result = await runVibe(site.installDir, "prod", "siteConfigApply", {
		env,
	});
	ensureOk("site-config-apply", siteId, result);
	return { restartRequired: true };
}

/**
 * Apply a one-click security hardening fix by writing a single boolean key into
 * the site env file (disableXmlRpc -> VIBE_WP_DISABLE_XMLRPC, disableFileEdit ->
 * DISALLOW_FILE_EDIT). Both keys are honored only when the container renders its
 * wp-config / MU-plugin behavior at start, so this returns restartRequired: true
 * — the env write itself never restarts anything (the caller surfaces a watchable
 * "Restart now" lifecycle job). The 0|1 value is revalidated by the root shell
 * writer. The Insights signal (xmlrpc_enabled / file_edit_enabled) reflects the
 * change only on the NEXT collection AFTER the restart, so the score updates then.
 */
export async function applySecurityFix(
	siteId: string,
	fix: SecurityFixKind
): Promise<{ restartRequired: boolean }> {
	const site = await requireSite(siteId);
	const result = await runVibe(site.installDir, "prod", "siteConfigApply", {
		env: securityFixToEnv(fix),
	});
	ensureOk("site-config-apply", siteId, result);
	return { restartRequired: true };
}

/**
 * Persist the selected WordPress image (PHP version) into the site env file.
 * Returns rebuildRequired: the image is a FROM build arg, so only a rebuild
 * (`vibe up --build`) — not a plain restart — picks up the new tag. The tag is
 * validated against the allowlist here and again in the root shell writer.
 */
export async function applyWordpressImage(
	siteId: string,
	tag: WordpressImage
): Promise<{ rebuildRequired: boolean }> {
	if (!isAllowedWordpressImage(tag)) {
		throw new ORPCError("BAD_REQUEST");
	}
	const site = await requireSite(siteId);
	const result = await runVibe(site.installDir, "prod", "siteConfigApply", {
		env: imagePatchToEnv(tag),
	});
	ensureOk("site-config-apply", siteId, result);
	return { rebuildRequired: true };
}

/**
 * Persist the FastCGI page-cache toggle (NGINX_FASTCGI_CACHE) into the site env
 * file. Returns recreateRequired: nginx renders its config from env only at the
 * image entrypoint, so a plain `restart nginx` would NOT pick up the change — the
 * caller must force-recreate the nginx container (the nginxRecreate op) for the
 * new value to take effect. The on|off value is revalidated by the root shell
 * writer. The env write itself never recreates anything (so the panel can fan
 * the streamed recreate job out as a watchable operation).
 */
export async function applyFastcgiCache(
	siteId: string,
	enabled: boolean
): Promise<{ recreateRequired: boolean }> {
	const site = await requireSite(siteId);
	const result = await runVibe(site.installDir, "prod", "siteConfigApply", {
		env: fastcgiCachePatchToEnv(enabled),
	});
	ensureOk("site-config-apply", siteId, result);
	return { recreateRequired: true };
}

/**
 * Add or remove the host Caddy `www.<domain>` alias for a site (serve-both on the
 * apex block, matching what the installer produces). The op edits ONLY the
 * snippet's address line, validates the whole Caddyfile, and HOT-reloads Caddy on
 * success — so there is no restart/recreate to surface, unlike the env-backed
 * toggles. The on|off value is fixed here and revalidated by the root shell op.
 */
export async function applyWwwAlias(
	siteId: string,
	enabled: boolean
): Promise<{ ok: true }> {
	const site = await requireSite(siteId);
	const result = await runVibe(site.installDir, "prod", "caddyWwwApply", {
		args: [enabled ? "on" : "off"],
		timeoutMs: 30_000,
	});
	ensureOk("caddy-www-apply", siteId, result);
	return { ok: true };
}
