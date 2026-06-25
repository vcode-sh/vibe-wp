import { z } from "zod";

import type { StagingInfo } from "../contract";
import { startJob } from "../core-bridge/jobs";
import { hostFromUrl, parseEnvFile } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { startStagingPushToLive } from "../core-bridge/staging-push";
import {
	adminProcedure,
	operatorProcedure,
	protectedProcedure,
} from "../procedures";

export const stagingRouter = {
	stagingInfo: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<StagingInfo> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { present: false, url: null };
			}
			const stageText = await Bun.file(`${site.installDir}/env/stage.env`)
				.text()
				.catch(() => "");
			const stage = parseEnvFile(stageText);
			return stage.WP_HOME
				? { present: true, url: hostFromUrl(stage.WP_HOME), noindex: true }
				: { present: false, url: null };
		}),

	stagingRefresh: operatorProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input, context }) =>
			startJob({
				op: "refresh",
				siteId: input.siteId,
				env: "stage",
				kind: "refresh",
				userId: context.session.user.id,
				action: "refresh",
			})
		),

	// Legacy raw promotion (no auto-rollback). Kept for back-compat; the staging
	// UI now drives the safe stagingPushToLive path below instead.
	stagingPromote: adminProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input, context }) =>
			startJob({
				op: "promote",
				siteId: input.siteId,
				env: "stage",
				kind: "promote",
				userId: context.session.user.id,
				action: "promote",
			})
		),

	// Safe "Push staging to live": backs prod up first, promotes (with the
	// script's own backup suppressed), runs prod smoke + a homepage TTFB check,
	// and AUTO-ROLLS-BACK to the captured snapshot on any failure. Streamed like
	// safeUpdate; returns a jobId for the operations tray. Admin-gated because it
	// replaces the whole live site (matching the stagingPromote tier).
	stagingPushToLive: adminProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(({ input, context }) =>
			startStagingPushToLive({
				siteId: input.siteId,
				userId: context.session.user.id,
			})
		),
};
