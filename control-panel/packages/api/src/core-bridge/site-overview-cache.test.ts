import { beforeAll, describe, expect, it } from "vitest";

interface LibsqlClient {
	execute: (sql: string) => Promise<unknown>;
}

let mod: typeof import("./site-overview-cache");

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	const dbModule = await import("@control-panel/db");
	const client = (dbModule.db as { $client: LibsqlClient }).$client;
	await client.execute(
		"CREATE TABLE site_overview_cache (site_id TEXT PRIMARY KEY, payload TEXT NOT NULL, refreshed_at INTEGER NOT NULL DEFAULT 0)"
	);

	mod = await import("./site-overview-cache");
});

describe("site overview cache", () => {
	it("round-trips the latest overview snapshot", async () => {
		await mod.writeSiteOverviewSnapshot("site-1", {
			siteId: "site-1",
			status: "good",
			headline: "acme is healthy.",
			subline: "acme.test · all checks passing",
			needs: [],
			tiles: [],
			safety: {
				backupText: "Recent backup",
				backupDetail: "Latest backup recorded.",
				securityText: "Security status unknown",
				securityDetail: "Security status has not been checked yet.",
			},
			activity: [],
		});

		const snapshot = await mod.readSiteOverviewSnapshot("site-1");
		expect(snapshot?.payload.headline).toBe("acme is healthy.");
		expect(snapshot?.refreshedAt).toBeInstanceOf(Date);
	});

	it("returns null when a snapshot does not exist", async () => {
		expect(await mod.readSiteOverviewSnapshot("missing")).toBeNull();
	});
});
