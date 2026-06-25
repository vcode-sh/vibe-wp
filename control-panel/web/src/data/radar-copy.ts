import type { FlaggedPlugin } from "./types";

/**
 * Pure, plain-language copy helpers for the Security Radar GUI. Kept out of the
 * React component so the (non-trivial) wording logic is unit-testable and the
 * card stays presentational. Everything here is operator-facing English meant for
 * a NON-technical reader: no jargon, always says what is wrong AND what to do.
 */

export type RadarReason = FlaggedPlugin["reasons"][number];
export type RadarSeverity = FlaggedPlugin["severity"];
export type SuggestedAction = FlaggedPlugin["suggestedAction"];

/** Maps a severity to a semantic token class + a human label for the GUI dot/badge. */
export const SEVERITY_META: Record<
	RadarSeverity,
	{ label: string; dotClass: string; textClass: string }
> = {
	critical: {
		label: "Critical",
		dotClass: "bg-destructive",
		textClass: "text-destructive",
	},
	high: {
		label: "High",
		dotClass: "bg-destructive",
		textClass: "text-destructive",
	},
	medium: {
		label: "Medium",
		dotClass: "bg-warning",
		textClass: "text-warning",
	},
	low: {
		label: "Low",
		dotClass: "bg-warning",
		textClass: "text-warning",
	},
};

/** Short badge label for a reason chip. */
export const REASON_LABEL: Record<RadarReason, string> = {
	outdated: "Update available",
	abandoned: "Looks unmaintained",
	cve: "Known security flaw",
};

/**
 * One plain-language sentence explaining WHY a single reason fired for this
 * plugin, written for a non-technical operator. The abandoned copy adapts to the
 * specific evidence (out-of-date release vs. never tested against this WordPress).
 */
export function reasonExplanation(
	reason: RadarReason,
	flagged: FlaggedPlugin
): string {
	if (reason === "outdated") {
		return flagged.newVersion
			? `A newer version (${flagged.newVersion}) is available — updating fixes known bugs and security patches.`
			: "A newer version is available — updating keeps it patched.";
	}
	if (reason === "cve") {
		const ids = flagged.cves.map((c) => c.id).join(", ");
		return `This exact version is listed in a public vulnerability database${
			ids ? ` (${ids})` : ""
		}. Attackers can look up and exploit it.`;
	}
	// abandoned
	switch (flagged.abandonedEvidence) {
		case "stale":
			return "The author hasn't released an update in over two years. Unmaintained plugins are a common way sites get hacked.";
		case "untested": {
			const behind = flagged.wpMinorsBehind;
			const tail = flagged.testedUpTo
				? ` Its author only tested it up to WordPress ${flagged.testedUpTo}`
				: " Its author hasn't confirmed it works with current WordPress";
			return `${tail}${
				behind ? `, ${behind} releases behind your site` : ""
			}. It may break or go unpatched.`;
		}
		default:
			return "It hasn't been updated in over two years AND was never tested against current WordPress — a strong sign it's abandoned.";
	}
}

/** A one-line guidance sentence for the recommended action on this plugin. */
export function actionGuidance(flagged: FlaggedPlugin): string {
	if (flagged.suggestedAction === "deactivate") {
		return flagged.reasons.includes("cve")
			? "No safe fix is available, so the safest move is to deactivate it until the author ships a patch."
			: "There's nothing newer to update to, so the safest move is to deactivate it.";
	}
	return "Recommended: run a safe update — we snapshot first, check the site still responds, and roll back automatically if anything breaks.";
}

/** Human label for the primary action button. */
export function actionButtonLabel(action: SuggestedAction): string {
	return action === "deactivate" ? "Deactivate" : "Update safely";
}

/** A compact rollup sentence for the card header. */
export function summaryLabel(summary: FlaggedPluginSummary): string {
	const parts: string[] = [];
	if (summary.cve > 0) {
		parts.push(`${summary.cve} with a known security flaw`);
	}
	if (summary.abandoned > 0) {
		parts.push(`${summary.abandoned} unmaintained`);
	}
	if (summary.outdated > 0) {
		parts.push(`${summary.outdated} out of date`);
	}
	if (parts.length === 0) {
		return "Nothing flagged — every active plugin is current and maintained.";
	}
	const total = summary.total;
	return `${total} active ${
		total === 1 ? "plugin needs" : "plugins need"
	} attention: ${parts.join(" · ")}.`;
}

export interface FlaggedPluginSummary {
	abandoned: number;
	cve: number;
	highestSeverity: RadarSeverity | null;
	outdated: number;
	total: number;
}
