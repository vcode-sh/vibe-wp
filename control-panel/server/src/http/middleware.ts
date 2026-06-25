import { env } from "@control-panel/env/server";
import type { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

export function registerGlobalMiddleware(app: Hono) {
	app.use(logger());
	// The primary magic-DNS origin (CORS_ORIGIN) is ALWAYS allowed. When the owner
	// applies a custom panel domain, bin/panel-domain-apply writes
	// PANEL_EXTRA_TRUSTED_ORIGIN into the panel env, ADDING that origin here so the
	// panel accepts credentialed requests on BOTH hosts. Hono's cors() echoes back
	// whichever request Origin matches an entry in the array (required when
	// credentials:true — a bare "*" is invalid with credentials).
	const allowedOrigins = [
		env.CORS_ORIGIN,
		...(env.PANEL_EXTRA_TRUSTED_ORIGIN ? [env.PANEL_EXTRA_TRUSTED_ORIGIN] : []),
	];
	app.use(
		"/*",
		cors({
			origin: allowedOrigins,
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		})
	);
}
