import { describe, expect, it } from "vitest";

import { assertSlug, SLUG_RE, tierFor, WP_ACTION_TIERS } from "./wp-actions";

describe("WP_ACTION_TIERS", () => {
	it("delete is admin, everything else operator", () => {
		expect(tierFor("plugin.delete")).toBe("admin");
		expect(tierFor("theme.delete")).toBe("admin");
		expect(tierFor("plugin.activate")).toBe("operator");
		expect(tierFor("plugin.update")).toBe("operator");
		expect(tierFor("core.update")).toBe("operator");
		expect(tierFor("safeUpdate")).toBe("operator");
		expect(tierFor("schedule.autoUpdate")).toBe("operator");
	});

	it("every action key maps to a known tier", () => {
		for (const t of Object.values(WP_ACTION_TIERS)) {
			expect(["operator", "admin"]).toContain(t);
		}
	});
});

describe("assertSlug", () => {
	it.each([
		"akismet",
		"contact-form-7",
		"a",
		"a".repeat(63),
		"redis-cache",
	])("accepts %s", (s) => {
		expect(() => assertSlug(s, "plugin")).not.toThrow();
		expect(SLUG_RE.test(s)).toBe(true);
	});

	it.each([
		"",
		"-leading",
		"UPPER",
		"has space",
		"a".repeat(64),
		"../x",
		"evil;rm",
		"https://x",
		"woo|evil",
		"woo$(whoami)",
	])("rejects %j", (s) => {
		expect(() => assertSlug(s, "plugin")).toThrow();
	});
});
