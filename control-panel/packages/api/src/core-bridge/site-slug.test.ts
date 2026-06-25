import { describe, expect, test } from "vitest";

import { slugFromComposeProject } from "./site-slug";

describe("slugFromComposeProject", () => {
	test("strips the -prod suffix (per-DB site)", () => {
		expect(slugFromComposeProject("vibe-wp-myblog-prod", "dir")).toBe("myblog");
	});

	test("strips the -stage suffix", () => {
		expect(slugFromComposeProject("vibe-wp-myblog-stage", "dir")).toBe(
			"myblog"
		);
	});

	test("strips the -shared-db suffix so the caddySlug matches vibe-wp-<slug>.caddy", () => {
		// Regression: a shared-database site's project is vibe-wp-<slug>-shared-db.
		// Before the fix only -prod was stripped, leaving <slug>-shared-db, which
		// never matched the site's vibe-wp-<slug>.caddy snippet or its operations.
		expect(
			slugFromComposeProject("vibe-wp-test1-vcode-sh-shared-db", "vibe-wp")
		).toBe("test1-vcode-sh");
	});

	test("strips the -external suffix (external-services site)", () => {
		expect(slugFromComposeProject("vibe-wp-shop-external", "dir")).toBe("shop");
	});

	test("does NOT strip a suffix embedded mid-slug (only the trailing topology)", () => {
		expect(slugFromComposeProject("vibe-wp-prod-blog-prod", "dir")).toBe(
			"prod-blog"
		);
	});

	test("falls back to the dir tail when the project name is missing", () => {
		expect(slugFromComposeProject(undefined, "fallback")).toBe("fallback");
	});
});
