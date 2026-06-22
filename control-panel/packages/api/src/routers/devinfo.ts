import { ORPCError } from "@orpc/server";
import { z } from "zod";

import { runVibe } from "../core-bridge/exec";
import { type ContainerStatus, parseComposePsJson } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

/**
 * Non-secret env keys surfaced in the Developer details panel.
 * Never include passwords, salts, tokens, or any AUTH_KEY/SECURE_AUTH
 * variants here.
 */
const NON_SECRET_KEYS = [
	"WP_HOME",
	"COMPOSE_PROJECT_NAME",
	"WP_ENVIRONMENT_TYPE",
	"WORDPRESS_IMAGE",
	"WP_MEMORY_LIMIT",
	"WP_MAX_MEMORY_LIMIT",
	"WP_CACHE",
	"WP_DEBUG_LOG",
	"HTTP_PORT",
] as const;

export interface DevInfo {
	containers: ContainerStatus[];
	env: Record<string, string>;
}

export const devinfoRouter = {
	devInfo: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<DevInfo> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new ORPCError("NOT_FOUND");
			}

			// Fetch container status and env keys concurrently.
			const [psResult, ...envResults] = await Promise.all([
				runVibe(site.installDir, "prod", "psJson", { timeoutMs: 15_000 }),
				...NON_SECRET_KEYS.map((key) =>
					runVibe(site.installDir, "prod", "env", {
						args: [key],
						timeoutMs: 5000,
					})
				),
			]);

			const containers = parseComposePsJson(psResult.stdout);

			const env: Record<string, string> = {};
			for (let i = 0; i < NON_SECRET_KEYS.length; i++) {
				const key = NON_SECRET_KEYS[i];
				const value = (envResults[i]?.stdout ?? "").trim();
				if (key && value) {
					env[key] = value;
				}
			}

			return { containers, env };
		}),
};
