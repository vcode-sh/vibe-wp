import { describe, expect, it } from "vitest";
import {
	backupConfigQuery,
	backupContentsQuery,
	backupsQuery,
	devInfoQuery,
	healthQuery,
	inventoryQuery,
	logsQuery,
	monitoringHistoryQuery,
	operationsListQuery,
	panelAccessQuery,
	securityRadarQuery,
	securityScoreQuery,
	serverInfoQuery,
	siteOverviewQuery,
	siteSettingsQuery,
	siteStatusQuery,
	sitesQuery,
	stagingQuery,
	updatesAvailableQuery,
} from "@/data/queries";
import {
	createOperationInvalidator,
	invalidateBackupConfigSaved,
	type QueryClientLike,
} from "./query-invalidation";

interface Call {
	filter: Parameters<QueryClientLike["invalidateQueries"]>[0];
	type: "invalidate" | "remove";
}

function makeClient() {
	const calls: Call[] = [];
	const client: QueryClientLike = {
		invalidateQueries: (filter) => {
			calls.push({ filter, type: "invalidate" });
		},
		removeQueries: (filter) => {
			calls.push({ filter, type: "remove" });
		},
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

function hasCall(
	calls: Call[],
	type: Call["type"],
	queryKey: readonly unknown[]
) {
	return calls.some(
		(call) => call.type === type && matches(call.filter, queryKey)
	);
}

describe("query invalidation", () => {
	it("invalidates all backup completion reads including dynamic query families", () => {
		const { calls, client } = makeClient();
		const invalidator = createOperationInvalidator(client);

		invalidator.finish({
			jobId: "job-backup",
			phase: "finish",
			siteId: "site-a",
			uiKind: "backup",
		});

		expect(hasCall(calls, "invalidate", operationsListQuery().queryKey)).toBe(
			true
		);
		expect(
			hasCall(
				calls,
				"invalidate",
				operationsListQuery({ siteId: "site-a" }).queryKey
			)
		).toBe(true);
		expect(
			hasCall(calls, "invalidate", siteOverviewQuery("site-a").queryKey)
		).toBe(true);
		expect(hasCall(calls, "invalidate", backupsQuery("site-a").queryKey)).toBe(
			true
		);
		expect(
			hasCall(
				calls,
				"invalidate",
				backupContentsQuery("site-a", "backup-1").queryKey
			)
		).toBe(true);
		expect(hasCall(calls, "invalidate", sitesQuery().queryKey)).toBe(true);
		expect(hasCall(calls, "invalidate", serverInfoQuery().queryKey)).toBe(true);
		expect(
			hasCall(
				calls,
				"invalidate",
				logsQuery("site-a", { service: "nginx" }).queryKey
			)
		).toBe(true);
		expect(
			hasCall(calls, "invalidate", inventoryQuery("site-a").queryKey)
		).toBe(false);
	});

	it("deduplicates the same terminal job event", () => {
		const { calls, client } = makeClient();
		const invalidator = createOperationInvalidator(client);
		const event = {
			jobId: "job-1",
			phase: "finish" as const,
			siteId: "site-a",
			uiKind: "backup",
		};

		invalidator.finish(event);
		const firstCount = calls.length;
		invalidator.finish(event);

		expect(calls).toHaveLength(firstCount);
	});

	it("bounds terminal-event dedupe memory and evicts old entries", () => {
		const { calls, client } = makeClient();
		const invalidator = createOperationInvalidator(client, {
			maxSeenEvents: 2,
		});
		const event = (jobId: string) => ({
			jobId,
			phase: "finish" as const,
			siteId: "site-a",
			uiKind: "backup",
		});

		invalidator.finish(event("job-1"));
		invalidator.finish(event("job-2"));
		invalidator.finish(event("job-3"));
		const afterThree = calls.length;
		invalidator.finish(event("job-1"));

		expect(calls.length).toBeGreaterThan(afterThree);
	});

	it("removes site-scoped query cache after site removal", () => {
		const { calls, client } = makeClient();
		const invalidator = createOperationInvalidator(client);

		invalidator.finish({
			jobId: "job-remove",
			phase: "finish",
			siteId: "site-a",
			uiKind: "removeSite",
		});

		const removedSiteQueries = [
			siteOverviewQuery("site-a").queryKey,
			inventoryQuery("site-a").queryKey,
			healthQuery("site-a").queryKey,
			monitoringHistoryQuery("site-a", 30).queryKey,
			logsQuery("site-a", { service: "php" }).queryKey,
			securityScoreQuery("site-a").queryKey,
			securityRadarQuery("site-a").queryKey,
			updatesAvailableQuery("site-a").queryKey,
			siteSettingsQuery("site-a").queryKey,
			siteStatusQuery("site-a").queryKey,
			devInfoQuery("site-a").queryKey,
			stagingQuery("site-a").queryKey,
		];
		for (const queryKey of removedSiteQueries) {
			expect(hasCall(calls, "remove", queryKey)).toBe(true);
		}
		expect(hasCall(calls, "remove", siteOverviewQuery("site-b").queryKey)).toBe(
			false
		);
	});

	it("invalidates panel access after provisioning finishes", () => {
		const { calls, client } = makeClient();
		const invalidator = createOperationInvalidator(client);

		invalidator.finish({
			jobId: "job-provision",
			phase: "finish",
			siteId: "site-new",
			uiKind: "provision",
		});

		expect(hasCall(calls, "invalidate", panelAccessQuery().queryKey)).toBe(
			true
		);
	});

	it("invalidates every active backup config query after global R2 config changes", () => {
		const { calls, client } = makeClient();

		invalidateBackupConfigSaved(client, "__global__");

		expect(
			hasCall(calls, "invalidate", backupConfigQuery("__global__").queryKey)
		).toBe(true);
		expect(
			hasCall(calls, "invalidate", backupConfigQuery("site-a").queryKey)
		).toBe(true);
	});
});
