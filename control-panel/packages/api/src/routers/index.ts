import type { RouterClient } from "@orpc/server";

import { backupsRouter } from "./backups";
import { controlOverviewRouter } from "./control-overview";
import { healthRouter } from "./health";
import { lifecycleRouter } from "./lifecycle";
import { logsRouter } from "./logs";
import { operationsRouter } from "./operations";
import { serverRouter } from "./server";
import { sitesRouter } from "./sites";
import { stagingRouter } from "./staging";
import { updatesRouter } from "./updates";

export const appRouter = {
	...healthRouter,
	...controlOverviewRouter,
	...lifecycleRouter,
	...sitesRouter,
	...backupsRouter,
	...operationsRouter,
	...serverRouter,
	...stagingRouter,
	...logsRouter,
	...updatesRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
