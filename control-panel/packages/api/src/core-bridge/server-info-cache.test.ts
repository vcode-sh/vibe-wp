import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let mod: typeof import("./server-info-cache");

const site = {
	id: "site-1",
	slug: "acme",
	caddySlug: "acme",
	domain: "acme.test",
	installDir: "/srv/acme",
	hasStaging: false,
	stagingDomain: null,
	prodPort: 18_080,
	stagePort: null,
};

const snapshot = {
	refreshedAt: new Date(),
	payload: {
		siteId: "site-1",
		status: "good" as const,
		headline: "cached",
		subline: "cached",
		lastBackupISO: "2026-06-25T12:00:00.000Z",
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
};

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	mod = await import("./server-info-cache");
});

beforeEach(() => {
	mod.clearServerInfoCache();
});

describe("readServerInfo", () => {
	it("caches host reads for a short TTL", async () => {
		let now = 1000;
		const deps = {
			detectSites: vi.fn(async () => [site]),
			hostExec: vi.fn(async (argv: string[]) =>
				argv[0] === "df"
					? "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 100 42 58 42% /\n"
					: "test-host\n"
			),
			kickSiteOverviewRefresh: vi.fn(),
			nowMs: () => now,
			readSiteOverviewSnapshot: vi.fn(async () => snapshot),
			shouldRefreshSiteOverview: vi.fn(() => false),
			ttlMs: 5000,
		};

		const first = await mod.readServerInfo(deps);
		now += 1000;
		const second = await mod.readServerInfo(deps);

		expect(first).toEqual(second);
		expect(deps.detectSites).toHaveBeenCalledTimes(1);
		expect(deps.hostExec).toHaveBeenCalledTimes(2);
		expect(deps.kickSiteOverviewRefresh).not.toHaveBeenCalled();
	});

	it("dedupes concurrent reads", async () => {
		const deps = {
			detectSites: vi.fn(async () => [site]),
			hostExec: vi.fn(async (argv: string[]) =>
				argv[0] === "df"
					? "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 100 5 95 5% /\n"
					: "test-host\n"
			),
			kickSiteOverviewRefresh: vi.fn(),
			nowMs: () => 1000,
			readSiteOverviewSnapshot: vi.fn(async () => snapshot),
			shouldRefreshSiteOverview: vi.fn(() => false),
			ttlMs: 5000,
		};

		const [first, second] = await Promise.all([
			mod.readServerInfo(deps),
			mod.readServerInfo(deps),
		]);

		expect(first).toEqual(second);
		expect(deps.detectSites).toHaveBeenCalledTimes(1);
		expect(deps.hostExec).toHaveBeenCalledTimes(2);
	});
});
