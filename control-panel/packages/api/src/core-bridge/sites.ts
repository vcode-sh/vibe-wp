import { env } from "@control-panel/env/server";

import { hostFromUrl, parseEnvFile } from "./parse";

const STRIP_BIN_VIBE = /\/bin\/vibe$/;
const COMPOSE_PROJECT_PREFIX = /^vibe-wp-/;
const COMPOSE_PROJECT_PROD_SUFFIX = /-prod$/;

export interface DetectedSite {
	/**
	 * The AUTHORITATIVE site slug, recovered from the production
	 * COMPOSE_PROJECT_NAME (`vibe-wp-<slug>-prod`). This is what the installer's
	 * env-writer, the Caddy snippet (`/etc/caddy/sites-enabled/vibe-wp-<slug>.caddy`,
	 * `-stage.caddy`), and the compose project are all named after — so it is the
	 * only correct slug for provisioning ops on an existing site. The install-dir
	 * tail (`slug`) can differ and MUST NOT be used for teardown.
	 */
	caddySlug: string;
	domain: string;
	hasStaging: boolean;
	id: string;
	installDir: string;
	/** Real production HTTP port from prod.env (HTTP_PORT), or null. */
	prodPort: number | null;
	/** Display slug = install-dir tail; the panel's stable addressing id too. */
	slug: string;
	/** Real staging HTTP port from stage.env (HTTP_PORT), or null. */
	stagePort: number | null;
	/** Staging hostname from stage.env WP_HOME, or null when no staging. */
	stagingDomain: string | null;
}

async function readFileSafe(path: string): Promise<string> {
	try {
		return await Bun.file(path).text();
	} catch {
		return "";
	}
}

/** Recover the authoritative slug from `vibe-wp-<slug>-prod`. */
function slugFromComposeProject(
	project: string | undefined,
	fallback: string
): string {
	if (!project) {
		return fallback;
	}
	const slug = project
		.replace(COMPOSE_PROJECT_PREFIX, "")
		.replace(COMPOSE_PROJECT_PROD_SUFFIX, "");
	return slug.length > 0 ? slug : fallback;
}

/** Parse the numeric port from an HTTP_PORT value like "127.0.0.1:18000". */
function httpPortOf(value: string | undefined): number | null {
	if (!value) {
		return null;
	}
	const port = Number(value.trim().split(":").pop());
	return Number.isInteger(port) && port > 0 ? port : null;
}

export async function detectSites(): Promise<DetectedSite[]> {
	const roots = env.PANEL_SITES_ROOTS.split(":").filter(Boolean).join(" ");
	const proc = Bun.spawn(
		[
			"sh",
			"-lc",
			`for root in ${roots}; do [ -d "$root" ] && find "$root" -maxdepth 4 -type f -path '*/bin/vibe' 2>/dev/null; done`,
		],
		{ stdout: "pipe" }
	);
	const out = await new Response(proc.stdout).text();
	const dirs = out
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((p) => p.replace(STRIP_BIN_VIBE, ""));

	const sites: DetectedSite[] = [];
	for (const dir of dirs) {
		const prod = parseEnvFile(await readFileSafe(`${dir}/env/prod.env`));
		const stage = parseEnvFile(await readFileSafe(`${dir}/env/stage.env`));
		const home = prod.WP_HOME ?? stage.WP_HOME;
		if (!home) {
			continue;
		}
		const slug = dir.split("/").filter(Boolean).pop() ?? dir;
		sites.push({
			id: slug,
			slug,
			caddySlug: slugFromComposeProject(prod.COMPOSE_PROJECT_NAME, slug),
			installDir: dir,
			domain: hostFromUrl(home),
			hasStaging: Boolean(stage.WP_HOME),
			stagingDomain: stage.WP_HOME ? hostFromUrl(stage.WP_HOME) : null,
			prodPort: httpPortOf(prod.HTTP_PORT),
			stagePort: httpPortOf(stage.HTTP_PORT),
		});
	}
	return sites;
}

export async function findSite(siteId: string): Promise<DetectedSite | null> {
	return (await detectSites()).find((s) => s.id === siteId) ?? null;
}
