import { describe, expect, it } from "vitest";
import {
	backupConfigQuery,
	healthQuery,
	inventoryQuery,
	logRotationConfigQuery,
	monitoringHistoryQuery,
	monitoringOverviewQuery,
	notifyConfigQuery,
	securityConfigQuery,
	securityRadarQuery,
	securityScoreQuery,
	securityStatusQuery,
	serverInfoQuery,
	sharedDbStatusQuery,
	siteOverviewQuery,
	siteSettingsQuery,
	updatesAvailableQuery,
} from "@/data/queries";
import {
	invalidateBackupConfigSaved,
	invalidateInventoryRefreshed,
	invalidateLogRotationConfigSaved,
	invalidateMonitoringSampleRecorded,
	invalidateMonitoringSummaryRecorded,
	invalidateNotifyConfigSaved,
	invalidateSecurityConfigSaved,
	invalidateSecurityFixSaved,
	invalidateSharedDbInitialized,
	invalidateSharedDbRotated,
	invalidateSiteWwwAliasSaved,
	type QueryClientLike,
} from "./immediate-invalidation";

interface Call {
	filter: Parameters<QueryClientLike["invalidateQueries"]>[0];
}

function makeClient() {
	const calls: Call[] = [];
	const client: QueryClientLike = {
		invalidateQueries: (filter) => {
			calls.push({ filter });
		},
		removeQueries: () => undefined,
	};
	return { calls, client };
}

function matches(
	filter: Call["filter"],
	queryKey: readonly unknown[]
): boolean {
	if ("queryKey" in filter) {
		return JSON.stringify(filter.queryKey) === JSON.stringify(queryKey);
	}
	if ("predicate" in filter) {
		return filter.predicate({ queryKey });
	}
	return false;
}

function hasCall(calls: Call[], queryKey: readonly unknown[]) {
	return calls.some((call) => matches(call.filter, queryKey));
}

describe("immediate mutation invalidation", () => {
	it("invalidates every active backup config query after global R2 saves", () => {
		const { calls, client } = makeClient();

		invalidateBackupConfigSaved(client, "__global__");

		expect(hasCall(calls, backupConfigQuery("__global__").queryKey)).toBe(true);
		expect(hasCall(calls, backupConfigQuery("site-a").queryKey)).toBe(true);
	});

	it("invalidates inventory-derived reads after an insights refresh", () => {
		const { calls, client } = makeClient();

		invalidateInventoryRefreshed(client, "site-a");

		expect(hasCall(calls, inventoryQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, updatesAvailableQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, securityScoreQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, securityRadarQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, siteOverviewQuery("site-a").queryKey)).toBe(true);
	});

	it("refreshes health pages after global notification config saves", () => {
		const { calls, client } = makeClient();

		invalidateNotifyConfigSaved(client);

		expect(hasCall(calls, notifyConfigQuery("__global__").queryKey)).toBe(true);
		expect(hasCall(calls, healthQuery("site-a").queryKey)).toBe(true);
	});

	it("refreshes log rotation and site settings after global log rotation saves", () => {
		const { calls, client } = makeClient();

		invalidateLogRotationConfigSaved(client);

		expect(hasCall(calls, logRotationConfigQuery().queryKey)).toBe(true);
		expect(hasCall(calls, siteSettingsQuery("site-a").queryKey)).toBe(true);
	});

	it("refreshes host security reads after global security config saves", () => {
		const { calls, client } = makeClient();

		invalidateSecurityConfigSaved(client);

		expect(hasCall(calls, securityConfigQuery().queryKey)).toBe(true);
		expect(hasCall(calls, securityStatusQuery().queryKey)).toBe(true);
		expect(hasCall(calls, siteOverviewQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, securityScoreQuery("site-a").queryKey)).toBe(true);
	});

	it("refreshes all monitoring reads after all-sites sampling", () => {
		const { calls, client } = makeClient();

		invalidateMonitoringSummaryRecorded(client);

		expect(hasCall(calls, monitoringOverviewQuery().queryKey)).toBe(true);
		expect(hasCall(calls, monitoringHistoryQuery("site-a", 7).queryKey)).toBe(
			true
		);
		expect(hasCall(calls, siteOverviewQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, healthQuery("site-a").queryKey)).toBe(true);
	});

	it("refreshes one site and global monitoring after one-site sampling", () => {
		const { calls, client } = makeClient();

		invalidateMonitoringSampleRecorded(client, "site-a");

		expect(hasCall(calls, monitoringOverviewQuery().queryKey)).toBe(true);
		expect(hasCall(calls, monitoringHistoryQuery("site-a", 30).queryKey)).toBe(
			true
		);
		expect(hasCall(calls, monitoringHistoryQuery("site-b", 30).queryKey)).toBe(
			false
		);
		expect(hasCall(calls, siteOverviewQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, healthQuery("site-a").queryKey)).toBe(true);
	});

	it("refreshes reachability reads after WWW alias saves", () => {
		const { calls, client } = makeClient();

		invalidateSiteWwwAliasSaved(client, "site-a");

		expect(hasCall(calls, siteSettingsQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, healthQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, siteOverviewQuery("site-a").queryKey)).toBe(true);
	});

	it("refreshes security settings after direct security fixes", () => {
		const { calls, client } = makeClient();

		invalidateSecurityFixSaved(client, "site-a");

		expect(hasCall(calls, securityScoreQuery("site-a").queryKey)).toBe(true);
		expect(hasCall(calls, siteSettingsQuery("site-a").queryKey)).toBe(true);
	});

	it("refreshes shared DB plus server summary only after initialization", () => {
		const { calls, client } = makeClient();

		invalidateSharedDbInitialized(client);
		expect(hasCall(calls, sharedDbStatusQuery().queryKey)).toBe(true);
		expect(hasCall(calls, serverInfoQuery().queryKey)).toBe(true);

		calls.length = 0;
		invalidateSharedDbRotated(client);
		expect(hasCall(calls, sharedDbStatusQuery().queryKey)).toBe(true);
		expect(hasCall(calls, serverInfoQuery().queryKey)).toBe(false);
	});
});
