import type { RouterClient } from "@orpc/server";

import { backupsRouter } from "./backups";
import { controlOverviewRouter } from "./control-overview";
import { devinfoRouter } from "./devinfo";
import { healthRouter } from "./health";
import { inventoryRouter } from "./inventory";
import { lifecycleRouter } from "./lifecycle";
import { logsRouter } from "./logs";
import { operationsRouter } from "./operations";
import { pluginsRouter } from "./plugins";
import { provisioningRouter } from "./provisioning";
import { securityRadarRouter } from "./security-radar";
import { securityScoreRouter } from "./security-score";
import { serverRouter } from "./server";
import { settingsRouter } from "./settings";
import { setupRouter } from "./setup";
import { sharedDbRouter } from "./shared-db";
import { sitesRouter } from "./sites";
import { stagingRouter } from "./staging";
import { themesRouter } from "./themes";
import { updatesRouter } from "./updates";

export const appRouter = {
	...setupRouter,
	...healthRouter,
	...controlOverviewRouter,
	...lifecycleRouter,
	...sitesRouter,
	...backupsRouter,
	...operationsRouter,
	...provisioningRouter,
	...serverRouter,
	...stagingRouter,
	...logsRouter,
	...updatesRouter,
	...inventoryRouter,
	...pluginsRouter,
	...themesRouter,
	...settingsRouter,
	...devinfoRouter,
	...sharedDbRouter,
	...securityScoreRouter,
	...securityRadarRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
