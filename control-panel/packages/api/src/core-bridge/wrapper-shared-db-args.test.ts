import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// vitest runs under node (vitest.config.ts environment: "node") — use
// node:child_process, NOT Bun.*. Mirrors wrapper-wp-args.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../../../../");
const WRAPPER = resolve(REPO_ROOT, "bin/vibe-panel-run");
const SHARED_DB_LIB = resolve(REPO_ROOT, "bin/lib/shared-db.sh");

/**
 * Source the wrapper as a library (behind its VIBE_PANEL_RUN_LIB guard) and
 * invoke validate_shared_db_op. Returns the exit code: 0 = accepted, 1 = die.
 */
function runValidateOp(op: string): number {
	const script =
		'VIBE_PANEL_RUN_LIB=1 . "$1" || exit 99; validate_shared_db_op "$2"';
	const res = spawnSync("sh", ["-c", script, "sh", WRAPPER, op], {
		encoding: "utf8",
	});
	return res.status ?? -1;
}

/**
 * Source bin/lib/shared-db.sh and invoke sdb_validate_slug — the SAME validator
 * the wrapper's shared-db arm calls for provision/deprovision (SF-5). Returns
 * the exit code: 0 = accepted (echoes vibe_<ident>), 1 = die.
 */
function runValidateSlug(slug: string): number {
	const script = '. "$1" || exit 99; sdb_validate_slug "$2" >/dev/null';
	const res = spawnSync("sh", ["-c", script, "sh", SHARED_DB_LIB, slug], {
		encoding: "utf8",
		env: { ...process.env, LC_ALL: "C" },
	});
	return res.status ?? -1;
}

describe("validate_shared_db_op — allowlist", () => {
	it.each([
		"init",
		"status",
		"provision",
		"deprovision",
		"backup",
		"rotate-root",
	])("accepts %s", (op) => {
		expect(runValidateOp(op)).toBe(0);
	});

	it.each([
		"",
		"INIT",
		"drop",
		"exec",
		"shell",
		"provision; rm -rf /",
		"init status",
		"rotate",
		"--help",
	])("rejects %j", (op) => {
		expect(runValidateOp(op)).toBe(1);
	});
});

describe("sdb_validate_slug — accepts valid site slugs", () => {
	it.each(["a", "ab", "my-site", "site1", "a-b-c", "wp-prod", "x".repeat(48)])(
		"accepts %j",
		(slug) => {
			expect(runValidateSlug(slug)).toBe(0);
		}
	);
});

describe("sdb_validate_slug — rejects the injection attack corpus (SF-5)", () => {
	it.each([
		"", // empty
		"-leading", // leading hyphen
		"1leading", // leading digit
		"UPPER", // uppercase
		"under_score", // underscore (would collide with hyphen map)
		"with space",
		"semi;colon",
		"back`tick",
		"dollar$(whoami)",
		"quote'inj",
		'dquote"inj',
		"back\\slash",
		"pipe|evil",
		"amp&evil",
		"star*glob",
		"dot.dot",
		"../traversal",
		"percent%wild",
		"x".repeat(49), // 49 chars — over the 48 cap
	])("rejects %j", (slug) => {
		expect(runValidateSlug(slug)).toBe(1);
	});
});
