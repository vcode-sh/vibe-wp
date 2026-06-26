import type {
	NeedItem,
	SecurityStatus,
	SiteOverview,
	Verdict,
} from "../contract";
import { auditToActivity } from "./audit";
import { runVibe } from "./exec";
import { recentAudit } from "./jobs-db";
import {
	parseBackups,
	parseMonitorJson,
	parseSecurityStatus,
	parseSmoke,
	parseWpUpdateCount,
} from "./parse";
import {
	backupSignal,
	certNeed,
	diskNeed,
	securityNeed,
	securitySafety,
	updatesNeed,
} from "./site-needs";
import type { DetectedSite } from "./sites";

const PLUGIN_UPDATES_TITLE_RE = /^(\d+) plugin updates? available$/;

export interface SiteOverviewBuildDeps {
	nowMs?: () => number;
	recentAudit?: typeof recentAudit;
	runVibe?: typeof runVibe;
}

export function pluginUpdatesFromOverview(overview: SiteOverview): number {
	const item = overview.needs.find((need) => need.id === "plugin-updates");
	if (!item) {
		return 0;
	}
	const match = PLUGIN_UPDATES_TITLE_RE.exec(item.title);
	return match ? Number(match[1]) : 0;
}

function readSecurity(stdout: string): SecurityStatus | null {
	try {
		return parseSecurityStatus(stdout);
	} catch {
		return null;
	}
}

export function collectingSiteOverview(site: DetectedSite): SiteOverview {
	return {
		siteId: site.id,
		status: "watch",
		headline: `${site.slug} is being checked.`,
		subline: `${site.domain} · collecting fresh status`,
		needs: [],
		tiles: [
			{
				key: "overview-refresh",
				label: "Status",
				verdict: "watch",
				value: "Checking",
				detail: "Fresh status is being collected.",
				help: "Latest health, backup, update, and security checks.",
			},
		],
		safety: {
			backupText: "Backup status pending",
			backupDetail: "Fresh backup status is being collected.",
			securityText: "Security status pending",
			securityDetail: "Fresh security status is being collected.",
		},
		activity: [],
	};
}

export async function buildLiveSiteOverview(
	site: DetectedSite,
	deps: SiteOverviewBuildDeps = {}
): Promise<SiteOverview> {
	const run = deps.runVibe ?? runVibe;
	const readAudit = deps.recentAudit ?? recentAudit;
	const nowMs = deps.nowMs?.() ?? Date.now();
	const [smokeRes, backupsRes, updatesRes, monitorRes, securityRes, audit] =
		await Promise.all([
			run(site.installDir, "prod", "smoke", { timeoutMs: 90_000 }),
			run(site.installDir, "prod", "backups"),
			run(site.installDir, "prod", "wpPluginUpdates", { timeoutMs: 90_000 }),
			run(site.installDir, "prod", "monitor", { timeoutMs: 90_000 }),
			run(site.installDir, "prod", "securityStatus"),
			readAudit(site.id),
		]);
	const smoke = parseSmoke(smokeRes.stdout);
	const status = smoke.passed ? "good" : ("act" as Verdict);
	const lastBackupISO = parseBackups(backupsRes.stdout)[0]?.whenISO ?? "";
	const backup = backupSignal(lastBackupISO, nowMs);
	const monitorChecks = parseMonitorJson(monitorRes.stdout).checks;
	const security = readSecurity(securityRes.stdout);
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
}
