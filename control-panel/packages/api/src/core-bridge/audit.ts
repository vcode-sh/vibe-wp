import type { ActivityEntry } from "../contract";

export interface AuditRow {
	action: string;
	at: Date;
	id: string;
	jobId: string | null;
	siteId: string | null;
}

const KIND: Record<string, ActivityEntry["kind"]> = {
	backup: "backup",
	restore: "backup",
	backupVerify: "backup",
	cacheFlush: "cache",
	wpUpdate: "update",
	smoke: "health",
	monitor: "health",
};

export function actionToKind(action: string): ActivityEntry["kind"] {
	return KIND[action] ?? "deploy";
}

const LABEL: Record<string, string> = {
	backup: "Backed up",
	restore: "Restored a backup",
	backupVerify: "Verified a backup",
	cacheFlush: "Cleared the cache",
	refresh: "Copied live to staging",
	promote: "Published staging to live",
	harden: "Secured the server",
	wpUpdate: "Ran updates",
	up: "Started the site",
	down: "Stopped the site",
	restart: "Restarted the site",
};

export function auditToActivity(rows: AuditRow[]): ActivityEntry[] {
	return rows.map((r) => ({
		id: r.id,
		kind: actionToKind(r.action),
		text: LABEL[r.action] ?? r.action,
		whenISO: r.at.toISOString(),
		good: r.action !== "down",
	}));
}
