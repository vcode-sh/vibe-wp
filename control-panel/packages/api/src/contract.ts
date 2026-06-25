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
	cache?: string;
	id: string;
	severity?: "error" | "warn" | "info" | "debug";
	source: "nginx" | "php" | "wp" | "system" | "mariadb" | "redis" | "access";
	text: string;
	whenISO: string;
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

export interface InsightsPlugin {
	/** wp.org `active_installs` count, or null for premium/custom plugins. Optional + nullable for back-compat with drop-files predating the field. */
	active_installs?: number | null;
	auto_update: boolean | null;
	/** wp.org `last_updated` (parseable date string), or null when there's no wp.org metadata. Optional + nullable for back-compat. */
	last_updated?: string | null;
	name: string;
	new_version: string | null;
	slug: string;
	status: "active" | "inactive" | "must-use" | "dropin";
	/** wp.org `tested` WP version, or null. Optional + nullable for back-compat. */
	tested?: string | null;
	update_available: boolean;
	version: string;
}

/** One known-vulnerability row for a plugin slug, sourced from the (optional) CVE feed. */
export interface CveRef {
	/** Affected version constraint tokens (e.g. ["<5.3.1"]); empty = all versions. */
	affected_versions: string[];
	/** First fixed version, or null when no fix is published yet. */
	fixed_in: string | null;
	/** Feed-assigned identifier (CVE id, WPScan uuid, etc). */
	id: string;
	severity: "critical" | "high" | "medium" | "low";
	source_url: string | null;
}

/** A plugin the Security Radar flagged, with reasons + the suggested remediation. */
export interface FlaggedPlugin {
	/** Why an "abandoned" flag fired: stale wp.org date, WP-untested, or both. Null when not abandoned. */
	abandonedEvidence: "stale" | "untested" | "both" | null;
	cves: CveRef[];
	/** Highest severity of the matching CVE rows only (null when no CVE matched). */
	highestSeverity: "critical" | "high" | "medium" | "low" | null;
	lastUpdated: string | null;
	name: string;
	newVersion: string | null;
	reasons: ("outdated" | "abandoned" | "cve")[];
	/** Overall row severity for the GUI — set for EVERY flagged plugin, never null. */
	severity: "critical" | "high" | "medium" | "low";
	slug: string;
	suggestedAction: "update" | "safeUpdate" | "deactivate";
	/** Author's "tested up to" WP version from wp.org, or null when unknown. */
	testedUpTo: string | null;
	version: string;
	/** Minor WP releases the "tested up to" trails the running WP, when that drove the abandoned flag; else null. */
	wpMinorsBehind: number | null;
}

/** The Security Radar result for a site: flagged plugins + rollup counts. */
export interface SecurityRadar {
	flagged: FlaggedPlugin[];
	summary: {
		abandoned: number;
		cve: number;
		highestSeverity: "critical" | "high" | "medium" | "low" | null;
		outdated: number;
		total: number;
	};
}

export interface InsightsTheme {
	auto_update: boolean | null;
	name: string;
	new_version: string | null;
	slug: string;
	status: "active" | "parent" | "inactive";
	update_available: boolean;
	version: string;
}

export interface InsightsHealthIssue {
	description: string;
	label: string;
	test: string;
}

export interface SiteInsights {
	db: { size_bytes: number; engine: string; server_version: string };
	fastcgi_cache: { enabled: boolean };
	generated_at: string;
	object_cache: {
		enabled: boolean;
		type: "redis" | "memcached" | "apcu" | "none";
		dropin_present: boolean;
	};
	php_version: string;
	plugins: InsightsPlugin[];
	schema_version: 1;
	signals: {
		xmlrpc_enabled: boolean;
		file_edit_enabled: boolean;
		debug_on: boolean;
		debug_log_on: boolean;
		debug_display_on: boolean;
		script_debug_on: boolean;
		auto_update_core: "minor" | "major" | "off";
		cron_disabled: boolean;
	};
	site_health: {
		collected_at: string;
		critical: InsightsHealthIssue[];
		recommended: InsightsHealthIssue[];
	};
	site_url: string;
	themes: InsightsTheme[];
	users: { count: number; admin_count: number; last_login: string | null };
	wp_core: {
		version: string;
		update_available: boolean;
		new_version: string | null;
	};
}
