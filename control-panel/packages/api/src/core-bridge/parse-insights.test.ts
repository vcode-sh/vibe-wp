import { describe, expect, it } from "vitest";
import { parseInsights } from "./parse-insights";

const TOO_LARGE_RE = /too large|512/i;

const VALID = JSON.stringify({
	schema_version: 1,
	generated_at: "2026-06-24T10:00:00Z",
	site_url: "https://x.test",
	wp_core: { version: "7.0", update_available: false, new_version: null },
	php_version: "8.5.0",
	db: { size_bytes: 1024, engine: "MariaDB", server_version: "11.4.2-MariaDB" },
	plugins: [
		{
			slug: "woo",
			name: "Woo",
			version: "9.1",
			status: "active",
			update_available: true,
			new_version: "9.2",
			auto_update: null,
		},
	],
	themes: [
		{
			slug: "tt4",
			name: "TT4",
			version: "1.3",
			status: "active",
			update_available: false,
			new_version: null,
			auto_update: null,
		},
	],
	users: { count: 2, admin_count: 1, last_login: null },
	site_health: {
		collected_at: "2026-06-24T10:00:00Z",
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
});

describe("parseInsights", () => {
	it("parses a valid drop-file", () => {
		const r = parseInsights(VALID);
		expect(r.wp_core.version).toBe("7.0");
		expect(r.plugins[0]?.slug).toBe("woo");
	});
	it("throws on unknown schema_version", () =>
		expect(() =>
			parseInsights(
				JSON.stringify({ ...JSON.parse(VALID), schema_version: 99 })
			)
		).toThrow());
	it("throws on malformed JSON", () =>
		expect(() => parseInsights("{not json")).toThrow());
	it("throws on missing required field", () =>
		expect(() =>
			parseInsights(
				JSON.stringify({ ...JSON.parse(VALID), plugins: undefined })
			)
		).toThrow());
	it("throws on oversized payload (>512KB) before parsing", () =>
		expect(() => parseInsights(" ".repeat(520 * 1024) + VALID)).toThrow(
			TOO_LARGE_RE
		));
	it("accepts a malicious string in name (XSS is a UI concern, not schema)", () =>
		expect(
			parseInsights(
				JSON.stringify({
					...JSON.parse(VALID),
					plugins: [
						{ ...JSON.parse(VALID).plugins[0], name: "<script>x</script>" },
					],
				})
			).plugins[0]?.name
		).toContain("script"));

	// Feature E: the radar metadata fields are ADDITIVE + OPTIONAL + NULLABLE.
	it("back-compat: an OLD drop-file with no last_updated/active_installs/tested still parses", () => {
		// VALID predates the new fields — it must parse, leaving them undefined.
		const r = parseInsights(VALID);
		expect(r.plugins[0]?.last_updated).toBeUndefined();
		expect(r.plugins[0]?.active_installs).toBeUndefined();
		expect(r.plugins[0]?.tested).toBeUndefined();
	});
	it("parses the new radar metadata fields when present", () => {
		const withMeta = JSON.parse(VALID);
		withMeta.plugins[0] = {
			...withMeta.plugins[0],
			last_updated: "2021-03-04T17:35:00+00:00",
			active_installs: 5_000_000,
			tested: "6.8",
		};
		const r = parseInsights(JSON.stringify(withMeta));
		expect(r.plugins[0]?.last_updated).toBe("2021-03-04T17:35:00+00:00");
		expect(r.plugins[0]?.active_installs).toBe(5_000_000);
		expect(r.plugins[0]?.tested).toBe("6.8");
	});
	it("accepts explicit nulls for the new radar metadata fields (premium plugins)", () => {
		const withNulls = JSON.parse(VALID);
		withNulls.plugins[0] = {
			...withNulls.plugins[0],
			last_updated: null,
			active_installs: null,
			tested: null,
		};
		const r = parseInsights(JSON.stringify(withNulls));
		expect(r.plugins[0]?.last_updated).toBeNull();
	});
});
