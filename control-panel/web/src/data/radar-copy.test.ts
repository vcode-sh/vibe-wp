import { describe, expect, it } from "vitest";
import {
	actionButtonLabel,
	actionGuidance,
	reasonExplanation,
	SEVERITY_META,
	summaryLabel,
} from "./radar-copy";
import type { FlaggedPlugin } from "./types";

const DOT_CLASS_RE = /^bg-(destructive|warning)$/;
const TEXT_CLASS_RE = /^text-(destructive|warning)$/;

function flag(over: Partial<FlaggedPlugin>): FlaggedPlugin {
	return {
		abandonedEvidence: null,
		cves: [],
		highestSeverity: null,
		lastUpdated: null,
		name: "Demo",
		newVersion: null,
		reasons: ["outdated"],
		severity: "low",
		slug: "demo",
		suggestedAction: "safeUpdate",
		testedUpTo: null,
		version: "1.0.0",
		wpMinorsBehind: null,
		...over,
	};
}

describe("SEVERITY_META", () => {
	it("maps every severity to a semantic token class (no hardcoded colors)", () => {
		for (const sev of ["critical", "high", "medium", "low"] as const) {
			const meta = SEVERITY_META[sev];
			expect(meta.label).toBeTruthy();
			// dot/text classes must reference semantic tokens, never raw hex/rgb.
			expect(meta.dotClass).toMatch(DOT_CLASS_RE);
			expect(meta.textClass).toMatch(TEXT_CLASS_RE);
		}
	});
});

describe("reasonExplanation", () => {
	it("mentions the new version for an outdated plugin", () => {
		const out = reasonExplanation(
			"outdated",
			flag({ reasons: ["outdated"], newVersion: "9.2" })
		);
		expect(out).toContain("9.2");
	});

	it("lists the CVE ids for a known-flaw plugin", () => {
		const out = reasonExplanation(
			"cve",
			flag({
				reasons: ["cve"],
				cves: [
					{
						id: "CVE-2026-1",
						severity: "high",
						affected_versions: [],
						fixed_in: null,
						source_url: null,
					},
				],
			})
		);
		expect(out).toContain("CVE-2026-1");
	});

	it("explains a stale-only abandoned plugin via its release age", () => {
		const out = reasonExplanation(
			"abandoned",
			flag({ reasons: ["abandoned"], abandonedEvidence: "stale" })
		);
		expect(out.toLowerCase()).toContain("two years");
	});

	it("explains an untested abandoned plugin via the tested-up-to WP gap", () => {
		const out = reasonExplanation(
			"abandoned",
			flag({
				reasons: ["abandoned"],
				abandonedEvidence: "untested",
				testedUpTo: "6.0",
				wpMinorsBehind: 4,
			})
		);
		expect(out).toContain("6.0");
		expect(out).toContain("4");
	});

	it("explains 'both' evidence as the strongest abandoned signal", () => {
		const out = reasonExplanation(
			"abandoned",
			flag({ reasons: ["abandoned"], abandonedEvidence: "both" })
		);
		expect(out.toLowerCase()).toContain("abandoned");
	});
});

describe("actionGuidance + actionButtonLabel", () => {
	it("recommends a safe update with rollback language", () => {
		const out = actionGuidance(flag({ suggestedAction: "safeUpdate" }));
		expect(out.toLowerCase()).toContain("roll back");
		expect(actionButtonLabel("safeUpdate")).toBe("Update safely");
	});

	it("recommends deactivation for an unfixed CVE", () => {
		const out = actionGuidance(
			flag({ suggestedAction: "deactivate", reasons: ["cve"] })
		);
		expect(out.toLowerCase()).toContain("deactivate");
		expect(actionButtonLabel("deactivate")).toBe("Deactivate");
	});

	it("recommends deactivation for an abandoned plugin with nothing to update to", () => {
		const out = actionGuidance(
			flag({ suggestedAction: "deactivate", reasons: ["abandoned"] })
		);
		expect(out.toLowerCase()).toContain("nothing newer");
	});
});

describe("summaryLabel", () => {
	it("says all-clear when nothing is flagged", () => {
		const out = summaryLabel({
			total: 0,
			outdated: 0,
			abandoned: 0,
			cve: 0,
			highestSeverity: null,
		});
		expect(out.toLowerCase()).toContain("nothing flagged");
	});

	it("uses singular grammar for a single flagged plugin", () => {
		const out = summaryLabel({
			total: 1,
			outdated: 1,
			abandoned: 0,
			cve: 0,
			highestSeverity: "low",
		});
		expect(out).toContain("1 active plugin needs attention");
	});

	it("summarises mixed reasons most-urgent first", () => {
		const out = summaryLabel({
			total: 3,
			outdated: 1,
			abandoned: 1,
			cve: 1,
			highestSeverity: "critical",
		});
		expect(out.indexOf("security flaw")).toBeLessThan(
			out.indexOf("out of date")
		);
	});
});
