import type {
	BackupRecord,
	HealthReport,
	LogLine,
	ServerInfo,
	SiteOverview,
	SiteSummary,
	StagingInfo,
} from "./types";

export const siteSummaries: SiteSummary[] = [
	{
		id: "acme-blog",
		name: "acme-blog",
		domain: "acme.com",
		hasStaging: true,
		status: "good",
		lastBackupISO: "2026-06-21T10:00:00Z",
	},
	{
		id: "shop",
		name: "shop",
		domain: "shop.io",
		hasStaging: false,
		status: "watch",
		lastBackupISO: "2026-06-20T12:00:00Z",
	},
	{
		id: "docs",
		name: "docs",
		domain: "docs.dev",
		hasStaging: false,
		status: "good",
		lastBackupISO: "2026-06-21T07:00:00Z",
	},
];

export const serverInfo: ServerInfo = {
	vps: "1 VPS",
	siteCount: 3,
	diskPercent: 41,
	allHealthy: true,
};

const acmeOverview: SiteOverview = {
	siteId: "acme-blog",
	headline: "acme-blog is healthy.",
	status: "good",
	subline: "checked just now · backed up 2h ago · TLS good for 89 days",
	needs: [
		{
			id: "wp-update",
			icon: "update",
			title: "WordPress 7.0.1 is available",
			detail:
				"A small security update. ~20 seconds, and we take a fresh backup first.",
			actionLabel: "Update now",
			reversible: true,
		},
	],
	tiles: [
		{
			key: "health",
			label: "Health",
			verdict: "good",
			value: "Healthy",
			detail: "HTTP 200 · Redis connected",
			help: "All checks return OK and the object cache is connected.",
		},
		{
			key: "speed",
			label: "Speed",
			verdict: "good",
			value: "Fast",
			detail: "TTFB 210ms · cache warm",
			help: "Under ~400ms time-to-first-byte is fast for WordPress.",
		},
		{
			key: "cache",
			label: "Cache",
			verdict: "good",
			value: "Warm",
			detail: "94% hit rate",
			help: "A high hit rate means most requests skip PHP.",
		},
		{
			key: "disk",
			label: "Disk",
			verdict: "good",
			value: "Plenty",
			detail: "41% of 80 GB used",
			help: "Under ~80% leaves room for backups and growth.",
		},
	],
	safety: {
		backupText: "Backed up 2h ago · off-site ✓",
		backupDetail: "Next: tonight 03:00 · keeps 7",
		securityText: "Server secured",
		securityDetail: "Firewall on · auto-updates on",
	},
	activity: [
		{
			id: "a1",
			whenISO: "2026-06-21T10:00:00Z",
			kind: "backup",
			text: "Backed up automatically (off-site ✓)",
			good: true,
		},
		{
			id: "a2",
			whenISO: "2026-06-21T04:00:00Z",
			kind: "health",
			text: "Health check passed — all green",
			good: true,
		},
		{
			id: "a3",
			whenISO: "2026-06-20T15:00:00Z",
			kind: "cache",
			text: "You cleared the cache",
			good: false,
		},
		{
			id: "a4",
			whenISO: "2026-06-18T09:00:00Z",
			kind: "update",
			text: "Plugin “WooCommerce” updated to 9.4",
			good: false,
		},
	],
};

const overviews: Record<string, SiteOverview> = {
	"acme-blog": acmeOverview,
};

export function overviewFor(siteId: string): SiteOverview {
	const found = overviews[siteId];
	if (found) {
		return found;
	}
	return { ...acmeOverview, siteId, headline: `${siteId} is healthy.` };
}

export function healthFor(_siteId: string): HealthReport {
	return {
		tiles: acmeOverview.tiles,
		ttfbMs: 210,
		cacheHitPercent: 94,
		tlsDays: 89,
		uptimePercent: 99.9,
		alertChannels: ["Telegram", "Email"],
	};
}

export function backupsFor(_siteId: string): BackupRecord[] {
	return [
		{
			id: "b1",
			whenISO: "2026-06-21T10:00:00Z",
			sizeMB: 142,
			location: "offsite",
			verified: true,
		},
		{
			id: "b2",
			whenISO: "2026-06-20T03:00:00Z",
			sizeMB: 140,
			location: "offsite",
			verified: true,
		},
		{
			id: "b3",
			whenISO: "2026-06-19T03:00:00Z",
			sizeMB: 139,
			location: "local",
			verified: true,
		},
	];
}

export function logsFor(_siteId: string): LogLine[] {
	return [
		{
			id: "l1",
			whenISO: "2026-06-21T10:42:01Z",
			source: "nginx",
			text: "GET / 200 12ms",
		},
		{
			id: "l2",
			whenISO: "2026-06-21T10:42:03Z",
			source: "php",
			text: "Cron: ran 2 due events",
		},
		{
			id: "l3",
			whenISO: "2026-06-21T10:42:09Z",
			source: "wp",
			text: "Object cache: hit",
		},
	];
}

export function stagingFor(siteId: string): StagingInfo {
	return siteId === "acme-blog"
		? { present: true, url: "staging.acme.com", noindex: true }
		: { present: false, url: null };
}
