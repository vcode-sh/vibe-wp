import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Repo-root pattern matches wrapper-vuln-feed-args.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const WRAPPER = resolve(here, "../../../../../bin/vibe-panel-run");

const OP_ALLOWLIST_RE = /OP_ALLOWLIST="([^"]*)"/;
const WHITESPACE_RE = /\s+/;
const SB_NO_ARGS_RE = /support-bundle takes no arguments/;
const SB_BIN_DIR_RE = /support-bundle bin dir/;
const PU_NO_ARGS_RE = /panel-update takes no arguments/;
const PU_BIN_DIR_RE = /panel bin dir/;

/**
 * Invoke the wrapper end-to-end (NOT as a lib) with a subcommand + args. Returns
 * { status, stderr }. The wrapper's zero-arg guards `die` (exit 1) with a message
 * before any privileged action; we assert that branch fires.
 */
function runWrapper(args: string[]): { status: number; stderr: string } {
	const res = spawnSync("sh", [WRAPPER, ...args], {
		encoding: "utf8",
		// PANEL_HOST_DIR points at a path with no bin/, so even if a guard were
		// missing the exec target resolution would fail closed — but the arg
		// guards we assert run FIRST, before any path is touched.
		env: { ...process.env, PANEL_HOST_DIR: "/nonexistent-vibe-host" },
	});
	return { status: res.status ?? -1, stderr: res.stderr ?? "" };
}

describe("vibe-panel-run — support-bundle subcommand", () => {
	it("rejects ANY argument (zero-arg only)", () => {
		const res = runWrapper(["support-bundle", "extra"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(SB_NO_ARGS_RE);
	});

	it("rejects a flag-like argument too", () => {
		const res = runWrapper(["support-bundle", "--out=/tmp/x"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(SB_NO_ARGS_RE);
	});

	it("with zero args it dispatches to its own subcommand (root-owned guard fires)", () => {
		// With zero args it passes the arity check and reaches the assert_root_owned
		// guard against PANEL_HOST_DIR/bin — which fails (the path does not exist /
		// is not root-owned). The message proves we are on the support-bundle branch
		// and NOT in the generic `vibe`/op path.
		const res = runWrapper(["support-bundle"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(SB_BIN_DIR_RE);
	});

	it("is NOT in OP_ALLOWLIST (it is its own top-level subcommand)", () => {
		const src = readFileSync(WRAPPER, "utf8");
		const tokens = (src.match(OP_ALLOWLIST_RE)?.[1] ?? "").split(WHITESPACE_RE);
		expect(tokens).not.toContain("support-bundle");
	});
});

describe("vibe-panel-run — panel-update subcommand", () => {
	it("rejects ANY argument (zero-arg only)", () => {
		const res = runWrapper(["panel-update", "install"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(PU_NO_ARGS_RE);
	});

	it("refuses to reach any other bin/panel subcommand via a smuggled arg", () => {
		// A compromised panel must not be able to turn `panel-update` into
		// `panel uninstall --purge` or `panel reset-password`. Any arg dies here.
		for (const evil of ["uninstall", "reset-password", "--purge"]) {
			const res = runWrapper(["panel-update", evil]);
			expect(res.status).toBe(1);
			expect(res.stderr).toMatch(PU_NO_ARGS_RE);
		}
	});

	it("with zero args it dispatches to its own subcommand (root-owned guard fires)", () => {
		// Zero args passes arity and reaches assert_root_owned against the panel bin
		// dir, which fails on the nonexistent host dir. Proves the panel-update
		// branch (not the generic op path) handled it.
		const res = runWrapper(["panel-update"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(PU_BIN_DIR_RE);
	});

	it("is NOT in OP_ALLOWLIST (it is its own top-level subcommand)", () => {
		const src = readFileSync(WRAPPER, "utf8");
		const tokens = (src.match(OP_ALLOWLIST_RE)?.[1] ?? "").split(WHITESPACE_RE);
		expect(tokens).not.toContain("panel-update");
	});
});
