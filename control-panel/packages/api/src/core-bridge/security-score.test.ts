import { describe, expect, it } from "vitest";
import type { SecurityStatus, SiteInsights } from "../contract";
import { computeSecurityScore } from "./security-score";

/** A fully-secure baseline site: no findings should fire. */
function cleanInsights(over: Partial<SiteInsights> = {}): SiteInsights {
	return {
		db: { size_bytes: 1, engine: "MariaDB", server_version: "12.3" },
		fastcgi_cache: { enabled: true },
		generated_at: "2026-06-25T00:00:00Z",
		object_cache: { enabled: true, type: "redis", dropin_present: true },
		php_version: "8.5",
		plugins: [],
		schema_version: 1,
		signals: {
			xmlrpc_enabled: false,
			file_edit_enabled: false,
			debug_on: false,
			debug_log_on: false,
			debug_display_on: false,
			script_debug_on: false,
			auto_update_core: "minor",
			cron_disabled: true,
		},
		site_health: {
			collected_at: "2026-06-25T00:00:00Z",
			critical: [],
			recommended: [],
		},
		site_url: "https://example.test",
		themes: [],
		users: { count: 1, admin_count: 1, last_login: null },
		wp_core: { version: "7.0", update_available: false, new_version: null },
		...over,
	};
}

const cleanHost: SecurityStatus = {
	firewall: true,
	fail2ban: true,
	autoUpdates: true,
};

describe("computeSecurityScore", () => {
	it("scores a clean site 100 / grade A with no findings", () => {
		const r = computeSecurityScore(cleanInsights(), cleanHost);
		expect(r.score).toBe(100);
		expect(r.grade).toBe("A");
		expect(r.findings).toHaveLength(0);
	});

	it("flags debug-display-on as a high finding with the disableDebugDisplay fix", () => {
		const r = computeSecurityScore(
			cleanInsights({
				signals: { ...cleanInsights().signals, debug_display_on: true },
			}),
			cleanHost
		);
		const f = r.findings.find((x) => x.id === "wp-debug-display");
		expect(f?.severity).toBe("high");
		expect(f?.fix).toEqual({ kind: "disableDebugDisplay" });
		expect(r.score).toBe(80);
	});

	it("flags outdated core with updateCore", () => {
		const r = computeSecurityScore(
			cleanInsights({
				wp_core: { version: "6.9", update_available: true, new_version: "7.0" },
			}),
			cleanHost
		);
		expect(r.findings.find((x) => x.id === "wp-core-outdated")?.fix).toEqual({
			kind: "updateCore",
		});
	});

	it("flags only ACTIVE outdated plugins and lists their slugs", () => {
		const r = computeSecurityScore(
			cleanInsights({
				plugins: [
					{
						slug: "akismet",
						name: "Akismet",
						version: "5.0",
						new_version: "5.3",
						update_available: true,
						status: "active",
						auto_update: false,
					},
					{
						slug: "old-inactive",
						name: "Old",
						version: "1.0",
						new_version: "2.0",
						update_available: true,
						status: "inactive",
						auto_update: false,
					},
				],
			}),
			cleanHost
		);
		const f = r.findings.find((x) => x.id === "wp-plugins-outdated");
		expect(f?.fix).toEqual({ kind: "updatePlugins", slugs: ["akismet"] });
		expect(f?.title).toContain("1 active plugin");
	});

	it("flags xmlrpc + file-edit with their fixes", () => {
		const r = computeSecurityScore(
			cleanInsights({
				signals: {
					...cleanInsights().signals,
					xmlrpc_enabled: true,
					file_edit_enabled: true,
				},
			}),
			cleanHost
		);
		expect(r.findings.find((x) => x.id === "wp-xmlrpc")?.fix).toEqual({
			kind: "disableXmlRpc",
		});
		expect(r.findings.find((x) => x.id === "wp-file-edit")?.fix).toEqual({
			kind: "disableFileEdit",
		});
		expect(r.score).toBe(84); // 100 - 8 - 8
	});

	it("flags critical Site Health issues (informational, no fix)", () => {
		const r = computeSecurityScore(
			cleanInsights({
				site_health: {
					collected_at: "2026-06-25T00:00:00Z",
					critical: [
						{ label: "HTTPS not enforced", description: "", test: "https" },
					],
					recommended: [],
				},
			}),
			cleanHost
		);
		const f = r.findings.find((x) => x.id === "wp-site-health");
		expect(f?.fix).toBeNull();
		expect(f?.detail).toContain("HTTPS not enforced");
	});

	it("flags host findings with hardenHost and omits them when host is absent", () => {
		const badHost: SecurityStatus = {
			firewall: false,
			fail2ban: false,
			autoUpdates: false,
		};
		const withHost = computeSecurityScore(cleanInsights(), badHost);
		expect(withHost.findings.map((f) => f.id).sort()).toEqual([
			"host-auto-updates",
			"host-fail2ban",
			"host-firewall",
		]);
		expect(withHost.score).toBe(70); // 100 - 15 - 10 - 5

		const noHost = computeSecurityScore(cleanInsights());
		expect(noHost.findings).toHaveLength(0);
		expect(noHost.score).toBe(100);
	});

	it("floors a maximally-bad site at 0 / grade F and sorts by severity", () => {
		const r = computeSecurityScore(
			cleanInsights({
				signals: {
					...cleanInsights().signals,
					debug_display_on: true,
					xmlrpc_enabled: true,
					file_edit_enabled: true,
				},
				wp_core: { version: "5.0", update_available: true, new_version: "7.0" },
				plugins: Array.from({ length: 6 }, (_unused, i) => ({
					slug: `p${i}`,
					name: `P${i}`,
					version: "1.0",
					new_version: "2.0",
					update_available: true,
					status: "active" as const,
					auto_update: false,
				})),
				site_health: {
					collected_at: "2026-06-25T00:00:00Z",
					critical: [
						{ label: "a", description: "", test: "a" },
						{ label: "b", description: "", test: "b" },
						{ label: "c", description: "", test: "c" },
					],
					recommended: [],
				},
			}),
			{ firewall: false, fail2ban: false, autoUpdates: false }
		);
		expect(r.score).toBe(0);
		expect(r.grade).toBe("F");
		// sorted: highs before mediums before lows
		const sevs = r.findings.map((f) => f.severity);
		const firstLow = sevs.indexOf("low");
		const lastHigh = sevs.lastIndexOf("high");
		expect(lastHigh).toBeLessThan(firstLow);
	});
});
