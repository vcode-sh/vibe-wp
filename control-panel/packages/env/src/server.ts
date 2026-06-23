import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		PANEL_SITES_ROOTS: z.string().default("/opt:/srv"),
		PANEL_HOST_DIR: z.string().default("/opt/vibe-wp"),
		PANEL_VPS_LABEL: z.string().optional(),
		PANEL_INSTALLER_BIN: z
			.string()
			.default("/opt/vibe-wp-panel/bin/vibe-wp-installer"),
		// Root-owned, sudoers-gated wrapper (bin/vibe-panel-run). When set, the
		// unprivileged panel reaches the host only via `sudo -n <runner> …`.
		// Optional: unset in dev/local, where the panel spawns directly.
		PANEL_PRIVILEGED_RUNNER: z.string().optional(),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
