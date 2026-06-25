import type { CveRef, FlaggedPlugin, SiteInsights } from "../contract";

/**
 * Per-site "Security Radar" — a pure, deterministic flagging of risky ACTIVE
 * plugins. No I/O here: the router fetches the inputs (the Insights drop-file,
 * and — when a CVE feed is configured — the vuln-feed map) and calls
 * computeSecurityRadar so this stays unit-testable.
 *
 * THREE REASONS a plugin can be flagged:
 *   - "outdated"  : an update is available (already in the Insights drop-file).
 *   - "abandoned" : the plugin looks unmaintained. TWO independent FREE signals,
 *                   both sourced from the wp.org plugins API the Insights collector
 *                   already gathers — either one is enough to flag:
 *                     (a) wp.org `last_updated` is older than ABANDONED_MONTHS, OR
 *                     (b) the author's "tested up to" WP version trails the site's
 *                         running WP by ABANDONED_WP_MINORS+ minor releases — the
 *                         plugin was never re-tested against current WordPress.
 *                   Plugins with NEITHER signal (premium/custom, no wp.org
 *                   metadata) are NEVER flagged abandoned — a missing date is a
 *                   weak signal we deliberately do not over-flag on.
 *   - "cve"       : the installed version falls in a known-vulnerable range from
 *                   the (optional, default-OFF) feed. Dark until a feed is wired.
 *
 * Only ACTIVE plugins are flagged — an inactive plugin is not an attack surface,
 * and quarantine (deactivate) is meaningless for one that is already inactive.
 *
 * SEVERITY is computed for EVERY flagged plugin (not just CVE rows) so the GUI can
 * sort and colour-code the whole list. A known CVE drives severity by its own
 * rating; otherwise outdated/abandoned map to a conservative non-zero severity so
 * an operator always sees how urgent each row is.
 */

export type RadarReason = "outdated" | "abandoned" | "cve";
export type RadarSeverity = "critical" | "high" | "medium" | "low";
export type SuggestedAction = "update" | "safeUpdate" | "deactivate";

/** The specific evidence behind an "abandoned" flag, used for plain-language GUI copy. */
export type AbandonedEvidence = "stale" | "untested" | "both";

/** Months since wp.org `last_updated` after which an active plugin is "abandoned". */
export const ABANDONED_MONTHS = 24;

/**
 * How many WP MINOR releases the author's "tested up to" version may trail the
 * site's running WP before the plugin is treated as un-maintained for current
 * WordPress. e.g. running 6.6 with "tested up to 6.2" = 4 minors behind → flagged.
 * Two is a deliberately forgiving threshold (≈ a full year of WP releases) so a
 * plugin that simply hasn't bumped its header for the latest point release is not
 * nagged about.
 */
export const ABANDONED_WP_MINORS = 3;

/** Approximate ms in `ABANDONED_MONTHS` (30.44-day months — calendar-agnostic, fine for a threshold). */
const ABANDONED_MS = ABANDONED_MONTHS * 30.44 * 24 * 60 * 60 * 1000;

const SEVERITY_RANK: Record<RadarSeverity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

/** A CVE feed maps each slug to zero or more vulnerability rows. */
export type VulnFeed = Record<string, CveRef[]>;

function highestSeverity(cves: CveRef[]): RadarSeverity | null {
	let best: RadarSeverity | null = null;
	for (const c of cves) {
		if (best === null || SEVERITY_RANK[c.severity] < SEVERITY_RANK[best]) {
			best = c.severity;
		}
	}
	return best;
}

/**
 * Conservative semver-ish comparison. Splits on '.', compares numeric segments,
 * and treats a non-numeric/absent segment as 0. Returns -1, 0, or 1. This is
 * intentionally simple: the feed payload is UNTRUSTED, so range matching stays
 * narrow and is unit-tested rather than pulling a full semver parser.
 */
function compareVersions(a: string, b: string): number {
	const pa = a.split(".");
	const pb = b.split(".");
	const len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const na = Number.parseInt(pa[i] ?? "0", 10);
		const nb = Number.parseInt(pb[i] ?? "0", 10);
		const va = Number.isNaN(na) ? 0 : na;
		const vb = Number.isNaN(nb) ? 0 : nb;
		if (va < vb) {
			return -1;
		}
		if (va > vb) {
			return 1;
		}
	}
	return 0;
}

/**
 * How many WP MINOR releases the plugin's "tested up to" trails the running WP,
 * or null when we can't tell (either version missing/unparseable). WP versions are
 * `major.minor[.patch]`; we compare on the `major.minor` pair only — patch releases
 * (6.6.1) never change the "tested up to" expectation. A `tested` AHEAD of the
 * running WP returns 0 (never penalised). Examples (running 6.6):
 *   tested "6.6" → 0 · "6.5" → 1 · "6.2" → 4 · "7.0" → 0 (ahead) · "" → null.
 */
