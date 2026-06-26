import { describe, expect, it, vi } from "vitest";

import type { DetectedSite } from "./sites";
import { buildStagingSyncPlan } from "./sync-plan";

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
			direction: "refreshFromProd",
			readEnvValue,
			site: SITE,
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
			from: "https://demo.test",
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
			readEnvValue,
			site: SITE,
		});

		expect(plan.canApply).toBe(true);
		expect(plan.apply).toEqual({
			procedure: "stagingPushToLive",
			requiresRole: "admin",
		});
		expect(plan.scope).toEqual(["plugins", "themes", "mu-plugins"]);
		expect(plan.urlRewrite).toEqual({ required: false });
		expect(plan.steps).toContain("backup prod before managed file replacement");
		expect(plan.steps).toContain(
			"verify prod smoke and restore backup on failure"
		);
	});

	it("refuses apply when staging is missing or identities collide", async () => {
		const readEnvValue = vi.fn(async () => "https://demo.test");

		const plan = await buildStagingSyncPlan({
			direction: "refreshFromProd",
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
});
