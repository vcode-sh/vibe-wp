import { describe, expect, it } from "vitest";
import { parseVulnFeed } from "./vuln-feed";

const TOO_LARGE_RE = /too large|256/i;

const WELL_FORMED = JSON.stringify({
	woocommerce: [
		{
			id: "CVE-2026-1234",
			severity: "high",
			affected_versions: ["<9.2.0"],
			fixed_in: "9.2.0",
			source_url: "https://example.test/cve/1234",
		},
	],
	"contact-form-7": [
		{
			id: "WPSCAN-abcd",
			severity: "critical",
			affected_versions: [],
			fixed_in: null,
			source_url: null,
		},
	],
});

describe("parseVulnFeed", () => {
	it("treats empty object {} as a valid empty feed (default-OFF no-op)", () => {
		expect(parseVulnFeed("{}")).toEqual({});
	});

	it("treats blank stdout as an empty feed", () => {
		expect(parseVulnFeed("")).toEqual({});
		expect(parseVulnFeed("   \n")).toEqual({});
	});

	it("parses a well-formed slug→rows map", () => {
		const r = parseVulnFeed(WELL_FORMED);
		expect(Object.keys(r)).toEqual(["woocommerce", "contact-form-7"]);
		expect(r.woocommerce?.[0]?.id).toBe("CVE-2026-1234");
		expect(r.woocommerce?.[0]?.affected_versions).toEqual(["<9.2.0"]);
		expect(r["contact-form-7"]?.[0]?.fixed_in).toBeNull();
	});

	it("rejects an oversized payload before parsing", () => {
		const huge = " ".repeat(300 * 1024) + WELL_FORMED;
		expect(() => parseVulnFeed(huge)).toThrow(TOO_LARGE_RE);
	});

	it("rejects malformed JSON", () => {
		expect(() => parseVulnFeed("{not json")).toThrow();
	});

	it("rejects an unknown severity", () => {
		const bad = JSON.stringify({
			x: [
				{
					id: "X",
					severity: "spicy",
					affected_versions: [],
					fixed_in: null,
					source_url: null,
				},
			],
		});
		expect(() => parseVulnFeed(bad)).toThrow();
	});

	it("rejects a missing required field (id)", () => {
		const bad = JSON.stringify({
			x: [
				{
					severity: "high",
					affected_versions: [],
					fixed_in: null,
					source_url: null,
				},
			],
		});
		expect(() => parseVulnFeed(bad)).toThrow();
	});
});
