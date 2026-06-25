// Pure slug helpers for site detection. Kept free of any env/runtime import so
// they can be unit-tested in isolation (sites.ts itself imports the validated
// server env, which fails to load outside a configured runtime).

const COMPOSE_PROJECT_PREFIX = /^vibe-wp-/;
// Strip the topology suffix the env-writer appends: per-DB sites use `-prod`/
// `-stage`; shared-database sites use `-shared-db`; external-services use
// `-external`. Without covering all of them, a shared-db site's caddySlug came
// out as `<slug>-shared-db` and never matched its `vibe-wp-<slug>.caddy` file.
const COMPOSE_PROJECT_SUFFIX = /-(?:prod|stage|shared-db|external)$/;

/**
 * Recover the authoritative slug from a COMPOSE_PROJECT_NAME like
 * `vibe-wp-<slug>-{prod,stage,shared-db,external}`. Falls back to `fallback`
 * (the install-dir tail) when the project name is absent or strips to empty.
 */
export function slugFromComposeProject(
	project: string | undefined,
	fallback: string
): string {
	if (!project) {
		return fallback;
	}
	const slug = project
		.replace(COMPOSE_PROJECT_PREFIX, "")
		.replace(COMPOSE_PROJECT_SUFFIX, "");
	return slug.length > 0 ? slug : fallback;
}
