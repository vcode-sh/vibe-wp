import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// vitest runs under node (vitest.config.ts environment: "node") — use
// node:child_process, NOT Bun.*. Repo-root pattern matches mu-plugin-mirror.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const WRAPPER = resolve(here, "../../../../../bin/vibe-panel-run");

/**
 * Source the wrapper as a library (behind its VIBE_PANEL_RUN_LIB guard) and
 * invoke validate_wp_args with raw argv. Returns the exit code: 0 = accepted
 * (the function returned), 1 = rejected (die exits 1). 99 = sourcing failed.
 */
function runValidateWp(...args: string[]): number {
	const script =
		'VIBE_PANEL_RUN_LIB=1 . "$1" || exit 99; shift; validate_wp_args "$@"';
	const res = spawnSync("sh", ["-c", script, "sh", WRAPPER, ...args], {
		encoding: "utf8",
	});
	return res.status ?? -1;
}

describe("validate_wp_args — existing forms preserved", () => {
	it.each([
		[["core", "update"]],
		[["plugin", "update", "--all"]],
		[["plugin", "list", "--update=available", "--format=json"]],
		[["cron", "event", "run", "vibe_insights_collect_cron"]],
	])("accepts %j", (args) => {
		expect(runValidateWp(...(args as string[]))).toBe(0);
	});
});
