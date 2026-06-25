/**
 * Strict control-panel custom-domain hostname validation — the PURE, vitest-tested
 * pre-spawn guard. The value travels from the GUI into a Caddy config file AND the
 * panel's env file, so injection is the top risk. This is the FIRST of three
 * independent validation layers:
 *
 *   1. this isPanelHostname() (pre-spawn, in the panel server)
 *   2. validate_panel_domain() in bin/vibe-panel-run (the load-bearing ROOT
 *      boundary — the panel is the untrusted caller)
 *   3. validate_domain() in bin/panel-domain-apply (defense in depth, in the op)
 *
 * The rules MUST stay in lockstep with the two shell copies: a POSITIVE allowlist
 * of lowercase [a-z0-9.-] only, a valid FQDN of >=2 labels (each 1-63 chars, no
 * leading/trailing dash), total length <=253, no "..", and not a reserved/test
 * name. NO uppercase, whitespace, '/', or any shell/Caddy metacharacter can pass.
 */

/** ASCII-only, lowercase, dot/dash. Any other byte fails (mirrors the `case` guard). */
const PANEL_HOSTNAME_ALLOWED = /^[a-z0-9.-]+$/;
/** Matches a pasted scheme prefix (https://, http://, …) to strip it. */
const SCHEME_PREFIX = /^[a-z]+:\/\//;

/** Reserved/non-routable names that can never get a real ACME cert. */
const RESERVED_EXACT = new Set(["localhost"]);
const RESERVED_SUFFIXES = [
	".localhost",
	".test",
	".invalid",
	".example",
	".example.com",
	".example.net",
	".example.org",
];

/** True when EVERY label is 1-63 chars with no leading/trailing dash. */
function labelsAreValid(labels: string[]): boolean {
	// Require at least two labels (a real FQDN with a dot).
	if (labels.length < 2) {
		return false;
	}
	for (const label of labels) {
		if (label.length < 1 || label.length > 63) {
			return false;
		}
		if (label.startsWith("-") || label.endsWith("-")) {
			return false;
		}
	}
	return true;
}

/** True when the hostname is NOT a reserved/test/non-routable name. */
function isReservedName(d: string): boolean {
	if (RESERVED_EXACT.has(d)) {
		return true;
	}
	return RESERVED_SUFFIXES.some((suffix) => d.endsWith(suffix));
}

/** True when no character/edge guard is violated (charset, dots, edge dashes). */
function hasSafeShape(d: string): boolean {
	if (d.length === 0 || d.length > 253) {
		return false;
	}
	// POSITIVE allowlist: rejects uppercase, whitespace, '/', and every metachar.
	if (!PANEL_HOSTNAME_ALLOWED.test(d)) {
		return false;
	}
	if (d.startsWith(".") || d.endsWith(".") || d.includes("..")) {
		return false;
	}
	return !(d.startsWith("-") || d.endsWith("-"));
}

/**
 * True only when `value` is a safe custom panel hostname. Pure + total: never
 * throws, returns a boolean. Use this BEFORE spawning the host op; the root
 * wrapper re-validates regardless.
 */
export function isPanelHostname(value: string): boolean {
	if (typeof value !== "string") {
		return false;
	}
	const d = value;
	if (!hasSafeShape(d)) {
		return false;
	}
	if (!labelsAreValid(d.split("."))) {
		return false;
	}
	return !isReservedName(d);
}

/**
 * Normalize a user-entered panel domain: trim + lowercase (so "Panel.Example.COM "
 * becomes "panel.example.com"). Strips a leading scheme/path the way an owner might
 * paste it. The result is then validated by isPanelHostname — normalization does NOT
 * make an invalid value valid, it only canonicalizes the common copy/paste shapes.
 */
export function normalizePanelDomain(value: string): string {
	let d = (value ?? "").trim().toLowerCase();
	// Strip a pasted scheme and anything after the host (path/port/query).
	d = d.replace(SCHEME_PREFIX, "");
	d = d.split("/")[0] ?? d;
	d = d.split(":")[0] ?? d;
	return d;
}
