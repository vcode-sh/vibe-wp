import { env } from "@control-panel/env/server";
import { z } from "zod";

import type { SecurityStatus } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseSecurityStatus } from "../core-bridge/parse";
import { parseInsights } from "../core-bridge/parse-insights";
import {
	computeSecurityScore,
	type SecurityScore,
} from "../core-bridge/security-score";
import { findSite } from "../core-bridge/sites";
import { operatorProcedure } from "../procedures";

/**
 * Per-site security score — composes the Insights mu-plugin posture (WordPress)
 * with the host security-status (firewall/fail2ban/auto-updates) into a graded
 * score + prioritized, fixable findings. Host status is best-effort: a site is
 * still scored on its own posture when the host check is unavailable.
 */
export const securityScoreRouter = {
	siteSecurityScore: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<SecurityScore | null> => {
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

			let host: SecurityStatus | undefined;
			try {
				const sec = await runVibe(
					env.PANEL_HOST_DIR,
					"prod",
					"securityStatus",
					{ timeoutMs: 10_000 }
				);
				if (sec.code === 0) {
					host = parseSecurityStatus(sec.stdout);
				}
			} catch {
				host = undefined; // best-effort — WP posture still scores
			}

			return computeSecurityScore(insights, host);
		}),
};
