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
import { applySecurityFix } from "../core-bridge/site-config";
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

	/**
	 * Apply a one-click security hardening fix (disable XML-RPC / file editing) by
	 * writing a single boolean key into the site env file. Returns restartRequired
	 * so the UI offers a watchable "Restart now" lifecycle job — both keys are read
	 * only when the container renders wp-config / MU-plugin behavior at start, so
	 * the fix is inert until then. The score reflects the change on the NEXT
	 * insights collection after the restart.
	 *
	 * Role: operatorProcedure per the feature scope (these are pure hardening
	 * toggles that only ever tighten security and can never leak secrets). NOTE the
	 * other siteConfigApply callers (siteDebugSet/siteFastcgiCacheSet/sitePhpImageSet)
	 * are adminProcedure — this divergence is intentional but a human should confirm
	 * the RBAC choice (see the feature's OPEN DECISION).
	 */
	applySecurityFix: operatorProcedure
		.input(
			z.object({
				siteId: z.string().min(1),
				fix: z.enum(["disableXmlRpc", "disableFileEdit"]),
			})
		)
		.handler(
			async ({ input }) => await applySecurityFix(input.siteId, input.fix)
		),
};
