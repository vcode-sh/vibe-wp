import { describe, expect, it } from "vitest";
import type { CveRef, InsightsPlugin, SiteInsights } from "../contract";
import {
	ABANDONED_MONTHS,
	ABANDONED_WP_MINORS,
	computeSecurityRadar,
	type VulnFeed,
	versionInRange,
	wpMinorsBehind,
} from "./security-radar";

const NOW = new Date("2026-06-25T00:00:00Z");

/** ISO date `n` months before NOW (approximated with 30.44-day months). */
function monthsAgo(n: number): string {
	const ms = n * 30.44 * 24 * 60 * 60 * 1000;
	return new Date(NOW.getTime() - ms).toISOString();
}

function plugin(over: Partial<InsightsPlugin>): InsightsPlugin {
	return {
		slug: "demo",
		name: "Demo",
		version: "1.0.0",
		status: "active",
		update_available: false,
		new_version: null,
		auto_update: null,
		last_updated: null,
		active_installs: null,
		tested: null,
		...over,
	};
}

function insightsWith(
	plugins: InsightsPlugin[],
	wpVersion = "7.0"
): SiteInsights {
	return {
		schema_version: 1,
		generated_at: NOW.toISOString(),
		site_url: "https://x.test",
		wp_core: {
			version: wpVersion,
			update_available: false,
			new_version: null,
		},
		php_version: "8.5.0",
		db: { size_bytes: 0, engine: "MariaDB", server_version: "11.4" },
		plugins,
		themes: [],
		users: { count: 1, admin_count: 1, last_login: null },
		site_health: {
			collected_at: NOW.toISOString(),
			critical: [],
			recommended: [],
		},
		signals: {
			xmlrpc_enabled: false,
			file_edit_enabled: false,
			debug_on: false,
			debug_log_on: false,
			debug_display_on: false,
			script_debug_on: false,
			auto_update_core: "minor",
			cron_disabled: false,
		},
		object_cache: { enabled: true, type: "redis", dropin_present: true },
		fastcgi_cache: { enabled: true },
	};
}

