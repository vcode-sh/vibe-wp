import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
	findSite,
	kickSiteOverviewRefresh,
	readSiteOverviewSnapshot,
	recentAudit,
	runVibe,
	shouldRefreshSiteOverview,
} = vi.hoisted(() => ({
	findSite: vi.fn(),
	kickSiteOverviewRefresh: vi.fn(),
	readSiteOverviewSnapshot: vi.fn(),
	recentAudit: vi.fn(),
	runVibe: vi.fn(),
	shouldRefreshSiteOverview: vi.fn(),
}));

vi.mock("../core-bridge/sites", () => ({
	detectSites: vi.fn(),
	findSite,
}));

vi.mock("../core-bridge/exec", () => ({
	runVibe,
}));

vi.mock("../core-bridge/jobs-db", () => ({
	recentAudit,
}));

vi.mock("../core-bridge/site-overview-cache", () => ({
	readSiteOverviewSnapshot,
}));

vi.mock("../core-bridge/site-overview-refresher", () => ({
	kickSiteOverviewRefresh,
	shouldRefreshSiteOverview,
}));

let sitesRouter: typeof import("./sites")["sitesRouter"];

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	({ sitesRouter } = await import("./sites"));
});

describe("sitesRouter.siteOverview cache behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findSite.mockResolvedValue({
			id: "site-1",
			slug: "acme",
			domain: "acme.test",
			installDir: "/srv/acme",
			hasStaging: false,
		});
		recentAudit.mockResolvedValue([]);
		readSiteOverviewSnapshot.mockResolvedValue(null);
		runVibe.mockRejectedValue(new Error("host probe should not run"));
		shouldRefreshSiteOverview.mockReturnValue(true);
	});

	it("returns a cheap collecting overview without host probes when no snapshot exists", async () => {
		const result = await sitesRouter.siteOverview["~orpc"].handler({
			input: { siteId: "site-1" },
			context: { session: { user: { id: "user-1" } } },
		});

		expect(result.siteId).toBe("site-1");
		expect(result.status).toBe("watch");
		expect(result.headline).toContain("is being checked");
		expect(kickSiteOverviewRefresh).toHaveBeenCalledOnce();
		expect(runVibe).not.toHaveBeenCalled();
	});
});
