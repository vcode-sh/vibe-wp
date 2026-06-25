import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// vitest runs under node — use node:child_process, NOT Bun.*. Mirrors
// wrapper-shared-db-args.test.ts / wrapper-wp-args.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../../../../");
const WRAPPER = resolve(REPO_ROOT, "bin/vibe-panel-run");

// A throwaway site dir with a backups/<env>/<ts> subtree, plus a sibling
// "outside" dir, so validate_backup_path's confinement can be exercised.
let siteDir = "";
let goodBackup = "";
let outsideDir = "";

beforeAll(() => {
	siteDir = mkdtempSync(join(tmpdir(), "vibe-wrap-site-"));
	goodBackup = join(siteDir, "backups", "prod", "20260621T010203Z");
	mkdirSync(goodBackup, { recursive: true });
	outsideDir = mkdtempSync(join(tmpdir(), "vibe-wrap-outside-"));
});

afterAll(() => {
	for (const d of [siteDir, outsideDir]) {
		if (d) {
			rmSync(d, { recursive: true, force: true });
		}
	}
});

/**
 * Source the wrapper as a library (behind VIBE_PANEL_RUN_LIB) with SITE_DIR_REAL
 * pre-set, then invoke validate_backup_path. Returns the exit code: 0 = accepted,
 * 1 = die, 99 = sourcing failed.
 */
function runValidateBackupPath(siteReal: string, bp: string): number {
	const script =
		'VIBE_PANEL_RUN_LIB=1 . "$1" || exit 99; SITE_DIR_REAL="$2"; validate_backup_path "$3"';
	const res = spawnSync("sh", ["-c", script, "sh", WRAPPER, siteReal, bp], {
		encoding: "utf8",
		env: { ...process.env, LC_ALL: "C" },
	});
	return res.status ?? -1;
}

/** Invoke validate_item_name <kind> <name>. 0 = accepted, 1 = die. */
function runValidateItemName(kind: string, name: string): number {
	const script =
		'VIBE_PANEL_RUN_LIB=1 . "$1" || exit 99; validate_item_name "$2" "$3"';
	const res = spawnSync("sh", ["-c", script, "sh", WRAPPER, kind, name], {
		encoding: "utf8",
		env: { ...process.env, LC_ALL: "C" },
	});
	return res.status ?? -1;
}

describe("validate_backup_path — confinement to the site backups root", () => {
	it("accepts a real relative backup under the site backups root", () => {
		expect(
			runValidateBackupPath(siteDir, "backups/prod/20260621T010203Z")
		).toBe(0);
	});

	it("accepts the absolute form of the same backup", () => {
		expect(runValidateBackupPath(siteDir, goodBackup)).toBe(0);
	});

	it("rejects a nonexistent backup dir", () => {
		expect(runValidateBackupPath(siteDir, "backups/prod/does-not-exist")).toBe(
			1
		);
	});

	it.each([
		"backups/prod/../../etc",
		"../escape",
		"backups/prod/ts; rm -rf /",
		"backups/prod/ts$(whoami)",
		"backups/prod/ts|evil",
		"/etc",
	])("rejects the injection/traversal corpus %j", (bp) => {
		expect(runValidateBackupPath(siteDir, bp)).toBe(1);
	});

	it("rejects an absolute path OUTSIDE the site backups root", () => {
		expect(runValidateBackupPath(siteDir, outsideDir)).toBe(1);
	});
});

describe("validate_item_name — table kind", () => {
	it.each([
		"wp_posts",
		"wp_options",
		"a",
		"A0_z",
		"x".repeat(64),
	])("accepts %j", (n) => {
		expect(runValidateItemName("table", n)).toBe(0);
	});

	it.each([
		"",
		"wp-posts",
		"wp posts",
		"wp_posts;",
		"`drop`",
		"x".repeat(65),
		"wp.posts",
		"../traversal",
	])("rejects %j", (n) => {
		expect(runValidateItemName("table", n)).toBe(1);
	});
});

describe("validate_item_name — file kind", () => {
	it.each([
		"uploads/2026/06/x.jpg",
		"plugins/akismet/akismet.php",
		"themes/twentytwentyfour/style.css",
		"index.php",
	])("accepts %j", (n) => {
		expect(runValidateItemName("file", n)).toBe(0);
	});

	it.each([
		"",
		"/etc/passwd",
		"../escape",
		"uploads/../../etc/passwd",
		"-rf",
		"with space.txt",
		"a;b",
		"a$(b)",
		"a`b`",
		"a|b",
	])("rejects %j", (n) => {
		expect(runValidateItemName("file", n)).toBe(1);
	});
});

describe("validate_item_name — unknown kind", () => {
	it("rejects a non file|table kind", () => {
		expect(runValidateItemName("bogus", "x")).toBe(1);
	});
});
