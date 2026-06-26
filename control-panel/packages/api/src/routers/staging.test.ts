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
const operatorCtx = {
	session: { user: { id: "operator-1", role: "operator" } },
} as never;
const adminCtx = {
	session: { user: { id: "admin-1", role: "admin" } },
} as never;
const PUSH_PLAN_ID_RE = /^sync_pushFilesToLive_demo_[a-f0-9]{16}$/;
const ISO_UTC_RE = /Z$/;

describe("stagingRouter sync plan", () => {
	it("returns a read-only plan without launching a staging job", async () => {
		startJob.mockClear();
		startStagingPushToLive.mockClear();

		const plan = await stagingRouter.stagingSyncPlan["~orpc"].handler({
			input: { direction: "pushFilesToLive", siteId: "demo" },
			context: ctx,
		});

		expect(plan.canApply).toBe(true);
		expect(plan.planId).toMatch(PUSH_PLAN_ID_RE);
		expect(plan.expiresAt).toMatch(ISO_UTC_RE);
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

	it("applies a freshly issued refresh plan through the safe refresh job", async () => {
		startJob.mockClear();
		startStagingPushToLive.mockClear();

		const plan = await stagingRouter.stagingSyncPlan["~orpc"].handler({
			input: { direction: "refreshFromProd", siteId: "demo" },
			context: operatorCtx,
		});

		const result = await stagingRouter.stagingSyncApplyPlan["~orpc"].handler({
			input: {
				direction: "refreshFromProd",
				planId: plan.planId,
				siteId: "demo",
			},
			context: operatorCtx,
		});

		expect(result).toEqual({ jobId: "job-1", planId: plan.planId });
		expect(startJob).toHaveBeenCalledWith({
			action: "refresh",
			env: "stage",
			kind: "refresh",
			op: "refresh",
			siteId: "demo",
			userId: "operator-1",
		});
		expect(startStagingPushToLive).not.toHaveBeenCalled();
	});

	it("rejects an unissued plan id before starting a job", async () => {
		startJob.mockClear();
		startStagingPushToLive.mockClear();

		await expect(
			stagingRouter.stagingSyncApplyPlan["~orpc"].handler({
				input: {
					direction: "refreshFromProd",
					planId: "sync_refreshFromProd_demo_deadbeefdeadbeef",
					siteId: "demo",
				},
				context: operatorCtx,
			})
		).rejects.toThrow("Refresh the sync plan");

		expect(startJob).not.toHaveBeenCalled();
		expect(startStagingPushToLive).not.toHaveBeenCalled();
	});

	it("requires admin for a freshly issued push-to-live plan", async () => {
		startJob.mockClear();
		startStagingPushToLive.mockClear();

		const plan = await stagingRouter.stagingSyncPlan["~orpc"].handler({
			input: { direction: "pushFilesToLive", siteId: "demo" },
			context: adminCtx,
		});

		await expect(
			stagingRouter.stagingSyncApplyPlan["~orpc"].handler({
				input: {
					direction: "pushFilesToLive",
					planId: plan.planId,
					siteId: "demo",
				},
				context: operatorCtx,
			})
		).rejects.toThrow("Admin role required");

		const result = await stagingRouter.stagingSyncApplyPlan["~orpc"].handler({
			input: {
				direction: "pushFilesToLive",
				planId: plan.planId,
				siteId: "demo",
			},
			context: adminCtx,
		});

		expect(result).toEqual({ jobId: "push-1", planId: plan.planId });
		expect(startJob).not.toHaveBeenCalled();
		expect(startStagingPushToLive).toHaveBeenCalledWith({
			siteId: "demo",
			userId: "admin-1",
		});
	});
});
