import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
	detectSites,
	findSite,
	kickSiteOverviewRefresh,
	readSiteOverviewSnapshot,
	recentAudit,
	runVibe,
	shouldRefreshSiteOverview,
} = vi.hoisted(() => ({
	detectSites: vi.fn(),
	findSite: vi.fn(),
	kickSiteOverviewRefresh: vi.fn(),
	readSiteOverviewSnapshot: vi.fn(),
	recentAudit: vi.fn(),
	runVibe: vi.fn(),
	shouldRefreshSiteOverview: vi.fn(),
}));

vi.mock("../core-bridge/sites", () => ({
	detectSites,
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

const fakeContext = { session: { user: { id: "user-1" } } } as never;

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

describe("sitesRouter.sitesList cache behavior", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		detectSites.mockResolvedValue([
			{
				id: "site-1",
				slug: "acme",
				domain: "acme.test",
				installDir: "/srv/acme",
				hasStaging: false,
			},
			{
				id: "site-2",
				slug: "shop",
				domain: "shop.test",
				installDir: "/srv/shop",
				hasStaging: true,
			},
		]);
		shouldRefreshSiteOverview.mockReturnValue(false);
		runVibe.mockRejectedValue(new Error("host probe should not run"));
	});

	it("builds summaries from overview snapshots without backup probes", async () => {
		readSiteOverviewSnapshot.mockImplementation(async (siteId: string) => ({
			refreshedAt: new Date(),
			payload: {
				siteId,
				status: siteId === "site-1" ? "good" : "watch",
				headline: "cached",
				subline: "cached",
				lastBackupISO:
					siteId === "site-1"
						? "2026-06-25T12:00:00.000Z"
						: "2026-06-24T12:00:00.000Z",
				needs: [],
				tiles: [],
				safety: {
					backupText: "Recent backup",
					backupDetail: "Backups are current.",
					securityText: "Protections on",
					securityDetail: "Firewall on.",
				},
				activity: [],
			},
		}));

		const result = await sitesRouter.sitesList["~orpc"].handler({
			context: fakeContext,
			input: undefined,
		});

		expect(result).toEqual([
			{
				id: "site-1",
				name: "acme",
				domain: "acme.test",
				hasStaging: false,
				status: "good",
				lastBackupISO: "2026-06-25T12:00:00.000Z",
			},
			{
				id: "site-2",
				name: "shop",
				domain: "shop.test",
				hasStaging: true,
				status: "watch",
				lastBackupISO: "2026-06-24T12:00:00.000Z",
			},
		]);
		expect(runVibe).not.toHaveBeenCalled();
	});

	it("returns a cheap watch summary and kicks a refresh when a snapshot is missing", async () => {
		readSiteOverviewSnapshot.mockResolvedValue(null);
		shouldRefreshSiteOverview.mockReturnValue(true);

		const result = await sitesRouter.sitesList["~orpc"].handler({
			context: fakeContext,
			input: undefined,
		});

		expect(result[0]).toMatchObject({
			id: "site-1",
			status: "watch",
			lastBackupISO: "",
		});
		expect(kickSiteOverviewRefresh).toHaveBeenCalledTimes(2);
		expect(runVibe).not.toHaveBeenCalled();
	});
});
