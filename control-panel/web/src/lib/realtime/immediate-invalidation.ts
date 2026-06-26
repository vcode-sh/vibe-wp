import {
	healthQuery,
	inventoryQuery,
	monitoringOverviewQuery,
	notifyConfigQuery,
	securityRadarQuery,
	securityScoreQuery,
	serverInfoQuery,
	sharedDbStatusQuery,
	siteOverviewQuery,
	siteSettingsQuery,
	updatesAvailableQuery,
} from "@/data/queries";
import type { QueryClientLike } from "./query-invalidation";
import { invalidateBackupConfigSaved as invalidateBackupConfigSavedBase } from "./query-invalidation";

export type { QueryClientLike } from "./query-invalidation";

interface QueryLike {
	queryKey: readonly unknown[];
}

function procedure(queryKey: readonly unknown[]): string | null {
	const path = queryKey[0];
	return Array.isArray(path) && typeof path[0] === "string" ? path[0] : null;
}

function input(queryKey: readonly unknown[]): Record<string, unknown> {
	const meta = queryKey[1];
	if (
		typeof meta === "object" &&
		meta !== null &&
		"input" in meta &&
		typeof meta.input === "object" &&
		meta.input !== null
	) {
		return meta.input as Record<string, unknown>;
	}
	return {};
}

function invalidateFamily(
	client: QueryClientLike,
	name: string,
	siteId?: string
) {
	client.invalidateQueries({
		predicate: (query: QueryLike) => {
			if (procedure(query.queryKey) !== name) {
				return false;
			}
			return siteId === undefined || input(query.queryKey).siteId === siteId;
		},
	});
}

export function invalidateBackupConfigSaved(
	client: QueryClientLike,
	siteId: string
) {
	invalidateBackupConfigSavedBase(client, siteId);
}

export function invalidateInventoryRefreshed(
	client: QueryClientLike,
	siteId: string
) {
	client.invalidateQueries(inventoryQuery(siteId));
	client.invalidateQueries(updatesAvailableQuery(siteId));
	client.invalidateQueries(securityScoreQuery(siteId));
	client.invalidateQueries(securityRadarQuery(siteId));
	client.invalidateQueries(siteOverviewQuery(siteId));
}

export function invalidateNotifyConfigSaved(client: QueryClientLike) {
	client.invalidateQueries(notifyConfigQuery("__global__"));
	invalidateFamily(client, "healthReport");
}

export function invalidateMonitoringSummaryRecorded(client: QueryClientLike) {
	client.invalidateQueries(monitoringOverviewQuery());
	invalidateFamily(client, "monitoringHistory");
	invalidateFamily(client, "siteOverview");
	invalidateFamily(client, "healthReport");
}

export function invalidateMonitoringSampleRecorded(
	client: QueryClientLike,
	siteId: string
) {
	client.invalidateQueries(monitoringOverviewQuery());
	invalidateFamily(client, "monitoringHistory", siteId);
	client.invalidateQueries(siteOverviewQuery(siteId));
	client.invalidateQueries(healthQuery(siteId));
}

export function invalidateSiteWwwAliasSaved(
	client: QueryClientLike,
	siteId: string
) {
	client.invalidateQueries(siteSettingsQuery(siteId));
	client.invalidateQueries(healthQuery(siteId));
	client.invalidateQueries(siteOverviewQuery(siteId));
}

export function invalidateSecurityFixSaved(
	client: QueryClientLike,
	siteId: string
) {
	client.invalidateQueries(securityScoreQuery(siteId));
	client.invalidateQueries(siteSettingsQuery(siteId));
}

export function invalidateSharedDbInitialized(client: QueryClientLike) {
	client.invalidateQueries(sharedDbStatusQuery());
	client.invalidateQueries(serverInfoQuery());
}

export function invalidateSharedDbRotated(client: QueryClientLike) {
	client.invalidateQueries(sharedDbStatusQuery());
}
