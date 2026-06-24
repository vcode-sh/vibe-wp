import { z } from "zod";

import { startJob } from "../core-bridge/jobs";
import { assertSlug, procedureFor } from "../core-bridge/wp-actions";

const SlugInput = z.object({ siteId: z.string(), slug: z.string() });

export const themesRouter = {
	themeActivate: procedureFor("theme.activate")
		.input(SlugInput)
		.handler(({ input, context }) => {
			assertSlug(input.slug, "theme");
			return startJob({
				op: "wpThemeActivate",
				siteId: input.siteId,
				env: "prod",
				kind: "wpThemeActivate",
				args: [input.slug],
				userId: context.session.user.id,
				action: "themeActivate",
			});
		}),

	themeUpdate: procedureFor("theme.update")
		.input(SlugInput)
		.handler(({ input, context }) => {
			assertSlug(input.slug, "theme");
			return startJob({
				op: "wpThemeUpdate",
				siteId: input.siteId,
				env: "prod",
				kind: "wpThemeUpdate",
				args: [input.slug],
				userId: context.session.user.id,
				action: "themeUpdate",
			});
		}),

	themeDelete: procedureFor("theme.delete")
		.input(SlugInput)
		.handler(({ input, context }) => {
			assertSlug(input.slug, "theme");
			return startJob({
				op: "wpThemeDelete",
				siteId: input.siteId,
				env: "prod",
				kind: "wpThemeDelete",
				args: [input.slug],
				userId: context.session.user.id,
				action: "themeDelete",
			});
		}),

	themeAutoUpdate: procedureFor("theme.autoUpdate")
		.input(SlugInput.extend({ enabled: z.boolean() }))
		.handler(({ input, context }) => {
			assertSlug(input.slug, "theme");
			return startJob({
				op: input.enabled
					? "wpThemeAutoUpdatesEnable"
					: "wpThemeAutoUpdatesDisable",
				siteId: input.siteId,
				env: "prod",
				kind: "wpThemeAutoUpdate",
				args: [input.slug],
				userId: context.session.user.id,
				action: "themeAutoUpdate",
			});
		}),
};