export function wpMinorsBehind(
	tested: string | null | undefined,
	wpVersion: string
): number | null {
	if (!tested || tested.trim() === "" || wpVersion.trim() === "") {
		return null;
	}
	const t = tested.trim().split(".");
	const w = wpVersion.trim().split(".");
	const tMajor = Number.parseInt(t[0] ?? "", 10);
	const tMinor = Number.parseInt(t[1] ?? "0", 10);
	const wMajor = Number.parseInt(w[0] ?? "", 10);
	const wMinor = Number.parseInt(w[1] ?? "0", 10);
	if (Number.isNaN(tMajor) || Number.isNaN(wMajor)) {
		return null; // unparseable on either side → no signal (fail open, don't over-flag).
	}
	// WordPress ships ~3 minor releases per major; collapse to a single ordinal so
	// a major rollover (6.x → 7.0) counts as a meaningful step rather than resetting.
	const WP_MINORS_PER_MAJOR = 4;
	const testedOrdinal =
		tMajor * WP_MINORS_PER_MAJOR + (Number.isNaN(tMinor) ? 0 : tMinor);
	const wpOrdinal =
		wMajor * WP_MINORS_PER_MAJOR + (Number.isNaN(wMinor) ? 0 : wMinor);
	const behind = wpOrdinal - testedOrdinal;
	return behind > 0 ? behind : 0;
}

/** Split a constraint token into its operator + version value (default op "="). */
function parseConstraint(token: string): { op: string; value: string } {
	if (token.startsWith("<=") || token.startsWith(">=")) {
		return { op: token.slice(0, 2), value: token.slice(2).trim() };
	}
	if (token.startsWith("<") || token.startsWith(">")) {
		return { op: token.slice(0, 1), value: token.slice(1).trim() };
	}
	if (token.startsWith("=")) {
		return { op: "=", value: token.slice(1).trim() };
	}
	return { op: "=", value: token };
}

/** Does a single constraint hold for `version`? Unparseable → false (fail closed). */
function constraintHolds(version: string, token: string): boolean {
	const { op, value } = parseConstraint(token);
	if (value === "") {
		return false; // malformed token → fail closed
	}
	const cmp = compareVersions(version, value);
	switch (op) {
		case "<":
			return cmp < 0;
		case "<=":
			return cmp <= 0;
		case ">":
			return cmp > 0;
		case ">=":
			return cmp >= 0;
		default:
			return cmp === 0; // "="
	}
}

/**
 * Does `version` fall within the feed's affected range for a CVE? The feed
 * expresses the range as a list of constraint tokens, each one of:
 *   "<X" / "<=X" / ">X" / ">=X" / "=X" / "X" (exact). ALL tokens must hold.
 * An empty/absent constraint list is treated as "applies to every version"
 * (the feed already scoped this CVE to the slug). A token we cannot parse
 * makes the range NOT match (fail CLOSED — never silently widen a match).
 */
export function versionInRange(version: string, affected: string[]): boolean {
	if (affected.length === 0) {
		return true;
	}
	for (const raw of affected) {
		const token = raw.trim();
		if (token === "") {
			continue;
		}
		if (!constraintHolds(version, token)) {
			return false;
		}
	}
	return true;
}

/** CVE rows whose affected range covers the installed version. */
function matchingCves(version: string, cves: CveRef[]): CveRef[] {
	return cves.filter((c) => versionInRange(version, c.affected_versions));
}

/**
 * Suggested action policy, in DOMINANCE order (the most conservative remediation
 * that actually closes the risk wins):
 *
 *   1. CVE present but NO published fix → deactivate (quarantine). DOMINANT even
 *      when a generic update exists: shipping a non-security update would NOT
 *      close the known hole, so removing the attack surface is the safe call.
 *   2. CVE WITH a fix, or simply outdated → safeUpdate (snapshot + TTFB probe +
 *      rollback). The update is what remediates the CVE / closes the gap.
 *   3. Abandoned (and nothing to update to) → deactivate (quarantine).
 *   4. Fallback → safeUpdate.
 */
function suggestAction(
	reasons: Set<RadarReason>,
	cves: CveRef[]
): SuggestedAction {
	const cveWithFix = cves.some((c) => c.fixed_in !== null);
	// (1) An unfixed CVE dominates — quarantine regardless of an available update.
	if (reasons.has("cve") && !cveWithFix) {
		return "deactivate";
	}
	// (2) A fixable CVE or a plain outdated plugin → update (safely).
	if (reasons.has("outdated") || cveWithFix) {
		return "safeUpdate";
	}
	// (3) Abandoned with nothing to update to → quarantine.
	if (reasons.has("abandoned")) {
		return "deactivate";
	}
	return "safeUpdate";
}

/**
 * The overall severity of a flagged plugin, used to colour/sort the GUI list.
 * A matching CVE always dominates (its own rating wins). With no CVE we fall back
 * to a conservative severity from the maintenance signals:
 *   - abandoned (any evidence)      → "medium" (an unmaintained attack surface).
 *   - outdated only                 → "low"    (a routine, safe update closes it).
 * Every flagged plugin therefore has a non-null severity — the GUI never shows a
 * blank urgency column.
 */
