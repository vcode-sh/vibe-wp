import { beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// DB-backed test for monitor-history.ts (insert/select/prune). Mirrors the
// setup in jobs-db.test.ts: set env BEFORE any import, point DATABASE_URL at a
// shared in-memory libsql DB, dynamically import the db package, create just the
// monitor_samples table via the raw libsql client, then import the module.
// ---------------------------------------------------------------------------

interface LibsqlClient {
	execute: (sql: string) => Promise<unknown>;
}

let mod: typeof import("./monitor-history");

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	const dbModule = await import("@control-panel/db");
	const client = (dbModule.db as { $client: LibsqlClient }).$client;

	// Columns mirror the drizzle schema (snake_case, timestamp_ms integers).
	await client.execute(
		"CREATE TABLE monitor_samples (id TEXT PRIMARY KEY, site_id TEXT NOT NULL, ts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, up INTEGER NOT NULL, http_status INTEGER, cert_days_left INTEGER, dns_ok INTEGER, failures INTEGER NOT NULL, warnings INTEGER NOT NULL, checks_json TEXT)"
	);

	mod = await import("./monitor-history");
});

const SITE = "acme";

describe("recordMonitorSample + monitoringHistory + latestSample", () => {
	it("inserts a derived row and reads it back oldest-first", async () => {
		const recorded = await mod.recordMonitorSample(SITE, {
			status: "warn",
			failures: 0,
			warnings: 1,
			uptimePercent: 100,
			checks: [
				{ name: "HTTP uptime: https://acme.test/ returned 200", ok: true },
				{ name: "TLS certificate: acme.test expires in 9 day(s)", ok: false },
			],
		});
		expect(recorded.up).toBe(1);
		expect(recorded.httpStatus).toBe(200);
		expect(recorded.certDaysLeft).toBe(9);
		expect(recorded.dnsOk).toBe(1);
		expect(recorded.checksJson).toContain("TLS certificate");

		const history = await mod.monitoringHistory({ siteId: SITE, sinceDays: 7 });
		expect(history.length).toBeGreaterThanOrEqual(1);
		const last = history.at(-1);
		expect(last?.status).toBe("warn");
		expect(last?.certDaysLeft).toBe(9);
	});

	it("derives up=0 and approximate dnsOk=0 for an unreachable site", async () => {
		const recorded = await mod.recordMonitorSample(SITE, {
			status: "fail",
			failures: 1,
			warnings: 0,
			uptimePercent: 0,
			checks: [
				{ name: "HTTP uptime: https://acme.test/ returned 000", ok: false },
			],
		});
		expect(recorded.up).toBe(0);
		expect(recorded.dnsOk).toBe(0);

		const latest = await mod.latestSample(SITE);
		expect(latest?.up).toBe(0);
		expect(latest?.status).toBe("fail");
	});

	it("scopes history to the requested site", async () => {
		await mod.recordMonitorSample("other", {
			status: "ok",
			failures: 0,
			warnings: 0,
			uptimePercent: 100,
			checks: [
				{ name: "HTTP uptime: https://other.test/ returned 200", ok: true },
			],
		});
		const acme = await mod.monitoringHistory({ siteId: SITE, sinceDays: 30 });
		expect(acme.every((r) => r.siteId === SITE)).toBe(true);
	});

	it("returns null from latestSample for an unknown site", async () => {
		expect(await mod.latestSample("nope")).toBeNull();
	});
});

describe("pruneMonitorSamples", () => {
	it("deletes rows older than the retention window", async () => {
		const dbModule = await import("@control-panel/db");
		const client = (dbModule.db as { $client: LibsqlClient }).$client;
		// Insert a very old row (200 days ago) directly, then prune.
		const oldTs = Date.now() - 200 * 24 * 60 * 60 * 1000;
		await client.execute(
			`INSERT INTO monitor_samples (id, site_id, ts, status, up, failures, warnings) VALUES ('old-1', '${SITE}', ${oldTs}, 'ok', 1, 0, 0)`
		);
		await mod.pruneMonitorSamples();
		const after = await mod.monitoringHistory({ siteId: SITE, sinceDays: 90 });
		expect(after.some((r) => r.id === "old-1")).toBe(false);
	});
});
