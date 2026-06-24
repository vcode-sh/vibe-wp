import { z } from "zod";

import { runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { findSite } from "../core-bridge/sites";
import { assertSlug, procedureFor } from "../core-bridge/wp-actions";

const SlugInput = z.object({ siteId: z.string(), slug: z.string() });

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
};
