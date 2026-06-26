import { describe, expect, it } from "vitest";
import {
	groupsForOperationEvent,
	type OperationInvalidationEvent,
} from "./invalidation-rules";

function event(
	uiKind: string,
	overrides: Partial<OperationInvalidationEvent> = {}
): OperationInvalidationEvent {
	return {
		jobId: "job-1",
		phase: "finish",
		siteId: "site-a",
		uiKind,
		...overrides,
	};
}

describe("groupsForOperationEvent", () => {
	it("refreshes only universal site-job state on start", () => {
		expect(
			groupsForOperationEvent(event("backup", { phase: "start" }))
		).toEqual(["operations", "site-overview"]);
	});

	it("does not refresh site overview for server-scoped job starts", () => {
		expect(
			groupsForOperationEvent(
				event("harden", { phase: "start", siteId: "server" })
			)
		).toEqual(["operations"]);
	});

	it("maps backup completion to backup, overview, site list, server, and log reads", () => {
		expect(groupsForOperationEvent(event("backup"))).toEqual([
			"operations",
			"site-overview",
			"backup-list",
			"backup-contents",
			"site-list",
			"server-summary",
			"logs",
		]);
	});

	it("handles both UI and backend plugin kinds", () => {
		const expected = [
			"operations",
			"site-overview",
			"inventory",
			"updates",
			"security-score",
			"security-radar",
			"health",
			"health-perf",
			"perf-advice",
			"logs",
			"site-status",
			"server-summary",
		];
		expect(groupsForOperationEvent(event("wp:plugin"))).toEqual(expected);
		expect(groupsForOperationEvent(event("wpPluginUpdate"))).toEqual(expected);
	});

	it("maps server hardening to host-wide security refreshes", () => {
		expect(
			groupsForOperationEvent(event("harden", { siteId: "server" }))
		).toEqual([
			"operations",
			"server-security",
			"server-summary",
			"all-site-overviews",
			"all-security-scores",
		]);
	});

	it("maps remove-site completion to site-level cache removal groups", () => {
		expect(groupsForOperationEvent(event("removeSite"))).toEqual([
			"operations",
			"site-overview",
			"site-list",
			"server-summary",
			"monitoring",
			"shared-db",
			"remove-site-scoped",
		]);
	});

	it("maps provisioning completion to server, database, monitoring, and panel access reads", () => {
		expect(groupsForOperationEvent(event("provision"))).toEqual([
			"operations",
			"site-overview",
			"site-list",
			"server-summary",
			"shared-db",
			"monitoring",
			"panel-access",
		]);
	});
});
