import { env } from "@control-panel/env/server";
import { z } from "zod";

import type { SecurityRadar } from "../contract";
import { runVibe, runVulnFeed } from "../core-bridge/exec";
import { parseInsights } from "../core-bridge/parse-insights";
import {
	computeSecurityRadar,
	type VulnFeed,
} from "../core-bridge/security-radar";
import { findSite } from "../core-bridge/sites";
import { parseVulnFeed } from "../core-bridge/vuln-feed";
import { operatorProcedure } from "../procedures";

/**
 * Per-site "Security Radar" — flags risky ACTIVE plugins (outdated | abandoned |
 * cve) with a suggested remediation. The data source is the SAME read-only
 * Insights drop-file the inventory already collects (outdated + abandoned work
 * immediately); the CVE feed is best-effort and OFF by default (the vuln-feed
 * op is a `{}` no-op until PANEL_VULN_FEED_URL is configured). Returns null when
 * insights aren't collected yet (mirrors siteSecurityScore).
 */
export const securityRadarRouter = {
	securityRadar: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<SecurityRadar | null> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return null;
			}
			const ins = await runVibe(site.installDir, "prod", "insights", {
				timeoutMs: 10_000,
			});
			if (ins.code !== 0) {
				return null; // insights not collected yet
			}
			const insights = parseInsights(ins.stdout);

			// Best-effort CVE feed: only the ACTIVE plugin slugs, piped on stdin.
			// OFF by default — runVulnFeed returns "{}" without spawning when no
			// PANEL_VULN_FEED_URL is set. A failure here must NOT fail the radar.
			let vulnFeed: VulnFeed | undefined;
			try {
				const activeSlugs = insights.plugins
					.filter((p) => p.status === "active")
					.map((p) => p.slug);
				const raw = await runVulnFeed(env.PANEL_HOST_DIR, activeSlugs, {
					timeoutMs: 15_000,
				});
				const parsed = parseVulnFeed(raw);
				vulnFeed = Object.keys(parsed).length > 0 ? parsed : undefined;
			} catch {
				vulnFeed = undefined; // feed unavailable/malformed → outdated+abandoned only
			}

			return computeSecurityRadar(insights, vulnFeed);
		}),
};
