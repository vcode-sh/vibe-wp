import { describe, expect, it, vi } from "vitest";

const { startJob } = vi.hoisted(() => ({
	startJob: vi.fn(async () => ({ jobId: "job-1" })),
}));
const { runVibe } = vi.hoisted(() => ({
	runVibe: vi.fn(async (_dir: string, env: string, _op: string, opts) => {
		await Promise.resolve();
		const key = opts?.args?.[0];
		const values = {
			prod: {
				COMPOSE_PROJECT_NAME: "vibe-demo-prod",
				WP_HOME: "https://demo.test",
			},
			stage: {
				COMPOSE_PROJECT_NAME: "vibe-demo-stage",
				WP_HOME: "https://stage.demo.test",
			},
		} as const;
		return { code: 0, stderr: "", stdout: values[env][key] ?? "" };
	}),
}));
const { findSite } = vi.hoisted(() => ({
	findSite: vi.fn(async () => ({
		caddySlug: "demo",
		domain: "demo.test",
		hasStaging: true,
		id: "demo",
		installDir: "/srv/demo",
		prodPort: 18_080,
		slug: "demo",
		stagePort: 18_081,
		stagingDomain: "stage.demo.test",
	})),
}));
const { startStagingPushToLive } = vi.hoisted(() => ({
	startStagingPushToLive: vi.fn(async () => ({ jobId: "push-1" })),
}));

vi.mock("../core-bridge/exec", () => ({ runVibe }));
vi.mock("../core-bridge/jobs", () => ({ startJob }));
vi.mock("../core-bridge/sites", () => ({ findSite }));
vi.mock("../core-bridge/staging-push", () => ({ startStagingPushToLive }));

import { stagingRouter } from "./staging";

const ctx = { session: { user: { id: "u1", role: "viewer" } } } as never;

describe("stagingRouter sync plan", () => {
	it("returns a read-only plan without launching a staging job", async () => {
		startJob.mockClear();
		startStagingPushToLive.mockClear();

		const plan = await stagingRouter.stagingSyncPlan["~orpc"].handler({
			input: { direction: "pushFilesToLive", siteId: "demo" },
			context: ctx,
		});

		expect(plan.canApply).toBe(true);
		expect(plan.apply).toEqual({
			procedure: "stagingPushToLive",
			requiresRole: "admin",
		});
		expect(plan.scope).toEqual(["plugins", "themes", "mu-plugins"]);
		expect(runVibe).toHaveBeenCalledWith("/srv/demo", "prod", "env", {
			args: ["WP_HOME"],
		});
		expect(startJob).not.toHaveBeenCalled();
		expect(startStagingPushToLive).not.toHaveBeenCalled();
	});
});
