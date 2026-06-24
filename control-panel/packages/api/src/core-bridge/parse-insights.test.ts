import { describe, expect, it } from "vitest";
import { parseInsights } from "./parse-insights";

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
	site_health: { collected_at: "2026-06-24T10:00:00Z", critical: [], recommended: [] },
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
			parseInsights(JSON.stringify({ ...JSON.parse(VALID), schema_version: 99 })),
		).toThrow());
	it("throws on malformed JSON", () => expect(() => parseInsights("{not json")).toThrow());
	it("throws on missing required field", () =>
		expect(() =>
			parseInsights(JSON.stringify({ ...JSON.parse(VALID), plugins: undefined })),
		).toThrow());
	it("throws on oversized payload (>512KB) before parsing", () =>
		expect(() => parseInsights(" ".repeat(520 * 1024) + VALID)).toThrow(/too large|512/i));
	it("accepts a malicious string in name (XSS is a UI concern, not schema)", () =>
		expect(
			parseInsights(
				JSON.stringify({
					...JSON.parse(VALID),
					plugins: [{ ...JSON.parse(VALID).plugins[0], name: "<script>x</script>" }],
				}),
			).plugins[0]?.name,
		).toContain("script"));
});
