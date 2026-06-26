import { beforeAll, describe, expect, it } from "vitest";

let mod: typeof import("./site-overview-builder");

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	mod = await import("./site-overview-builder");
});

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

describe("buildLiveSiteOverview", () => {
	it("reuses a fresh persisted monitor sample instead of re-running monitor", async () => {
		const calls: string[] = [];
		const now = Date.parse("2026-06-26T12:00:00.000Z");
		const overview = await mod.buildLiveSiteOverview(site, {
			nowMs: () => now,
			recentAudit: async () => [],
			latestSample: async () => ({
				id: "sample-1",
				siteId: "site-1",
				ts: new Date(now - 60_000),
				status: "ok",
				up: 1,
				httpStatus: 200,
				certDaysLeft: 90,
				dnsOk: 1,
				failures: 0,
				warnings: 0,
				checksJson: JSON.stringify([
					{ name: "HTTP uptime: https://acme.test returned 200", ok: true },
					{ name: "TLS certificate: acme.test valid for 90 day(s)", ok: true },
					{ name: "Disk space: / is 8% used", ok: true },
				]),
			}),
			runVibe: (_dir, _env, op) => {
				calls.push(op);
				if (op === "monitor") {
					throw new Error("monitor should not run with a fresh sample");
				}
				if (op === "smoke") {
					return Promise.resolve({
						stdout: "ok: WordPress reachable\n",
						stderr: "",
						code: 0,
					});
				}
				if (op === "backups") {
					return Promise.resolve({
						stdout:
							"/backups/acme-20260626T110000Z\t1048576\tlocal\tcomplete\n",
						stderr: "",
						code: 0,
					});
				}
				if (op === "wpPluginUpdates") {
					return Promise.resolve({ stdout: "[]", stderr: "", code: 0 });
				}
				if (op === "securityStatus") {
					return Promise.resolve({
						stdout: '{"firewall":true,"fail2ban":true,"autoUpdates":true}',
						stderr: "",
						code: 0,
					});
				}
				throw new Error(`Unexpected op ${op}`);
			},
		});

		expect(calls).not.toContain("monitor");
		expect(overview.status).toBe("good");
		expect(overview.needs).toEqual([]);
	});
});
