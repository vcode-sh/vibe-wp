import { z } from "zod";

import { runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { startSafeUpdate } from "../core-bridge/safe-update";
import { findSite } from "../core-bridge/sites";
import { assertSlug, procedureFor } from "../core-bridge/wp-actions";

const SlugInput = z.object({ siteId: z.string(), slug: z.string() });

/**
 * Resolve the inputs safe-update needs: the public URL (for the TTFB probe) and
 * the backup destination. The pre-update snapshot is intentionally LOCAL
 * (env-immune, no network needed for the rollback), so r2 is always false here.
 */
async function resolveSafeUpdateContext(
	siteId: string
): Promise<{ siteUrl: string; r2: boolean }> {
	const site = await findSite(siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	// WP_HOME is the public URL and is in the wrapper's non-secret env allowlist.
	const { stdout } = await runVibe(site.installDir, "prod", "env", {
		args: ["WP_HOME"],
	});
	return { siteUrl: stdout.trim() || "http://localhost", r2: false };
}

export const pluginsRouter = {
	pluginActivate: procedureFor("plugin.activate")
		.input(SlugInput)
		.handler(({ input, context }) => {
			assertSlug(input.slug, "plugin");
			return startJob({
				op: "wpPluginActivate",
				siteId: input.siteId,
				env: "prod",
				kind: "wpPluginActivate",
				args: [input.slug],
				userId: context.session.user.id,
				action: "pluginActivate",
			});
		}),

	pluginDeactivate: procedureFor("plugin.deactivate")
		.input(SlugInput)
		.handler(({ input, context }) => {
			assertSlug(input.slug, "plugin");
			return startJob({
				op: "wpPluginDeactivate",
				siteId: input.siteId,
				env: "prod",
				kind: "wpPluginDeactivate",
				args: [input.slug],
				userId: context.session.user.id,
				action: "pluginDeactivate",
			});
		}),

	pluginUpdate: procedureFor("plugin.update")
		.input(SlugInput)
		.handler(({ input, context }) => {
			assertSlug(input.slug, "plugin");
			return startJob({
				op: "wpPluginUpdate",
				siteId: input.siteId,
				env: "prod",
				kind: "wpPluginUpdate",
				args: [input.slug],
				userId: context.session.user.id,
				action: "pluginUpdate",
			});
		}),

	pluginDelete: procedureFor("plugin.delete")
		.input(SlugInput)
		.handler(({ input, context }) => {
			assertSlug(input.slug, "plugin");
			return startJob({
				op: "wpPluginDelete",
				siteId: input.siteId,
				env: "prod",
				kind: "wpPluginDelete",
				args: [input.slug],
				userId: context.session.user.id,
				action: "pluginDelete",
			});
		}),

	pluginAutoUpdate: procedureFor("plugin.autoUpdate")
		.input(SlugInput.extend({ enabled: z.boolean() }))
		.handler(({ input, context }) => {
			assertSlug(input.slug, "plugin");
			return startJob({
				op: input.enabled
					? "wpPluginAutoUpdatesEnable"
					: "wpPluginAutoUpdatesDisable",
				siteId: input.siteId,
				env: "prod",
				kind: "wpPluginAutoUpdate",
				args: [input.slug],
				userId: context.session.user.id,
				action: "pluginAutoUpdate",
			});
		}),

	setAutoUpdateSchedule: procedureFor("schedule.autoUpdate")
		.input(
			z.object({
				siteId: z.string(),
				cadence: z.enum(["off", "weekly", "daily"]),
			})
		)
		.handler(async ({ input }) => {
			const site = await findSite(input.siteId);
			if (!site) {
				return { ok: false };
			}
			const { code } = await runVibe(
				site.installDir,
				"prod",
				"autoUpdateScheduleApply",
				{ args: [input.cadence], timeoutMs: 30_000 }
			);
			return { ok: code === 0 };
		}),

	safeUpdate: procedureFor("safeUpdate")
		.input(
			z.object({
				siteId: z.string(),
				target: z.discriminatedUnion("kind", [
					z.object({ kind: z.literal("plugin"), slug: z.string() }),
					z.object({ kind: z.literal("theme"), slug: z.string() }),
					z.object({ kind: z.literal("core") }),
				]),
			})
		)
		.handler(async ({ input, context }) => {
			if ("slug" in input.target) {
				assertSlug(input.target.slug, input.target.kind);
			}
			const { siteUrl, r2 } = await resolveSafeUpdateContext(input.siteId);
			return startSafeUpdate({
				siteId: input.siteId,
				env: "prod",
				target: input.target,
				userId: context.session.user.id,
				siteUrl,
				r2,
			});
		}),

	safeUpdateAll: procedureFor("safeUpdate")
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input, context }) => {
			const { siteUrl, r2 } = await resolveSafeUpdateContext(input.siteId);
			return startSafeUpdate({
				siteId: input.siteId,
				env: "prod",
				target: { kind: "allPlugins" },
				userId: context.session.user.id,
				siteUrl,
				r2,
			});
		}),
};
