import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";

const capabilities = [
	{
		name: "Site inventory",
		status: "planned",
		detail: "Read Vibe WP installs from the headless core and bin/vibe.",
	},
	{
		name: "Operation runner",
		status: "planned",
		detail: "Execute reviewed operations with live progress and redacted logs.",
	},
	{
		name: "Backups",
		status: "planned",
		detail:
			"Surface local and remote backup status without making the database authoritative.",
	},
	{
		name: "Health checks",
		status: "planned",
		detail:
			"Expose smoke, runtime doctor, monitoring, and performance reports.",
	},
] as const;

export const appRouter = {
	healthCheck: publicProcedure.handler(() => ({
		service: "vibe-wp-control-panel",
		status: "ok",
		checkedAt: new Date().toISOString(),
	})),
	controlOverview: protectedProcedure.handler(({ context }) => ({
		currentUser: {
			name: context.session.user.name,
			email: context.session.user.email,
		},
		sourceOfTruth: "bin/vibe + installer headless core",
		databaseRole: "local control-plane metadata only",
		capabilities,
	})),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
