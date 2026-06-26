import {
	backupConfigQuery,
	backupsQuery,
	devInfoQuery,
	healthPerfQuery,
	healthQuery,
	inventoryQuery,
	offsiteVerifiedQuery,
	panelAccessQuery,
	perfAdviceQuery,
	securityRadarQuery,
	securityScoreQuery,
	securityStatusQuery,
	serverInfoQuery,
	sharedDbStatusQuery,
	siteOverviewQuery,
	siteSettingsQuery,
	siteStatusQuery,
	sitesQuery,
	stagingQuery,
	updatesAvailableQuery,
} from "@/data/queries";
import {
	groupsForOperationEvent,
	type OperationInvalidationEvent,
	type QueryGroup,
} from "./invalidation-rules";

interface QueryLike {
	queryKey: readonly unknown[];
}

type QueryFilter =
	| { predicate: (query: QueryLike) => boolean }
	| { queryKey: readonly unknown[] };

export interface QueryClientLike {
	invalidateQueries: (filter: QueryFilter) => unknown;
	removeQueries: (filter: QueryFilter) => unknown;
}

interface OperationInvalidatorOptions {
	maxSeenEvents?: number;
}

type InputRecord = Record<string, unknown>;

function procedure(queryKey: readonly unknown[]): string | null {
	const path = queryKey[0];
	return Array.isArray(path) && typeof path[0] === "string" ? path[0] : null;
}

function input(queryKey: readonly unknown[]): InputRecord {
	const meta = queryKey[1];
	if (
		typeof meta === "object" &&
		meta !== null &&
		"input" in meta &&
		typeof meta.input === "object" &&
		meta.input !== null
	) {
		return meta.input as InputRecord;
	}
	return {};
}

function matchesProcedure(name: string, siteId?: string) {
	return (query: QueryLike) => {
		if (procedure(query.queryKey) !== name) {
			return false;
		}
		return siteId === undefined || input(query.queryKey).siteId === siteId;
	};
}

function invalidateFamily(
	client: QueryClientLike,
	name: string,
	siteId?: string
) {
	client.invalidateQueries({ predicate: matchesProcedure(name, siteId) });
}

function invalidateAll(client: QueryClientLike, names: string[]) {
	client.invalidateQueries({
		predicate: (query) => names.includes(procedure(query.queryKey) ?? ""),
	});
}

function invalidateSiteScoped(client: QueryClientLike, siteId: string) {
	client.removeQueries({
		predicate: (query) => input(query.queryKey).siteId === siteId,
	});
}

function invalidateGroup(
	client: QueryClientLike,
	group: QueryGroup,
	siteId: string
) {
	switch (group) {
		case "operations":
			return invalidateFamily(client, "operationsList");
		case "site-overview":
			return client.invalidateQueries(siteOverviewQuery(siteId));
		case "all-site-overviews":
			return invalidateFamily(client, "siteOverview");
		case "backup-list":
			return client.invalidateQueries(backupsQuery(siteId));
		case "backup-contents":
			return invalidateFamily(client, "listBackupContents", siteId);
		case "site-list":
			return client.invalidateQueries(sitesQuery());
		case "server-summary":
			return client.invalidateQueries(serverInfoQuery());
		case "logs":
			return invalidateFamily(client, "logsRecent", siteId);
		case "offsite-verified":
			return client.invalidateQueries(offsiteVerifiedQuery(siteId));
		case "panel-access":
			return client.invalidateQueries(panelAccessQuery());
		case "inventory":
			return client.invalidateQueries(inventoryQuery(siteId));
		case "updates":
			return client.invalidateQueries(updatesAvailableQuery(siteId));
		case "security-score":
			return client.invalidateQueries(securityScoreQuery(siteId));
		case "all-security-scores":
			return invalidateFamily(client, "siteSecurityScore");
		case "security-radar":
			return client.invalidateQueries(securityRadarQuery(siteId));
		case "health":
			return client.invalidateQueries(healthQuery(siteId));
		case "health-perf":
			return client.invalidateQueries(healthPerfQuery(siteId));
		case "perf-advice":
			return client.invalidateQueries(perfAdviceQuery(siteId));
		case "site-status":
			return client.invalidateQueries(siteStatusQuery(siteId));
		case "dev-info":
			return client.invalidateQueries(devInfoQuery(siteId));
		case "staging":
			return client.invalidateQueries(stagingQuery(siteId));
		case "monitoring":
			return invalidateAll(client, ["monitoringOverview", "monitoringHistory"]);
		case "shared-db":
			return client.invalidateQueries(sharedDbStatusQuery());
		case "site-settings":
			return client.invalidateQueries(siteSettingsQuery(siteId));
		case "server-security":
			return client.invalidateQueries(securityStatusQuery());
		case "remove-site-scoped":
			return invalidateSiteScoped(client, siteId);
		default:
			return;
	}
}

function runOperationInvalidation(
	client: QueryClientLike,
	event: OperationInvalidationEvent
) {
	for (const group of groupsForOperationEvent(event)) {
		invalidateGroup(client, group, event.siteId);
	}
}

export function createOperationInvalidator(
	client: QueryClientLike,
	options: OperationInvalidatorOptions = {}
) {
	const maxSeenEvents = options.maxSeenEvents ?? 512;
	const seen = new Set<string>();
	function remember(key: string) {
		seen.add(key);
		while (seen.size > maxSeenEvents) {
			const oldest = seen.values().next().value;
			if (typeof oldest !== "string") {
				return;
			}
			seen.delete(oldest);
		}
	}
	function run(event: OperationInvalidationEvent) {
		const key = `${event.phase}:${event.jobId}`;
		if (seen.has(key)) {
			return;
		}
		remember(key);
		runOperationInvalidation(client, event);
	}
	return {
		finish: run,
		start: run,
	};
}

export function invalidateBackupConfigSaved(
	client: QueryClientLike,
	siteId: string
) {
	if (siteId === "__global__") {
		invalidateFamily(client, "backupConfigGet");
		return;
	}
	client.invalidateQueries(backupConfigQuery(siteId));
}
