import { beforeAll, describe, expect, it } from "vitest";

let mod: typeof import("./site-overview-recorder");

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	mod = await import("./site-overview-recorder");
});

describe("resolveOverviewRefreshIntervalMs", () => {
	it("returns 0 for unset/blank/off/0/non-numeric values", () => {
		expect(mod.resolveOverviewRefreshIntervalMs(undefined)).toBe(0);
		expect(mod.resolveOverviewRefreshIntervalMs("")).toBe(0);
		expect(mod.resolveOverviewRefreshIntervalMs("off")).toBe(0);
		expect(mod.resolveOverviewRefreshIntervalMs("0")).toBe(0);
		expect(mod.resolveOverviewRefreshIntervalMs("nope")).toBe(0);
	});

	it("clamps minutes into [1, 1440] and converts to ms", () => {
		expect(mod.resolveOverviewRefreshIntervalMs("1")).toBe(60_000);
		expect(mod.resolveOverviewRefreshIntervalMs("5")).toBe(5 * 60_000);
		expect(mod.resolveOverviewRefreshIntervalMs("5000")).toBe(1440 * 60_000);
		expect(mod.resolveOverviewRefreshIntervalMs("2.9")).toBe(2 * 60_000);
	});
});

describe("startSiteOverviewRecorder", () => {
	it("is a no-op when disabled", async () => {
		let listed = false;
		const handle = mod.startSiteOverviewRecorder({
			intervalMs: 0,
			listSites: () => {
				listed = true;
				return Promise.resolve([]);
			},
			refreshPass: () => Promise.resolve(),
		});
		await new Promise((r) => setTimeout(r, 5));
		handle.stop();
		expect(listed).toBe(false);
	});

	it("runs an immediate first refresh pass when enabled", async () => {
		let passes = 0;
		const handle = mod.startSiteOverviewRecorder({
			intervalMs: 60_000,
			listSites: () => Promise.resolve([]),
			refreshPass: () => {
				passes += 1;
				return Promise.resolve();
			},
		});
		await new Promise((r) => setTimeout(r, 20));
		handle.stop();
		expect(passes).toBe(1);
	});
});