describe("computeSecurityRadar — outdated", () => {
	it("flags an active plugin with an available update as outdated → safeUpdate", () => {
		const r = computeSecurityRadar(
			insightsWith([
				plugin({ slug: "woo", update_available: true, new_version: "9.2" }),
			]),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(1);
		const f = r.flagged[0];
		expect(f?.reasons).toEqual(["outdated"]);
		expect(f?.suggestedAction).toBe("safeUpdate");
		expect(f?.newVersion).toBe("9.2");
		expect(r.summary.outdated).toBe(1);
	});

	it("does NOT flag an up-to-date active plugin", () => {
		const r = computeSecurityRadar(
			insightsWith([plugin({ slug: "ok", update_available: false })]),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(0);
		expect(r.summary.total).toBe(0);
	});
});

describe("computeSecurityRadar — abandoned (age threshold)", () => {
	it("flags an active plugin older than the threshold as abandoned → deactivate", () => {
		const r = computeSecurityRadar(
			insightsWith([
				plugin({
					slug: "stale",
					last_updated: monthsAgo(ABANDONED_MONTHS + 2),
				}),
			]),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(1);
		expect(r.flagged[0]?.reasons).toEqual(["abandoned"]);
		expect(r.flagged[0]?.suggestedAction).toBe("deactivate");
		expect(r.summary.abandoned).toBe(1);
	});

	it("does NOT flag a recently-updated plugin", () => {
		const r = computeSecurityRadar(
			insightsWith([plugin({ slug: "fresh", last_updated: monthsAgo(3) })]),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(0);
	});

	it("does NOT flag a plugin with NULL last_updated (premium/custom, weak signal)", () => {
		const r = computeSecurityRadar(
			insightsWith([plugin({ slug: "premium", last_updated: null })]),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(0);
	});

	it("does NOT flag when last_updated is unparseable garbage", () => {
		const r = computeSecurityRadar(
			insightsWith([plugin({ slug: "weird", last_updated: "not-a-date" })]),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(0);
	});
});

describe("computeSecurityRadar — abandoned (tested-up-to vs running WP)", () => {
	it("flags an active plugin whose 'tested up to' trails the running WP by the threshold", () => {
		// Running WP 7.0; tested up to 6.0 → 4 minors behind (>= ABANDONED_WP_MINORS).
		const r = computeSecurityRadar(
			insightsWith(
				[
					plugin({
						slug: "untested",
						last_updated: monthsAgo(2), // recent date → only the WP-gap signal applies
						tested: "6.0",
					}),
				],
				"7.0"
			),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(1);
		const f = r.flagged[0];
		expect(f?.reasons).toEqual(["abandoned"]);
		expect(f?.abandonedEvidence).toBe("untested");
		expect(f?.wpMinorsBehind).toBeGreaterThanOrEqual(ABANDONED_WP_MINORS);
		expect(f?.testedUpTo).toBe("6.0");
		expect(f?.suggestedAction).toBe("deactivate");
	});

	it("does NOT flag a plugin tested against a recent WP minor", () => {
		// Running 7.0; tested 6.3 → under the threshold (forgiving).
		const r = computeSecurityRadar(
			insightsWith(
				[plugin({ slug: "fine", last_updated: monthsAgo(1), tested: "6.3" })],
				"7.0"
			),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(0);
	});

	it("does NOT flag when 'tested up to' is ahead of the running WP", () => {
		const r = computeSecurityRadar(
			insightsWith(
				[plugin({ slug: "ahead", last_updated: monthsAgo(1), tested: "7.4" })],
				"7.0"
			),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(0);
	});

	it("reports 'both' evidence when stale AND untested", () => {
		const r = computeSecurityRadar(
			insightsWith(
				[
					plugin({
						slug: "rot",
						last_updated: monthsAgo(ABANDONED_MONTHS + 6),
						tested: "5.0",
					}),
				],
				"7.0"
			),
			undefined,
			NOW
		);
		expect(r.flagged[0]?.abandonedEvidence).toBe("both");
	});
});

describe("computeSecurityRadar — per-row severity (every flagged row)", () => {
	it("outdated-only → low severity", () => {
		const r = computeSecurityRadar(
			insightsWith([
				plugin({ slug: "old", update_available: true, new_version: "2" }),
			]),
			undefined,
			NOW
		);
		expect(r.flagged[0]?.severity).toBe("low");
		expect(r.summary.highestSeverity).toBe("low");
	});

	it("abandoned → medium severity even with no CVE", () => {
		const r = computeSecurityRadar(
			insightsWith([
				plugin({
					slug: "stale",
					last_updated: monthsAgo(ABANDONED_MONTHS + 2),
				}),
			]),
			undefined,
			NOW
		);
		expect(r.flagged[0]?.severity).toBe("medium");
		expect(r.summary.highestSeverity).toBe("medium");
	});

	it("a matching CVE drives severity above the maintenance fallback", () => {
		const feed: VulnFeed = {
			crit: [
				{
					id: "X",
					severity: "critical",
					affected_versions: [],
					fixed_in: null,
					source_url: null,
				},
			],
		};
		const r = computeSecurityRadar(
			insightsWith([
				plugin({
					slug: "crit",
					version: "1.0.0",
					last_updated: monthsAgo(ABANDONED_MONTHS + 2),
				}),
			]),
			feed,
			NOW
		);
		expect(r.flagged[0]?.severity).toBe("critical");
	});
});

describe("computeSecurityRadar — inactive plugins ignored", () => {
	it("ignores inactive plugins even if outdated AND abandoned", () => {
		const r = computeSecurityRadar(
			insightsWith([
				plugin({
					slug: "off",
					status: "inactive",
					update_available: true,
					new_version: "2.0",
					last_updated: monthsAgo(ABANDONED_MONTHS + 12),
				}),
			]),
			undefined,
			NOW
		);
		expect(r.flagged).toHaveLength(0);
	});
});

describe("computeSecurityRadar — cve", () => {
	const cveWithFix: CveRef = {
		id: "CVE-2026-0001",
		severity: "high",
		affected_versions: ["<5.3.1"],
		fixed_in: "5.3.1",
		source_url: "https://example.test/cve",
	};
	const cveNoFix: CveRef = {
		id: "CVE-2026-0002",
		severity: "critical",
		affected_versions: ["<=9.9.9"],
		fixed_in: null,
		source_url: null,
	};

	it("flags a plugin whose version is in the affected range; with-fix → safeUpdate", () => {
		const feed: VulnFeed = { vuln: [cveWithFix] };
		const r = computeSecurityRadar(
			insightsWith([plugin({ slug: "vuln", version: "5.3.0" })]),
			feed,
			NOW
		);
		expect(r.flagged).toHaveLength(1);
		expect(r.flagged[0]?.reasons).toContain("cve");
		expect(r.flagged[0]?.highestSeverity).toBe("high");
		expect(r.flagged[0]?.suggestedAction).toBe("safeUpdate");
		expect(r.summary.cve).toBe(1);
		expect(r.summary.highestSeverity).toBe("high");
	});

	it("does NOT flag a plugin whose version is OUTSIDE the affected range", () => {
		const feed: VulnFeed = { vuln: [cveWithFix] };
		const r = computeSecurityRadar(
			insightsWith([plugin({ slug: "vuln", version: "5.3.1" })]),
			feed,
			NOW
		);
		expect(r.flagged).toHaveLength(0);
	});

	it("cve WITHOUT a fix → deactivate (quarantine)", () => {
		const feed: VulnFeed = { only: [cveNoFix] };
		const r = computeSecurityRadar(
			insightsWith([plugin({ slug: "only", version: "1.0.0" })]),
			feed,
			NOW
		);
		expect(r.flagged[0]?.suggestedAction).toBe("deactivate");
	});

	it("outdated + cve-WITHOUT-fix: deactivate dominates (a generic update won't close an unfixed hole)", () => {
		const feed: VulnFeed = { both: [cveNoFix] };
		const r = computeSecurityRadar(
			insightsWith([
				plugin({
					slug: "both",
					version: "1.0.0",
					update_available: true,
					new_version: "1.1.0",
				}),
			]),
			feed,
			NOW
		);
		const f = r.flagged[0];
		expect(f?.reasons).toEqual(expect.arrayContaining(["outdated", "cve"]));
		// An unfixed CVE is the dominant signal — quarantine rather than ship a
		// non-security update that leaves the known hole open.
		expect(f?.suggestedAction).toBe("deactivate");
	});

	it("outdated + cve-WITH-fix: safeUpdate wins (the update remediates the CVE)", () => {
		const feed: VulnFeed = { both: [cveWithFix] };
		const r = computeSecurityRadar(
			insightsWith([
				plugin({
					slug: "both",
					version: "5.3.0",
					update_available: true,
					new_version: "5.3.1",
				}),
			]),
			feed,
			NOW
		);
		expect(r.flagged[0]?.suggestedAction).toBe("safeUpdate");
	});
});

describe("computeSecurityRadar — ordering + summary", () => {
	it("orders CVE-flagged (by severity) ahead of non-CVE", () => {
		const feed: VulnFeed = {
			critical: [
				{
					id: "C",
					severity: "critical",
					affected_versions: [],
					fixed_in: null,
					source_url: null,
				},
			],
		};
		const r = computeSecurityRadar(
			insightsWith([
				plugin({
					slug: "aaa-outdated",
					update_available: true,
					new_version: "2",
				}),
				plugin({ slug: "critical", version: "1.0.0" }),
			]),
			feed,
			NOW
		);
		expect(r.flagged[0]?.slug).toBe("critical");
		expect(r.summary.total).toBe(2);
	});
});

describe("versionInRange", () => {
	it("empty constraint list matches every version", () => {
		expect(versionInRange("1.2.3", [])).toBe(true);
	});
	it("'<X' is exclusive", () => {
		expect(versionInRange("5.3.0", ["<5.3.1"])).toBe(true);
		expect(versionInRange("5.3.1", ["<5.3.1"])).toBe(false);
	});
	it("'<=X' is inclusive", () => {
		expect(versionInRange("5.3.1", ["<=5.3.1"])).toBe(true);
	});
	it("compound range needs ALL tokens to hold", () => {
		expect(versionInRange("5.2.0", [">=5.0.0", "<5.3.0"])).toBe(true);
		expect(versionInRange("5.3.0", [">=5.0.0", "<5.3.0"])).toBe(false);
	});
	it("a malformed token fails closed (no match)", () => {
		expect(versionInRange("1.0.0", ["<"])).toBe(false);
	});
});

describe("wpMinorsBehind", () => {
	it("counts minor releases the tested version trails the running WP", () => {
		expect(wpMinorsBehind("6.6", "6.6")).toBe(0);
		expect(wpMinorsBehind("6.5", "6.6")).toBe(1);
		// 6.2 vs 6.6 → 4 minors behind.
		expect(wpMinorsBehind("6.2", "6.6")).toBe(4);
	});

	it("treats a major rollover as a meaningful step (does not reset)", () => {
		// Running 7.0, tested 6.3 → 1 minor behind (7.0 ordinal just past 6.3).
		expect(wpMinorsBehind("6.3", "7.0")).toBe(1);
		// Running 7.0, tested 6.0 → 4 minors behind.
		expect(wpMinorsBehind("6.0", "7.0")).toBe(4);
	});

	it("never penalises a 'tested up to' AHEAD of the running WP (returns 0)", () => {
		expect(wpMinorsBehind("7.4", "7.0")).toBe(0);
	});

	it("ignores the patch segment (compares major.minor only)", () => {
		expect(wpMinorsBehind("6.6.3", "6.6.1")).toBe(0);
	});

	it("returns null when either side is missing or unparseable", () => {
		expect(wpMinorsBehind(null, "7.0")).toBeNull();
		expect(wpMinorsBehind("", "7.0")).toBeNull();
		expect(wpMinorsBehind("6.6", "")).toBeNull();
		expect(wpMinorsBehind("not-a-version", "7.0")).toBeNull();
	});
});
