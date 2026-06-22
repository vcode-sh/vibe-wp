import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { NeedItem, SiteOverview, SiteSummary, Verdict } from "../contract";
import { auditToActivity } from "../core-bridge/audit";
import { runVibe } from "../core-bridge/exec";
import { recentAudit } from "../core-bridge/jobs-db";
import {
	parseBackups,
	parseSmoke,
	parseWpUpdateCount,
} from "../core-bridge/parse";
import { detectSites, findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
// Match bin/monitor's backup-freshness default (VIBE_MONITOR_BACKUP_MAX_AGE_HOURS).
const BACKUP_STALE_HOURS = 26;

/** Honest, dependency-free relative age (e.g. "3h ago", "2d ago"). */
function relativeAge(iso: string, nowMs: number): string {
	const then = Date.parse(iso);
	if (Number.isNaN(then)) {
		return "unknown";
	}
	const diff = Math.max(0, nowMs - then);
	if (diff < HOUR_MS) {
		return "under 1h ago";
	}
	if (diff < DAY_MS) {
		return `${Math.floor(diff / HOUR_MS)}h ago`;
	}
	return `${Math.floor(diff / DAY_MS)}d ago`;
}

/** Backup-derived safety copy + an optional NeedItem, from the real latest backup. */
function backupSignal(
	lastBackupISO: string,
	nowMs: number
): { text: string; detail: string; need: NeedItem | null } {
	const then = Date.parse(lastBackupISO);
	if (!lastBackupISO || Number.isNaN(then)) {
		return {
			text: "No backups yet",
			detail: "Create the first backup from the Backups tab.",
			need: {
				id: "backup-missing",
				icon: "backup",
				title: "No backups yet",
				detail: "This site has never been backed up.",
				actionLabel: "Back up now",
				reversible: false,
			},
		};
	}
	const ageHours = (nowMs - then) / HOUR_MS;
	const stale = ageHours > BACKUP_STALE_HOURS;
	return {
		text: `Last backup ${relativeAge(lastBackupISO, nowMs)}`,
		detail: stale
			? `Newest backup is older than ${BACKUP_STALE_HOURS}h.`
			: "Backups are current.",
		need: stale
			? {
					id: "backup-stale",
					icon: "backup",
					title: "Backup is stale",
					detail: `Newest backup ${relativeAge(lastBackupISO, nowMs)}.`,
					actionLabel: "Back up now",
					reversible: false,
				}
			: null,
	};
}

/** A NeedItem for pending plugin updates, or null when nothing is pending. */
function updatesNeed(pluginUpdates: number): NeedItem | null {
	if (pluginUpdates <= 0) {
		return null;
	}
	const plural = pluginUpdates === 1 ? "" : "s";
	return {
		id: "plugin-updates",
		icon: "update",
		title: `${pluginUpdates} plugin update${plural} available`,
		detail: "Apply pending plugin updates to stay patched.",
		actionLabel: "Update plugins",
		reversible: false,
	};
}

export const sitesRouter = {
	sitesList: protectedProcedure.handler(async (): Promise<SiteSummary[]> => {
		const sites = await detectSites();
		return Promise.all(
			sites.map(async (s) => ({
				id: s.id,
				name: s.slug,
				domain: s.domain,
				hasStaging: s.hasStaging,
				lastBackupISO:
					parseBackups(
						(await runVibe(s.installDir, "prod", "backups")).stdout
					)[0]?.whenISO ?? "",
			}))
		);
	}),

	siteStatus: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<{ status: Verdict }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			const { stdout, code } = await runVibe(site.installDir, "prod", "smoke", {
				timeoutMs: 90_000,
			});
			const passed = code === 0 && parseSmoke(stdout).passed;
			return { status: passed ? "good" : "act" };
		}),

	siteOverview: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<SiteOverview> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}
			const nowMs = Date.now();
			// Run the read-only signals concurrently so latency does not stack:
			// smoke (health tiles), backups (freshness), plugin updates (count),
			// and the local audit (DB). No per-overview heavy host probes.
			const [smokeRes, backupsRes, updatesRes, audit] = await Promise.all([
				runVibe(site.installDir, "prod", "smoke", { timeoutMs: 90_000 }),
				runVibe(site.installDir, "prod", "backups"),
				runVibe(site.installDir, "prod", "wpPluginUpdates"),
				recentAudit(site.id),
			]);
			const smoke = parseSmoke(smokeRes.stdout);
			const status = smoke.passed ? "good" : ("act" as Verdict);
			const lastBackupISO = parseBackups(backupsRes.stdout)[0]?.whenISO ?? "";
			const backup = backupSignal(lastBackupISO, nowMs);
			const pluginUpdates = parseWpUpdateCount(updatesRes.stdout);

			const needs: NeedItem[] = [];
			const updNeed = updatesNeed(pluginUpdates);
			if (updNeed) {
				needs.push(updNeed);
			}
			if (backup.need) {
				needs.push(backup.need);
			}

			return {
				siteId: site.id,
				status,
				headline: smoke.passed
					? `${site.slug} is healthy.`
					: `${site.slug} needs attention.`,
				subline: smoke.passed
					? `${site.domain} · all checks passing`
					: `${site.domain} · needs attention`,
				needs,
				tiles: smoke.checks.slice(0, 4).map((c) => ({
					key: c.name,
					label: c.name,
					verdict: c.ok ? "good" : ("act" as const),
					value: c.ok ? "OK" : "Failing",
					detail: c.name,
					help: "From the latest smoke check.",
				})),
				safety: {
					backupText: backup.text,
					backupDetail: backup.detail,
					// Security posture is host-wide, not per-site, and the dedicated
					// host check (server.securityStatus) belongs on the Server page.
					// Surface an honest neutral pointer here rather than a false green
					// claim, and avoid a host-wide probe on every per-site overview load.
					securityText: "See Server & security",
					securityDetail: "Firewall, fail2ban and auto-updates are host-wide.",
				},
				activity: auditToActivity(
					audit.map((r) => ({
						id: r.id,
						action: r.action,
						siteId: r.siteId,
						jobId: r.jobId,
						at: r.at,
					}))
				),
			};
		}),
};