function rowSeverity(reasons: Set<RadarReason>, cves: CveRef[]): RadarSeverity {
	const cveSeverity = highestSeverity(cves);
	if (cveSeverity) {
		return cveSeverity;
	}
	if (reasons.has("abandoned")) {
		return "medium";
	}
	return "low";
}

export interface SecurityRadar {
	flagged: FlaggedPlugin[];
	summary: {
		total: number;
		outdated: number;
		abandoned: number;
		cve: number;
		highestSeverity: RadarSeverity | null;
	};
}

/**
 * Compute the security radar for a site. `vulnFeed` is optional — when the CVE
 * feed is OFF (the default) only outdated + abandoned contribute, and the cve
 * column stays dark. `now` is injectable for deterministic tests.
 */
/** Is this plugin's wp.org `last_updated` older than the abandoned-age threshold? */
function isStaleByAge(
	lastUpdated: string | null | undefined,
	now: Date
): boolean {
	if (!lastUpdated) {
		return false;
	}
	const ts = Date.parse(lastUpdated);
	return !Number.isNaN(ts) && now.getTime() - ts > ABANDONED_MS;
}

/** Pick the abandoned-evidence label from the two independent signals. */
function abandonedEvidenceOf(
	staleByAge: boolean,
	untested: boolean
): AbandonedEvidence | null {
	if (staleByAge && untested) {
		return "both";
	}
	if (staleByAge) {
		return "stale";
	}
	if (untested) {
		return "untested";
	}
	return null;
}

/**
 * Evaluate ONE active plugin → a FlaggedPlugin, or null when it carries no risk.
 * Pulled out of the main loop to keep that function's complexity low and the
 * per-plugin policy easy to read/test.
 */
function evaluatePlugin(
	p: SiteInsights["plugins"][number],
	wpVersion: string,
	vulnFeed: VulnFeed | undefined,
	now: Date
): FlaggedPlugin | null {
	const reasons = new Set<RadarReason>();

	if (p.update_available) {
		reasons.add("outdated");
	}

	// Abandoned: TWO independent free wp.org signals — stale release date OR a
	// "tested up to" that trails the running WP by ABANDONED_WP_MINORS+ minors.
	const staleByAge = isStaleByAge(p.last_updated, now);
	const minorsBehind = wpMinorsBehind(p.tested, wpVersion);
	const untested = minorsBehind !== null && minorsBehind >= ABANDONED_WP_MINORS;
	if (staleByAge || untested) {
		reasons.add("abandoned");
	}

	const cves = vulnFeed?.[p.slug]
		? matchingCves(p.version, vulnFeed[p.slug] ?? [])
		: [];
	if (cves.length > 0) {
		reasons.add("cve");
	}

	if (reasons.size === 0) {
		return null;
	}

	return {
		slug: p.slug,
		name: p.name,
		version: p.version,
		reasons: [...reasons],
		severity: rowSeverity(reasons, cves),
		highestSeverity: highestSeverity(cves),
		lastUpdated: p.last_updated ?? null,
		testedUpTo: p.tested ?? null,
		wpMinorsBehind: untested ? minorsBehind : null,
		abandonedEvidence: reasons.has("abandoned")
			? abandonedEvidenceOf(staleByAge, untested)
			: null,
		newVersion: p.new_version,
		cves,
		suggestedAction: suggestAction(reasons, cves),
	};
}

export function computeSecurityRadar(
	insights: SiteInsights,
	vulnFeed?: VulnFeed,
	now: Date = new Date()
): SecurityRadar {
	const flagged: FlaggedPlugin[] = [];
	const wpVersion = insights.wp_core.version;

	for (const p of insights.plugins) {
		if (p.status !== "active") {
			continue; // inactive plugins are not an attack surface; skip.
		}
		const row = evaluatePlugin(p, wpVersion, vulnFeed, now);
		if (row) {
			flagged.push(row);
		}
	}

	// Order most-urgent first by each row's overall severity (CVE rating when one
	// matched, otherwise the maintenance-signal fallback), then by slug for stability.
	flagged.sort((a, b) => {
		const sa = SEVERITY_RANK[a.severity];
		const sb = SEVERITY_RANK[b.severity];
		if (sa !== sb) {
			return sa - sb;
		}
		return a.slug.localeCompare(b.slug);
	});

	// Roll the WHOLE list up to a single worst-case severity (the first row, since
	// the list is already sorted most-urgent first) so the GUI can colour its header.
	const summary = {
		total: flagged.length,
		outdated: flagged.filter((f) => f.reasons.includes("outdated")).length,
		abandoned: flagged.filter((f) => f.reasons.includes("abandoned")).length,
		cve: flagged.filter((f) => f.reasons.includes("cve")).length,
		highestSeverity: flagged.length > 0 ? (flagged[0]?.severity ?? null) : null,
	};

	return { flagged, summary };
}
