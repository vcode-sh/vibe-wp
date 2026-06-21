import { createContext } from "@control-panel/api/context";
import type { Hono } from "hono";

import { createOpenApiHandler, createRpcHandler } from "./handlers";

export function registerRpcRoutes(app: Hono) {
	const openApiHandler = createOpenApiHandler();
	const rpcHandler = createRpcHandler();

	app.use("/*", async (c, next) => {
		const context = await createContext({ context: c });

		const rpcResult = await rpcHandler.handle(c.req.raw, {
			prefix: "/rpc",
			context,
		});

		if (rpcResult.matched) {
			return c.newResponse(rpcResult.response.body, rpcResult.response);
		}

		const apiResult = await openApiHandler.handle(c.req.raw, {
			prefix: "/api-reference",
			context,
		});

		if (apiResult.matched) {
			return c.newResponse(apiResult.response.body, apiResult.response);
		}

		await next();
	});
}
