import type { Hono } from "hono";

export function registerHealthRoutes(app: Hono) {
	app.get("/", (c) => c.text("OK"));
}
