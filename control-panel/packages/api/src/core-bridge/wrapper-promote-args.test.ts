import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// vitest runs under node (vitest.config.ts environment: "node") — use
// node:child_process, NOT Bun.*. Mirrors wrapper-wp-args.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const WRAPPER = resolve(here, "../../../../../bin/vibe-panel-run");

/**
 * Source the wrapper as a library (behind its VIBE_PANEL_RUN_LIB guard) and
 * invoke validate_arg with a single token — the exact generic re-validation the
 * `promote-files-to-prod` op's args go through at the root boundary. Returns the
 * exit code: 0 = accepted (the function returned), 1 = rejected (die exits 1).
 */
function runValidateArg(arg: string): number {
	const script =
		'VIBE_PANEL_RUN_LIB=1 . "$1" || exit 99; shift; validate_arg "$1"';
	const res = spawnSync("sh", ["-c", script, "sh", WRAPPER, arg], {
		encoding: "utf8",
	});
	return res.status ?? -1;
}

describe("validate_arg — promote-files-to-prod flags", () => {
	it("accepts the new --no-backup flag (now in FLAG_ALLOWLIST)", () => {
		expect(runValidateArg("--no-backup")).toBe(0);
	});

	it("still accepts the pre-existing panel flags", () => {
		for (const flag of ["--yes", "--local-only", "--json", "--no-notify"]) {
			expect(runValidateArg(flag)).toBe(0);
		}
	});

	it("rejects any other flag (no flag widening beyond the allowlist)", () => {
		for (const flag of [
			"--purge",
			"--no-backups",
			"--backup",
			"--stage",
			"--prod",
			"--force",
		]) {
			expect(runValidateArg(flag)).toBe(1);
		}
	});

	it("rejects metacharacter / traversal injection on a non-flag arg", () => {
		for (const bad of [
			"--no-backup; rm -rf /",
			"$(whoami)",
			"../../etc/passwd",
			"a b",
		]) {
			expect(runValidateArg(bad)).toBe(1);
		}
	});
});
