import type { RouterClient } from "@orpc/server";

import { backupsRouter } from "./backups";
import { controlOverviewRouter } from "./control-overview";
import { healthRouter } from "./health";
import { logsRouter } from "./logs";
import { operationsRouter } from "./operations";
import { serverRouter } from "./server";
import { sitesRouter } from "./sites";
import { stagingRouter } from "./staging";

export const appRouter = {
	...healthRouter,
	...controlOverviewRouter,
	...sitesRouter,
	...backupsRouter,
	...operationsRouter,
	...serverRouter,
	...stagingRouter,
	...logsRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
