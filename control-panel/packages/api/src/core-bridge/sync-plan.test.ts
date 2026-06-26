import { describe, expect, it, vi } from "vitest";

import type { DetectedSite } from "./sites";
import {
	buildStagingSyncPlan,
	clearIssuedStagingSyncPlansForTests,
	isIssuedStagingSyncPlanCurrent,
	issueStagingSyncPlan,
} from "./sync-plan";

const REFRESH_PLAN_ID_RE = /^sync_refreshFromProd_demo_[a-f0-9]{16}$/;
const PUSH_PLAN_ID_RE = /^sync_pushFilesToLive_demo_[a-f0-9]{16}$/;

const SITE: DetectedSite = {
	caddySlug: "demo",
	domain: "demo.test",
	hasStaging: true,
	id: "demo",
	installDir: "/srv/demo",
	prodPort: 18_080,
	slug: "demo",
	stagePort: 18_081,
	stagingDomain: "stage.demo.test",
};

describe("buildStagingSyncPlan", () => {
	it("plans a production-to-staging refresh with backup and URL rewrite", async () => {
		const readEnvValue = vi.fn(async (env: string, key: string) =>
			env === "prod"
				? {
						COMPOSE_PROJECT_NAME: "vibe-demo-prod",
						WP_HOME: "https://demo.test",
					}[key]
				: {
						COMPOSE_PROJECT_NAME: "vibe-demo-stage",
						WP_HOME: "https://stage.demo.test",
					}[key]
		);

		const plan = await buildStagingSyncPlan({
			countUrlOccurrences: async () => 42,
			direction: "refreshFromProd",
			now: new Date("2026-06-26T10:00:00.000Z"),
			readEnvValue,
			site: SITE,
		});

		expect(plan.planId).toMatch(REFRESH_PLAN_ID_RE);
		expect(plan.createdAt).toBe("2026-06-26T10:00:00.000Z");
		expect(plan.expiresAt).toBe("2026-06-26T10:15:00.000Z");
		expect(plan.freshness).toEqual({
			maxAgeMinutes: 15,
			status: "fresh",
		});
		expect(plan.canApply).toBe(true);
		expect(plan.apply).toEqual({
			procedure: "stagingRefresh",
			requiresRole: "operator",
		});
		expect(plan.backup).toEqual({
			env: "prod",
			required: true,
			timing: "before-change",
		});
		expect(plan.scope).toEqual([
			"database",
			"uploads",
			"plugins",
			"themes",
			"mu-plugins",
		]);
		expect(plan.urlRewrite).toEqual({
			estimatedOccurrences: 42,
			from: "https://demo.test",
			preview:
				"Replace 42 occurrence(s) of https://demo.test with https://stage.demo.test during staging restore.",
			required: true,
			to: "https://stage.demo.test",
		});
		expect(readEnvValue).toHaveBeenCalledTimes(4);
	});

	it("plans staging-to-production file promotion without database or uploads", async () => {
		const readEnvValue = vi.fn(async (env: string, key: string) =>
			env === "prod"
				? {
						COMPOSE_PROJECT_NAME: "vibe-demo-prod",
						WP_HOME: "https://demo.test",
					}[key]
				: {
						COMPOSE_PROJECT_NAME: "vibe-demo-stage",
						WP_HOME: "https://stage.demo.test",
					}[key]
		);

		const plan = await buildStagingSyncPlan({
			direction: "pushFilesToLive",
			now: new Date("2026-06-26T10:00:00.000Z"),
			readEnvValue,
			site: SITE,
		});

		expect(plan.canApply).toBe(true);
		expect(plan.apply).toEqual({
			procedure: "stagingPushToLive",
			requiresRole: "admin",
		});
		expect(plan.scope).toEqual(["plugins", "themes", "mu-plugins"]);
		expect(plan.planId).toMatch(PUSH_PLAN_ID_RE);
		expect(plan.urlRewrite).toEqual({
			estimatedOccurrences: 0,
			preview: "No URL rewrite is planned for managed-file promotion.",
			required: false,
		});
		expect(plan.steps).toContain("backup prod before managed file replacement");
		expect(plan.steps).toContain(
			"verify prod smoke and restore backup on failure"
		);
	});

	it("refuses apply when staging is missing or identities collide", async () => {
		const readEnvValue = vi.fn(async () => "https://demo.test");

		const plan = await buildStagingSyncPlan({
			direction: "refreshFromProd",
			now: new Date("2026-06-26T10:00:00.000Z"),
			readEnvValue,
			site: { ...SITE, hasStaging: false, stagingDomain: null },
		});

		expect(plan.canApply).toBe(false);
		expect(plan.conflicts).toEqual([
			"missing-staging",
			"identical-wp-home",
			"identical-compose-project",
		]);
		expect(plan.apply).toBeNull();
	});

	it("tracks issued plan ids until expiry", async () => {
		clearIssuedStagingSyncPlansForTests();
		const plan = await buildStagingSyncPlan({
			direction: "pushFilesToLive",
			now: new Date("2026-06-26T10:00:00.000Z"),
			readEnvValue: async (env, key) =>
				env === "prod"
					? {
							COMPOSE_PROJECT_NAME: "vibe-demo-prod",
							WP_HOME: "https://demo.test",
						}[key]
					: {
							COMPOSE_PROJECT_NAME: "vibe-demo-stage",
							WP_HOME: "https://stage.demo.test",
						}[key],
			site: SITE,
		});

		issueStagingSyncPlan(plan);

		expect(
			isIssuedStagingSyncPlanCurrent(
				plan.planId,
				new Date("2026-06-26T10:14:59.000Z")
			)
		).toBe(true);
		expect(
			isIssuedStagingSyncPlanCurrent(
				plan.planId,
				new Date("2026-06-26T10:15:01.000Z")
			)
		).toBe(false);
	});
});
