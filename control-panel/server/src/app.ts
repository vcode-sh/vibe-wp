import { Hono } from "hono";

import { registerAuthRoutes } from "./http/auth";
import { registerHealthRoutes } from "./http/health";
import { registerGlobalMiddleware } from "./http/middleware";
import { registerRpcRoutes } from "./orpc/register";

export function createServerApp() {
	const app = new Hono();

	registerGlobalMiddleware(app);
	registerAuthRoutes(app);
	registerRpcRoutes(app);
	registerHealthRoutes(app);

	return app;
}
