export type Verdict = "good" | "watch" | "act";

export interface SiteSummary {
	domain: string;
	hasStaging: boolean;
	id: string;
	lastBackupISO: string;
	name: string;
	status?: Verdict;
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
	location: "local" | "offsite" | "both";
	sizeMB: number;
	verified: boolean;
	whenISO: string;
}

export interface HealthReport {
	alertChannels: string[];
	tiles: MetricTile[];
	uptimePercent: number;
}

export interface SecurityStatus {
	autoUpdates: boolean;
	fail2ban: boolean;
	firewall: boolean;
}

export type StagingInfo =
	| { present: true; url: string; noindex: boolean }
	| { present: false; url: null };

export interface LogLine {
	id: string;
	source: "nginx" | "php" | "wp" | "system" | "mariadb" | "redis" | "access";
	text: string;
	whenISO: string;
	severity?: "error" | "warn" | "info" | "debug";
	cache?: string;
}

export interface PerfReport {
	cacheHitPercent: number;
	opcacheHitPercent: number;
	redisHitPercent: number;
	ttfbMs: number;
}

export type JobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "canceled";

export interface Job {
	exitCode: number | null;
	finishedAt: string | null;
	id: string;
	kind: string;
	siteId: string;
	startedAt: string;
	status: JobStatus;
}

export interface StreamEvent {
	done: boolean;
	line: string;
	status: JobStatus;
}

/** Every provisioning procedure returns the tracked job's id for the ops tray. */
export interface ProvisionJobRef {
	jobId: string;
}

/** One persisted operation, enriched with its audit actor, for the history view. */
export interface JobHistoryEntry {
	/** Audit action label, e.g. "backup", "cancel"; null when no audit row exists. */
	action: string | null;
	/** User id of the actor; null when unknown. */
	actorId: string | null;
	/** Display name of the user who triggered the operation; null when unknown. */
	actorName: string | null;
	/** Duration in seconds; null while still running. */
	durationSeconds: number | null;
	exitCode: number | null;
	finishedAt: string | null;
	id: string;
	kind: string;
	siteId: string;
	startedAt: string;
	status: JobStatus;
}

export type PerformancePresetInput =
	| "conservative"
	| "balanced"
	| "high-memory";
export type BackupScheduleInput = "off" | "daily" | "weekly";

/** Shared, validated shape for the new-site + external-services wizards. */
export interface CreateSiteInput {
	adminEmail: string;
	backupSchedule?: BackupScheduleInput;
	domain: string;
	monitorEnabled?: boolean;
	performancePreset?: PerformancePresetInput;
	siteTitle?: string;
	stagingDomain?: string;
	stagingEnabled: boolean;
}

/** createSite + the external DB/Redis connection fields (passwords are secret). */
export interface CreateExternalInput extends CreateSiteInput {
	extDbHost: string;
	extDbName: string;
	extDbPassword: string;
	extDbUser: string;
	extRedisHost: string;
	extRedisPassword: string;
	extRedisPort: string;
}

export interface AttachStagingInput {
	siteId: string;
	stagingDomain: string;
}

export interface RemoveSiteInput {
	purge: boolean;
	siteId: string;
}
