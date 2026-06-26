export type QueryGroup =
	| "all-security-scores"
	| "all-site-overviews"
	| "backup-contents"
	| "backup-list"
	| "dev-info"
	| "health"
	| "health-perf"
	| "inventory"
	| "logs"
	| "monitoring"
	| "offsite-verified"
	| "operations"
	| "panel-access"
	| "perf-advice"
	| "remove-site-scoped"
	| "security-radar"
	| "security-score"
	| "server-security"
	| "server-summary"
	| "shared-db"
	| "site-list"
	| "site-overview"
	| "site-settings"
	| "site-status"
	| "staging"
	| "updates";

export interface OperationInvalidationEvent {
	jobId: string;
	phase: "start" | "finish";
	siteId: string;
	uiKind: string;
}

const wpRuntimeGroups: QueryGroup[] = [
	"inventory",
	"updates",
	"security-score",
	"security-radar",
	"health",
	"health-perf",
	"perf-advice",
	"logs",
	"site-status",
];

const backupSnapshotGroups: QueryGroup[] = [
	"backup-list",
	"backup-contents",
	"site-list",
];

const lifecycleGroups: Record<string, QueryGroup[]> = {
	up: [
		"site-status",
		"health",
		"health-perf",
		"perf-advice",
		"logs",
		"dev-info",
		"server-summary",
	],
	restart: [
		"site-status",
		"health",
		"health-perf",
		"perf-advice",
		"logs",
		"dev-info",
		"server-summary",
		"inventory",
		"security-score",
		"security-radar",
	],
	cacheFlush: ["health-perf", "perf-advice", "logs"],
	nginxRecreate: [
		"health",
		"health-perf",
		"perf-advice",
		"logs",
		"dev-info",
		"site-status",
		"server-summary",
	],
	down: [
		"site-status",
		"health",
		"health-perf",
		"perf-advice",
		"logs",
		"dev-info",
		"server-summary",
	],
};

const isPluginKind = (kind: string) =>
	kind === "wp:plugin" || kind.startsWith("wpPlugin");
const isThemeKind = (kind: string) =>
	kind === "wp:theme" || kind.startsWith("wpTheme");

function pushUnique(groups: QueryGroup[], next: QueryGroup[]) {
	for (const group of next) {
		if (!groups.includes(group)) {
			groups.push(group);
		}
	}
}

function terminalGroups(kind: string): QueryGroup[] {
	if (kind in lifecycleGroups) {
		return lifecycleGroups[kind] ?? [];
	}
	if (kind === "backup") {
		return [...backupSnapshotGroups, "server-summary", "logs"];
	}
	if (kind === "backupVerify") {
		return ["offsite-verified", "backup-list", "logs"];
	}
	if (kind === "restore") {
		return [...wpRuntimeGroups, "dev-info", "server-summary"];
	}
	if (kind === "restoreItem") {
		return [
			"health",
			"health-perf",
			"perf-advice",
			"logs",
			"inventory",
			"security-score",
			"security-radar",
		];
	}
	if (kind === "wpUpdate" || isPluginKind(kind) || isThemeKind(kind)) {
		return [
			...wpRuntimeGroups,
			...(kind.includes("Update") ||
			kind === "wpUpdate" ||
			kind === "wp:plugin" ||
			kind === "wp:theme"
				? ["server-summary" as const]
				: []),
		];
	}
	if (kind === "safeUpdate") {
		return [...backupSnapshotGroups, ...wpRuntimeGroups, "server-summary"];
	}
	if (kind === "refresh") {
		return ["staging", "logs", "server-summary"];
	}
	if (kind === "stagingPushToLive") {
		return [
			"staging",
			...backupSnapshotGroups,
			...wpRuntimeGroups,
			"server-summary",
		];
	}
	if (kind === "provision") {
		return [
			"site-list",
			"server-summary",
			"shared-db",
			"monitoring",
			"panel-access",
		];
	}
	if (kind === "attachStaging") {
		return ["staging", "site-list", "server-summary", "logs"];
	}
	if (kind === "removeSite") {
		return [
			"site-list",
			"server-summary",
			"monitoring",
			"shared-db",
			"remove-site-scoped",
		];
	}
	if (kind === "harden") {
		return [
			"server-security",
			"server-summary",
			"all-site-overviews",
			"all-security-scores",
		];
	}
	if (kind === "panel-update") {
		return ["server-summary"];
	}
	if (kind === "perfApply") {
		return [
			...backupSnapshotGroups,
			"site-settings",
			"health",
			"health-perf",
			"perf-advice",
			"logs",
			"dev-info",
			"site-status",
			"server-summary",
		];
	}
	return [];
}

export function groupsForOperationEvent(
	event: OperationInvalidationEvent
): QueryGroup[] {
	const groups: QueryGroup[] = ["operations"];
	if (event.siteId !== "server") {
		groups.push("site-overview");
	}
	if (event.phase === "finish") {
		pushUnique(groups, terminalGroups(event.uiKind));
	}
	return groups;
}
