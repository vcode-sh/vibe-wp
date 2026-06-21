import { z } from "zod";

import type { SiteOverview, SiteSummary } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { parseBackups, parseSmoke } from "../core-bridge/parse";
import { detectSites, findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

async function siteStatus(installDir: string): Promise<SiteSummary["status"]> {
	const { stdout, code } = await runVibe(installDir, "prod", "smoke");
	return code === 0 && parseSmoke(stdout).passed ? "good" : "act";
}

export const sitesRouter = {
	sitesList: protectedProcedure.handler(async (): Promise<SiteSummary[]> => {
		const sites = await detectSites();
		return Promise.all(
			sites.map(async (s) => ({
				id: s.id,
				name: s.slug,
				domain: s.domain,
				hasStaging: s.hasStaging,
				status: await siteStatus(s.installDir),
				lastBackupISO:
					parseBackups(
						(await runVibe(s.installDir, "prod", "backups")).stdout
					)[0]?.whenISO ?? new Date(0).toISOString(),
			}))
		);
	}),

	siteOverview: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<SiteOverview> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new Error("Unknown site");
			}
			const { stdout } = await runVibe(site.installDir, "prod", "smoke");
			const smoke = parseSmoke(stdout);
			const status = smoke.passed ? "good" : "act";
			return {
				siteId: site.id,
				status,
				headline: smoke.passed
					? `${site.slug} is healthy.`
					: `${site.slug} needs attention.`,
				subline: site.domain,
				needs: [],
				tiles: smoke.checks.slice(0, 4).map((c) => ({
					key: c.name,
					label: c.name,
					verdict: c.ok ? "good" : ("act" as const),
					value: c.ok ? "OK" : "Failing",
					detail: c.name,
					help: "From the latest smoke check.",
				})),
				safety: {
					backupText: "Backups available",
					backupDetail: "See the Backups tab",
					securityText: "Managed by Vibe WP",
					securityDetail: "Firewall + auto-updates",
				},
				activity: [],
			};
		}),
};
