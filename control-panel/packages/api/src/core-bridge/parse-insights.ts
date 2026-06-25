import { z } from "zod";
import type { SiteInsights } from "../contract";

const MAX_BYTES = 512 * 1024;

const UpdateableItem = {
	slug: z.string().max(200),
	name: z.string().max(500),
	version: z.string().max(50),
	update_available: z.boolean(),
	new_version: z.string().max(50).nullable(),
	auto_update: z.boolean().nullable(),
};

const PluginRecord = z.object({
	...UpdateableItem,
	status: z.enum(["active", "inactive", "must-use", "dropin"]),
	// wp.org metadata for the abandoned-plugin radar. ADDITIVE + OPTIONAL +
	// NULLABLE so an OLD drop-file (written before the collector emitted these)
	// still parses — never make these required or old payloads 500 the panel.
	last_updated: z.string().max(40).nullable().optional(),
	active_installs: z.number().int().nonnegative().nullable().optional(),
	tested: z.string().max(20).nullable().optional(),
});

const ThemeRecord = z.object({
	...UpdateableItem,
	status: z.enum(["active", "parent", "inactive"]),
});

const HealthIssue = z.object({
	label: z.string().max(500),
	description: z.string().max(2000),
	test: z.string().max(200),
});

const InsightsSchema = z.object({
	schema_version: z.literal(1),
	generated_at: z.string().max(40),
	site_url: z.string().max(500),
	wp_core: z.object({
		version: z.string().max(20),
		update_available: z.boolean(),
		new_version: z.string().max(20).nullable(),
	}),
	php_version: z.string().max(30),
	db: z.object({
		size_bytes: z.number().int().nonnegative(),
		engine: z.string().max(50),
		server_version: z.string().max(100),
	}),
	plugins: z.array(PluginRecord).max(500),
	themes: z.array(ThemeRecord).max(100),
	users: z.object({
		count: z.number().int().nonnegative(),
		admin_count: z.number().int().nonnegative(),
		last_login: z.string().nullable(),
	}),
	site_health: z.object({
		collected_at: z.string().max(40),
		critical: z.array(HealthIssue).max(50),
		recommended: z.array(HealthIssue).max(100),
	}),
	signals: z.object({
		xmlrpc_enabled: z.boolean(),
		file_edit_enabled: z.boolean(),
		debug_on: z.boolean(),
		debug_log_on: z.boolean(),
		debug_display_on: z.boolean(),
		script_debug_on: z.boolean(),
		auto_update_core: z.enum(["minor", "major", "off"]),
		cron_disabled: z.boolean(),
	}),
	object_cache: z.object({
		enabled: z.boolean(),
		type: z.enum(["redis", "memcached", "apcu", "none"]),
		dropin_present: z.boolean(),
	}),
	fastcgi_cache: z.object({ enabled: z.boolean() }),
});

/** Strict parse of the untrusted drop-file. Throws on oversize/malformed/unknown-shape. */
export function parseInsights(stdout: string): SiteInsights {
	if (stdout.length > MAX_BYTES) {
		throw new Error(`insights payload too large (> ${MAX_BYTES} bytes)`);
	}
	return InsightsSchema.parse(JSON.parse(stdout.trim())) as SiteInsights;
}
