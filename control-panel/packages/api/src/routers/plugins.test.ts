import { describe, expect, it, vi } from "vitest";

// Mock startJob so we assert the op/args without a DB or a real spawn.
// vi.hoisted lets the hoisted vi.mock factory reference this fn safely.
const { startJob } = vi.hoisted(() => ({
	startJob: vi.fn(async () => ({ jobId: "job-1" })),
}));
const { runVibe } = vi.hoisted(() => ({
	runVibe: vi.fn(async () => ({ stdout: "", stderr: "", code: 0 })),
}));
const { findSite } = vi.hoisted(() => ({
	findSite: vi.fn(async () => ({ installDir: "/opt/s1" })),
}));
const { startSafeUpdate } = vi.hoisted(() => ({
	startSafeUpdate: vi.fn(async () => ({ jobId: "safe-1" })),
}));
vi.mock("../core-bridge/jobs", () => ({ startJob }));
vi.mock("../core-bridge/exec", () => ({ runVibe }));
vi.mock("../core-bridge/sites", () => ({ findSite }));
vi.mock("../core-bridge/safe-update", () => ({ startSafeUpdate }));

import { pluginsRouter } from "./plugins";

const ctx = { session: { user: { id: "u1", role: "operator" } } } as never;

describe("pluginsRouter mutations", () => {
	it("pluginUpdate starts a wpPluginUpdate job with the slug", async () => {
		startJob.mockClear();
		await pluginsRouter.pluginUpdate["~orpc"].handler({
			input: { siteId: "s1", slug: "akismet" },
			context: ctx,
		});
		expect(startJob).toHaveBeenCalledWith(
			expect.objectContaining({
				op: "wpPluginUpdate",
				args: ["akismet"],
				siteId: "s1",
				env: "prod",
			})
		);
	});

	it("pluginDeactivate maps to wpPluginDeactivate", async () => {
		startJob.mockClear();
		await pluginsRouter.pluginDeactivate["~orpc"].handler({
			input: { siteId: "s1", slug: "woocommerce" },
			context: ctx,
		});
		expect(startJob).toHaveBeenCalledWith(
			expect.objectContaining({
				op: "wpPluginDeactivate",
				args: ["woocommerce"],
			})
		);
	});

	it("pluginAutoUpdate enable -> wpPluginAutoUpdatesEnable, disable -> ...Disable", async () => {
		startJob.mockClear();
		await pluginsRouter.pluginAutoUpdate["~orpc"].handler({
			input: { siteId: "s1", slug: "redis-cache", enabled: true },
			context: ctx,
		});
		expect(startJob).toHaveBeenCalledWith(
			expect.objectContaining({
				op: "wpPluginAutoUpdatesEnable",
				args: ["redis-cache"],
			})
		);
		startJob.mockClear();
		await pluginsRouter.pluginAutoUpdate["~orpc"].handler({
			input: { siteId: "s1", slug: "redis-cache", enabled: false },
			context: ctx,
		});
		expect(startJob).toHaveBeenCalledWith(
			expect.objectContaining({ op: "wpPluginAutoUpdatesDisable" })
		);
	});

	it("pluginActivate rejects an invalid slug before spawning", () => {
		startJob.mockClear();
		// assertSlug throws synchronously, before startJob is reached.
		expect(() =>
			pluginsRouter.pluginActivate["~orpc"].handler({
				input: { siteId: "s1", slug: "evil; rm -rf /" },
				context: ctx,
			})
		).toThrow(/Invalid/);
		expect(startJob).not.toHaveBeenCalled();
	});

	it("setAutoUpdateSchedule runs autoUpdateScheduleApply with the cadence", async () => {
		runVibe.mockClear();
		const res = await pluginsRouter.setAutoUpdateSchedule["~orpc"].handler({
			input: { siteId: "s1", cadence: "daily" },
			context: ctx,
		});
		expect(findSite).toHaveBeenCalledWith("s1");
		expect(runVibe).toHaveBeenCalledWith(
			"/opt/s1",
			"prod",
			"autoUpdateScheduleApply",
			expect.objectContaining({ args: ["daily"] })
		);
		expect(res).toEqual({ ok: true });
	});

	it("safeUpdate resolves context and starts a safe-update for the target", async () => {
		startSafeUpdate.mockClear();
		await pluginsRouter.safeUpdate["~orpc"].handler({
			input: { siteId: "s1", target: { kind: "plugin", slug: "akismet" } },
			context: ctx,
		});
		expect(startSafeUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				siteId: "s1",
				target: { kind: "plugin", slug: "akismet" },
				userId: "u1",
				r2: false,
			})
		);
	});

	it("safeUpdateAll targets allPlugins", async () => {
		startSafeUpdate.mockClear();
		await pluginsRouter.safeUpdateAll["~orpc"].handler({
			input: { siteId: "s1" },
			context: ctx,
		});
		expect(startSafeUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ target: { kind: "allPlugins" } })
		);
	});

	it("safeUpdate rejects an invalid slug", async () => {
		startSafeUpdate.mockClear();
		await expect(
			pluginsRouter.safeUpdate["~orpc"].handler({
				input: { siteId: "s1", target: { kind: "plugin", slug: "../evil" } },
				context: ctx,
			})
		).rejects.toThrow(/Invalid/);
		expect(startSafeUpdate).not.toHaveBeenCalled();
	});
});
