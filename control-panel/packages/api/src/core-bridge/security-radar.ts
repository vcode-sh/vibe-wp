import type { CveRef, FlaggedPlugin, SiteInsights } from "../contract";

/**
 * Per-site "Security Radar" — a pure, deterministic flagging of risky ACTIVE
 * plugins. No I/O here: the router fetches the inputs (the Insights drop-file,
 * and — when a CVE feed is configured — the vuln-feed map) and calls
 * computeSecurityRadar so this stays unit-testable.
 *
 * THREE REASONS a plugin can be flagged:
 *   - "outdated"  : an update is available (already in the Insights drop-file).
 *   - "abandoned" : the wp.org `last_updated` is older than ABANDONED_MONTHS.
 *                   Plugins with NO last_updated (premium/custom, no wp.org
 *                   metadata) are NEVER flagged abandoned — a missing date is a
 *                   weak signal we deliberately do not over-flag on.
 *   - "cve"       : the installed version falls in a known-vulnerable range from
 *                   the (optional, default-OFF) feed. Dark until a feed is wired.
 *
 * Only ACTIVE plugins are flagged — an inactive plugin is not an attack surface,
 * and quarantine (deactivate) is meaningless for one that is already inactive.
 */

export type RadarReason = "outdated" | "abandoned" | "cve";
export type RadarSeverity = "critical" | "high" | "medium" | "low";
export type SuggestedAction = "update" | "safeUpdate" | "deactivate";

/** Months since wp.org `last_updated` after which an active plugin is "abandoned". */
export const ABANDONED_MONTHS = 24;

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
export function computeSecurityRadar(
	insights: SiteInsights,
	vulnFeed?: VulnFeed,
	now: Date = new Date()
): SecurityRadar {
	const flagged: FlaggedPlugin[] = [];

	for (const p of insights.plugins) {
		if (p.status !== "active") {
			continue; // inactive plugins are not an attack surface; skip.
		}
		const reasons = new Set<RadarReason>();

		if (p.update_available) {
			reasons.add("outdated");
		}

		if (p.last_updated) {
			const ts = Date.parse(p.last_updated);
			if (!Number.isNaN(ts) && now.getTime() - ts > ABANDONED_MS) {
				reasons.add("abandoned");
			}
		}

		const cves = vulnFeed?.[p.slug]
			? matchingCves(p.version, vulnFeed[p.slug] ?? [])
			: [];
		if (cves.length > 0) {
			reasons.add("cve");
		}

		if (reasons.size === 0) {
			continue;
		}

		flagged.push({
			slug: p.slug,
			name: p.name,
			version: p.version,
			reasons: [...reasons],
			highestSeverity: highestSeverity(cves),
			lastUpdated: p.last_updated ?? null,
			newVersion: p.new_version,
			cves,
			suggestedAction: suggestAction(reasons, cves),
		});
	}

	// Order most-urgent first: CVE-flagged (by severity) above the rest.
	flagged.sort((a, b) => {
		const sa = a.highestSeverity ? SEVERITY_RANK[a.highestSeverity] : 99;
		const sb = b.highestSeverity ? SEVERITY_RANK[b.highestSeverity] : 99;
		if (sa !== sb) {
			return sa - sb;
		}
		return a.slug.localeCompare(b.slug);
	});

	const summary = {
		total: flagged.length,
		outdated: flagged.filter((f) => f.reasons.includes("outdated")).length,
		abandoned: flagged.filter((f) => f.reasons.includes("abandoned")).length,
		cve: flagged.filter((f) => f.reasons.includes("cve")).length,
		highestSeverity: highestSeverity(flagged.flatMap((f) => f.cves)),
	};

	return { flagged, summary };
}
