export type Verdict = "good" | "watch" | "act";

export interface SiteSummary {
	domain: string;
	hasStaging: boolean;
	id: string;
	lastBackupISO: string;
	name: string;
	status: Verdict;
}

export interface MetricTile {
	detail: string;
	help: string;
	key: string;
	label: string;
	value: string;
	verdict: Verdict;
}

export interface NeedItem {
	actionLabel: string;
	detail: string;
	icon: "update" | "backup" | "cert" | "disk" | "security";
	id: string;
	reversible: boolean;
	title: string;
}

export interface ActivityEntry {
	good: boolean;
	id: string;
	kind: "backup" | "health" | "cache" | "update" | "deploy";
	text: string;
	whenISO: string;
}

export interface SiteOverview {
	activity: ActivityEntry[];
	headline: string;
	needs: NeedItem[];
	safety: {
		backupText: string;
		backupDetail: string;
		securityText: string;
		securityDetail: string;
	};
	siteId: string;
	status: Verdict;
	subline: string;
	tiles: MetricTile[];
}

export interface ServerInfo {
	allHealthy: boolean;
	diskPercent: number;
	siteCount: number;
	vps: string;
}

export interface BackupRecord {
	id: string;
	location: "local" | "offsite";
	sizeMB: number;
	verified: boolean;
	whenISO: string;
}

export interface HealthReport {
	alertChannels: string[];
	cacheHitPercent: number;
	tiles: MetricTile[];
	tlsDays: number;
	ttfbMs: number;
	uptimePercent: number;
}

export type StagingInfo =
	| { present: true; url: string; noindex: boolean }
	| { present: false; url: null };

export interface LogLine {
	id: string;
	source: "nginx" | "php" | "wp";
	text: string;
	whenISO: string;
}
