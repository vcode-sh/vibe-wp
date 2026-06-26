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
		PANEL_HOST_DIR: z.string().default("/opt/vibe-wp-src"),
		PANEL_VPS_LABEL: z.string().optional(),
		PANEL_INSTALLER_BIN: z
			.string()
			.default("/opt/vibe-wp-panel/bin/vibe-wp-installer"),
		// Root-owned, sudoers-gated wrapper (bin/vibe-panel-run). When set, the
		// unprivileged panel reaches the host only via `sudo -n <runner> …`.
		// Optional: unset in dev/local, where the panel spawns directly.
		PANEL_PRIVILEGED_RUNNER: z.string().optional(),
		// An OPTIONAL custom control-panel domain (e.g. https://panel.theirsite.com)
		// ADDED to the panel's trusted origins ALONGSIDE the primary magic-DNS origin
		// (BETTER_AUTH_URL / CORS_ORIGIN stay primary). Written by bin/panel-domain-apply
		// into the panel's OWN env file (NOT injected via sudo opts.env — so it stays
		// out of bin/panel's panel_env_keep and the env-keep drift test). Lets
		// better-auth + CORS accept requests on BOTH the magic-DNS host and the custom
		// domain without invalidating the existing magic-DNS session. Unset = no custom
		// domain configured yet.
		PANEL_EXTRA_TRUSTED_ORIGIN: z.url().optional(),
		// How often (minutes) the panel records a fresh monitor sample for every
		// site, so uptime/cert/DNS history accrues without anyone opening the
		// status view. Reuses the already-allowlisted `monitor` op (no new host
		// capability). Clamped to [5, 1440]; "0"/"off"/unset disables the timer
		// (operators then rely on the on-demand "Record sample" button). Default
		// 15 minutes — frequent enough for a readable sparkline, light on the host.
		PANEL_MONITOR_RECORD_MINUTES: z.string().default("15"),
		// How often (minutes) the panel refreshes expensive per-site overview
		// snapshots in SQLite. UI reads stay fast; this worker performs the host
		// probes in the background. Clamped to [1, 1440]; "0"/"off" disables the
		// timer (operation-finish refreshes and request-triggered refreshes still run).
		PANEL_OVERVIEW_REFRESH_MINUTES: z.string().default("5"),
		// Feature E: OPTIONAL CVE feed for the Security Radar. BOTH default to
		// undefined = feed OFF (the vuln-feed-fetch op is a `{}` no-op). When an
		// operator licenses a source (WPScan/Patchstack/curated JSON — an OPEN
		// product decision), they point PANEL_VULN_FEED_URL at it; PANEL_VULN_FEED_KEY
		// is the optional API key. These are env-file-only secrets (never argv/logs).
		PANEL_VULN_FEED_URL: z.string().optional(),
		PANEL_VULN_FEED_KEY: z.string().optional(),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
