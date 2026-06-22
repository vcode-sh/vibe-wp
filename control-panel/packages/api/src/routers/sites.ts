import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type {
	NeedItem,
	SecurityStatus,
	SiteOverview,
	SiteSummary,
	Verdict,
} from "../contract";
import { auditToActivity } from "../core-bridge/audit";
import { runVibe } from "../core-bridge/exec";
import { recentAudit } from "../core-bridge/jobs-db";
import {
	parseBackups,
	parseMonitorJson,
	parseSecurityStatus,
	parseSmoke,
	parseWpUpdateCount,
} from "../core-bridge/parse";
import {
	backupSignal,
	certNeed,
	diskNeed,
	securityNeed,
	securitySafety,
	updatesNeed,
} from "../core-bridge/site-needs";
import { detectSites, findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

/**
 * Parse the host security posture. The parse throws on unreadable output; treat
 * "couldn't determine" as null ("omit the need"), never as a fake all-off posture.
 */
function readSecurity(stdout: string): SecurityStatus | null {
	try {
		return parseSecurityStatus(stdout);
	} catch {
		return null;
	}
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
			// monitor (one bounded host probe that also yields TLS-expiry + disk),
			// security-status (firewall/fail2ban/auto-updates), and the local audit.
			// All in one bounded fan-out — no stacked or repeated heavy host calls.
			const [smokeRes, backupsRes, updatesRes, monitorRes, securityRes, audit] =
				await Promise.all([
					runVibe(site.installDir, "prod", "smoke", { timeoutMs: 90_000 }),
					runVibe(site.installDir, "prod", "backups"),
					// `compose run --rm wp` can be slow; match smoke's budget so a slow
					// run is not killed → empty stdout → updates need silently suppressed.
					runVibe(site.installDir, "prod", "wpPluginUpdates", {
						timeoutMs: 90_000,
					}),
					runVibe(site.installDir, "prod", "monitor", { timeoutMs: 90_000 }),
					runVibe(site.installDir, "prod", "securityStatus"),
					recentAudit(site.id),
				]);
			const smoke = parseSmoke(smokeRes.stdout);
			const status = smoke.passed ? "good" : ("act" as Verdict);
			const lastBackupISO = parseBackups(backupsRes.stdout)[0]?.whenISO ?? "";
			const backup = backupSignal(lastBackupISO, nowMs);
			const monitorChecks = parseMonitorJson(monitorRes.stdout).checks;
			const security = readSecurity(securityRes.stdout);

			// Each NeedItem reflects a real signal; nulls (no condition / not
			// cheaply knowable) are filtered out.
			const needs: NeedItem[] = [
				updatesNeed(parseWpUpdateCount(updatesRes.stdout)),
				backup.need,
				certNeed(monitorChecks),
				diskNeed(monitorChecks),
				securityNeed(security),
			].filter((n): n is NeedItem => n !== null);

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
					// Security posture is host-wide, not per-site. We already read the
					// real status above, so reflect it honestly: a neutral pointer when
					// it couldn't be determined, otherwise an on/off summary. Never a
					// fabricated green claim.
					...securitySafety(security),
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
