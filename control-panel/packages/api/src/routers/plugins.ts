import { z } from "zod";

import { startJob } from "../core-bridge/jobs";
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
};
