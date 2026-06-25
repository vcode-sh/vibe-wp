import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Repo-root pattern matches wrapper-wp-args.test.ts / mu-plugin-mirror.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const WRAPPER = resolve(here, "../../../../../bin/vibe-panel-run");

const OP_ALLOWLIST_RE = /OP_ALLOWLIST="([^"]*)"/;
const WHITESPACE_RE = /\s+/;
// The dispatch's per-op branch: a comment line then `[ "$#" -eq 0 ] || die`.
const ZERO_ARG_GUARD_RE =
	/vuln-feed-fetch\)\s*#[^\n]*\n\s*\[ "\$#" -eq 0 \] \|\| die/;

/**
 * Source the wrapper as a library (behind its VIBE_PANEL_RUN_LIB guard) and call
 * validate_op with a single op token. Returns the exit code: 0 = accepted (the
 * op is in OP_ALLOWLIST), 1 = rejected (die exits 1). 99 = sourcing failed.
 */
function runValidateOp(op: string): number {
	const script =
		'VIBE_PANEL_RUN_LIB=1 . "$1" || exit 99; shift; validate_op "$1"';
	const res = spawnSync("sh", ["-c", script, "sh", WRAPPER, op], {
		encoding: "utf8",
	});
	return res.status ?? -1;
}

describe("vibe-panel-run — vuln-feed-fetch op allowlisting", () => {
	it("validate_op accepts vuln-feed-fetch", () => {
		expect(runValidateOp("vuln-feed-fetch")).toBe(0);
	});

	it("validate_op still rejects an unknown op", () => {
		expect(runValidateOp("vuln-feed-fetchX")).toBe(1);
		expect(runValidateOp("rm")).toBe(1);
	});

	it("OP_ALLOWLIST string literally contains the vuln-feed-fetch token", () => {
		const src = readFileSync(WRAPPER, "utf8");
		const match = src.match(OP_ALLOWLIST_RE);
		const tokens = (match?.[1] ?? "").split(WHITESPACE_RE);
		expect(tokens).toContain("vuln-feed-fetch");
	});

	it("the dispatch enforces ZERO argv args for vuln-feed-fetch (slugs are stdin-only)", () => {
		// The vibe dispatch's per-op branch dies on any argument. Assert the source
		// carries that guard so a regression that drops it is caught here too.
		const src = readFileSync(WRAPPER, "utf8");
		expect(src).toMatch(ZERO_ARG_GUARD_RE);
	});
});
