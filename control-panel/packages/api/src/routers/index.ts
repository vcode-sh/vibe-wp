import type { RouterClient } from "@orpc/server";

import { backupsRouter } from "./backups";
import { controlOverviewRouter } from "./control-overview";
import { healthRouter } from "./health";
import { operationsRouter } from "./operations";
import { serverRouter } from "./server";
import { sitesRouter } from "./sites";

export const appRouter = {
	...healthRouter,
	...controlOverviewRouter,
	...sitesRouter,
	...backupsRouter,
	...operationsRouter,
	...serverRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
