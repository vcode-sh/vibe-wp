import { publicProcedure } from "../procedures";

export const healthRouter = {
	healthCheck: publicProcedure.handler(() => ({
		service: "vibe-wp-control-panel",
		status: "ok",
		checkedAt: new Date().toISOString(),
	})),
};
