import type { RouterClient } from "@orpc/server";

import { controlOverviewRouter } from "./control-overview";
import { healthRouter } from "./health";

export const appRouter = {
	...healthRouter,
	...controlOverviewRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
