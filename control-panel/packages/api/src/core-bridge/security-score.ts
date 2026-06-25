import type { SecurityStatus, SiteInsights } from "../contract";

/**
 * Per-site security score — a pure, deterministic aggregation of the signals
 * the platform ALREADY collects (Insights mu-plugin for WordPress posture, the
 * host `security-status` op for firewall/fail2ban/auto-updates). It produces a
 * 0-100 score, a letter grade, and a prioritized list of findings, each tagged
 * with the one-click remediation the panel can offer. No I/O here — the router
 * fetches the inputs and calls computeSecurityScore so this stays unit-testable.
 */

export type Severity = "critical" | "high" | "medium" | "low";

/** The remediation a finding maps to. `null` = informational (no auto-fix). */
export type SecurityFix =
	| { kind: "disableXmlRpc" }
	| { kind: "disableFileEdit" }
	| { kind: "disableDebugDisplay" }
	| { kind: "updateCore" }
	| { kind: "updatePlugins"; slugs: string[] }
	| { kind: "hardenHost" };

export interface SecurityFinding {
	id: string;
	severity: Severity;
	category: "wordpress" | "host";
	title: string;
	detail: string;
	/** Points deducted from 100. */
	weight: number;
	fix: SecurityFix | null;
}

export interface SecurityScore {
	score: number;
	grade: "A" | "B" | "C" | "D" | "F";
	findings: SecurityFinding[];
	summary: Record<Severity, number>;
}

const SEVERITY_RANK: Record<Severity, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
};

function gradeFor(score: number): SecurityScore["grade"] {
	if (score >= 90) {
		return "A";
	}
	if (score >= 75) {
		return "B";
	}
	if (score >= 60) {
		return "C";
	}
	if (score >= 40) {
		return "D";
	}
	return "F";
}

/** WordPress-posture findings derived from the Insights signals + inventory. */
function wordpressFindings(insights: SiteInsights): SecurityFinding[] {
	const out: SecurityFinding[] = [];
	const { signals, wp_core, plugins, site_health } = insights;

	if (signals.debug_display_on) {
		out.push({
			id: "wp-debug-display",
			severity: "high",
			category: "wordpress",
			title: "Debug output is shown to visitors",
			detail:
				"WP_DEBUG_DISPLAY is on in production — PHP errors can leak paths, queries, and secrets to anyone.",
			weight: 20,
			fix: { kind: "disableDebugDisplay" },
		});
	}

	if (wp_core.update_available) {
		out.push({
			id: "wp-core-outdated",
			severity: "high",
			category: "wordpress",
			title: "WordPress core is out of date",
			detail: `Running ${wp_core.version}${
				wp_core.new_version ? ` — ${wp_core.new_version} is available` : ""
			}. Core updates carry security fixes.`,
			weight: 15,
			fix: { kind: "updateCore" },
		});
	}

	const outdatedActive = plugins.filter(
		(p) => p.status === "active" && p.update_available
	);
	if (outdatedActive.length > 0) {
		out.push({
			id: "wp-plugins-outdated",
			severity: "medium",
			category: "wordpress",
			title: `${outdatedActive.length} active plugin${
				outdatedActive.length === 1 ? "" : "s"
			} out of date`,
			detail:
				"Outdated active plugins are the most common WordPress compromise vector.",
			weight: Math.min(20, 4 * outdatedActive.length),
			fix: { kind: "updatePlugins", slugs: outdatedActive.map((p) => p.slug) },
		});
	}

	if (signals.xmlrpc_enabled) {
		out.push({
			id: "wp-xmlrpc",
			severity: "medium",
			category: "wordpress",
			title: "XML-RPC is enabled",
			detail:
				"XML-RPC enables pingback DDoS amplification and password brute-forcing. Most modern sites don't need it.",
			weight: 8,
			fix: { kind: "disableXmlRpc" },
		});
	}

	if (signals.file_edit_enabled) {
		out.push({
			id: "wp-file-edit",
			severity: "medium",
			category: "wordpress",
			title: "Theme/plugin file editor is enabled",
			detail:
				"The dashboard file editor turns any admin-account compromise into server code execution. DISALLOW_FILE_EDIT closes it.",
			weight: 8,
			fix: { kind: "disableFileEdit" },
		});
	}

	const criticalCount = site_health.critical.length;
	if (criticalCount > 0) {
		out.push({
			id: "wp-site-health",
			severity: "high",
			category: "wordpress",
			title: `${criticalCount} critical Site Health issue${
				criticalCount === 1 ? "" : "s"
			}`,
			detail: site_health.critical
				.slice(0, 3)
				.map((i) => i.label)
				.join("; "),
			weight: Math.min(15, 5 * criticalCount),
			fix: null,
		});
	}

	return out;
}

/** Host-posture findings (shared across every site on this VPS). */
function hostFindings(host: SecurityStatus): SecurityFinding[] {
	const out: SecurityFinding[] = [];
	if (!host.firewall) {
		out.push({
			id: "host-firewall",
			severity: "high",
			category: "host",
			title: "Host firewall is inactive",
			detail: "No ufw firewall is active — every host port is exposed.",
			weight: 15,
			fix: { kind: "hardenHost" },
		});
	}
	if (!host.fail2ban) {
		out.push({
			id: "host-fail2ban",
			severity: "medium",
			category: "host",
			title: "fail2ban is not running",
			detail: "Brute-force protection on SSH and auth endpoints is off.",
			weight: 10,
			fix: { kind: "hardenHost" },
		});
	}
	if (!host.autoUpdates) {
		out.push({
			id: "host-auto-updates",
			severity: "low",
			category: "host",
			title: "Unattended OS security updates are off",
			detail: "The host won't auto-apply OS security patches.",
			weight: 5,
			fix: { kind: "hardenHost" },
		});
	}
	return out;
}

/**
 * Compute the security score for a site. `host` is optional — when the host
 * status can't be read, only the WordPress posture contributes (host findings
 * are simply omitted rather than penalized as failures).
 */
export function computeSecurityScore(
	insights: SiteInsights,
	host?: SecurityStatus
): SecurityScore {
	const findings = [
		...wordpressFindings(insights),
		...(host ? hostFindings(host) : []),
	].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

	const deducted = findings.reduce((sum, f) => sum + f.weight, 0);
	const score = Math.max(0, 100 - deducted);

	const summary: Record<Severity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
	};
	for (const f of findings) {
		summary[f.severity] += 1;
	}

	return { score, grade: gradeFor(score), findings, summary };
}
