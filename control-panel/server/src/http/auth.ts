import { auth } from "@control-panel/auth";
import type { Hono } from "hono";

export function registerAuthRoutes(app: Hono) {
	app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
}
