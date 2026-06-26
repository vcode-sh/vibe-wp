import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
	findSite,
	kickSiteOverviewRefresh,
	readSiteOverviewSnapshot,
	runVibe,
	shouldRefreshSiteOverview,
} = vi.hoisted(() => ({
	findSite: vi.fn(),
	kickSiteOverviewRefresh: vi.fn(),
	readSiteOverviewSnapshot: vi.fn(),
	runVibe: vi.fn(),
	shouldRefreshSiteOverview: vi.fn(),
}));

vi.mock("../core-bridge/sites", () => ({ findSite }));
vi.mock("../core-bridge/exec", () => ({ runVibe }));
vi.mock("../core-bridge/site-overview-cache", () => ({
	readSiteOverviewSnapshot,
}));
vi.mock("../core-bridge/site-overview-refresher", () => ({
	kickSiteOverviewRefresh,
	shouldRefreshSiteOverview,
}));

let updatesRouter: typeof import("./updates")["updatesRouter"];

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	({ updatesRouter } = await import("./updates"));
});

describe("updatesAvailable cache behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findSite.mockResolvedValue({
			id: "site-1",
			slug: "acme",
			domain: "acme.test",
			installDir: "/srv/acme",
			hasStaging: false,
		});
		runVibe.mockRejectedValue(new Error("host probe should not run"));
		shouldRefreshSiteOverview.mockReturnValue(false);
	});

	it("returns plugin update count from the overview snapshot without host probes", async () => {
		readSiteOverviewSnapshot.mockResolvedValue({
			refreshedAt: new Date(),
			payload: {
				siteId: "site-1",
				status: "watch",
				headline: "acme needs attention.",
				subline: "acme.test · needs attention",
				needs: [
					{
						id: "plugin-updates",
						icon: "update",
						title: "3 plugin updates available",
						detail: "Apply pending plugin updates to stay patched.",
						actionLabel: "Update plugins",
						reversible: false,
					},
				],
				tiles: [],
				safety: {
					backupText: "Recent backup",
					backupDetail: "Backups are current.",
					securityText: "Protections on",
					securityDetail: "Firewall on · fail2ban on · auto-updates on.",
				},
				activity: [],
			},
		});

		const result = await updatesRouter.updatesAvailable["~orpc"].handler({
			input: { siteId: "site-1" },
			context: { session: { user: { id: "user-1" } } },
		});

		expect(result).toEqual({ plugins: 3 });
		expect(runVibe).not.toHaveBeenCalled();
	});

	it("returns zero and kicks a refresh when no snapshot exists yet", async () => {
		readSiteOverviewSnapshot.mockResolvedValue(null);
		shouldRefreshSiteOverview.mockReturnValue(true);

		const result = await updatesRouter.updatesAvailable["~orpc"].handler({
			input: { siteId: "site-1" },
			context: { session: { user: { id: "user-1" } } },
		});

		expect(result).toEqual({ plugins: 0 });
		expect(kickSiteOverviewRefresh).toHaveBeenCalledOnce();
		expect(runVibe).not.toHaveBeenCalled();
	});
});
