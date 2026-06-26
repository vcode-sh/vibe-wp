import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type { StagingInfo } from "../contract";
import { runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { hostFromUrl, parseEnvFile } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { startStagingPushToLive } from "../core-bridge/staging-push";
import {
	buildStagingSyncPlan,
	type StagingSyncDirection,
} from "../core-bridge/sync-plan";
import {
	adminProcedure,
	operatorProcedure,
	protectedProcedure,
} from "../procedures";

export const stagingRouter = {
	stagingSyncPlan: protectedProcedure
		.input(
			z.object({
				direction: z.enum(["refreshFromProd", "pushFilesToLive"]),
				siteId: z.string(),
			})
		)
		.handler(async ({ input }) => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND", { message: "Unknown site." });
			}
			return buildStagingSyncPlan({
				direction: input.direction as StagingSyncDirection,
				readEnvValue: async (env, key) => {
					const result = await runVibe(site.installDir, env, "env", {
						args: [key],
					});
					return result.stdout.trim();
				},
				site,
			});
		}),

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

	// Legacy raw promotion had no auto-rollback. Keep the procedure name so old
	// clients get a typed error instead of accidentally reaching the unsafe path.
	stagingPromote: adminProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(() => {
			throw new ORPCError("BAD_REQUEST", {
				message: "Use stagingPushToLive; raw staging promotion is disabled.",
			});
		}),

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
