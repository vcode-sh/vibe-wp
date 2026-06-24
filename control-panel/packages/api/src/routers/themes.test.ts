import { describe, expect, it, vi } from "vitest";

const { startJob } = vi.hoisted(() => ({
	startJob: vi.fn(async () => ({ jobId: "job-1" })),
}));
vi.mock("../core-bridge/jobs", () => ({ startJob }));

import { themesRouter } from "./themes";

const ctx = { session: { user: { id: "u1", role: "operator" } } } as never;

describe("themesRouter", () => {
	it("themeActivate starts wpThemeActivate with the slug", async () => {
		startJob.mockClear();
		await themesRouter.themeActivate["~orpc"].handler({
			input: { siteId: "s1", slug: "astra" },
			context: ctx,
		});
		expect(startJob).toHaveBeenCalledWith(
			expect.objectContaining({ op: "wpThemeActivate", args: ["astra"] })
		);
	});

	it("themeUpdate -> wpThemeUpdate; themeAutoUpdate enable -> ...Enable", async () => {
		startJob.mockClear();
		await themesRouter.themeUpdate["~orpc"].handler({
			input: { siteId: "s1", slug: "storefront" },
			context: ctx,
		});
		expect(startJob).toHaveBeenCalledWith(
			expect.objectContaining({ op: "wpThemeUpdate", args: ["storefront"] })
		);
		startJob.mockClear();
		await themesRouter.themeAutoUpdate["~orpc"].handler({
			input: { siteId: "s1", slug: "astra", enabled: true },
			context: ctx,
		});
		expect(startJob).toHaveBeenCalledWith(
			expect.objectContaining({
				op: "wpThemeAutoUpdatesEnable",
				args: ["astra"],
			})
		);
	});

	it("themeDelete rejects a bad slug", () => {
		startJob.mockClear();
		expect(() =>
			themesRouter.themeDelete["~orpc"].handler({
				input: { siteId: "s1", slug: "../evil" },
				context: ctx,
			})
		).toThrow(/Invalid/);
	});
});
