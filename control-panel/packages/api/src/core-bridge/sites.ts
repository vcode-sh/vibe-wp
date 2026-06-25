import { env } from "@control-panel/env/server";

import { hostFromUrl, parseEnvFile } from "./parse";
import { redact } from "./redact";
import { slugFromComposeProject } from "./site-slug";

const STRIP_BIN_VIBE = /\/bin\/vibe$/;
const TRAILING_CR = /\r$/;

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

/** Parse the numeric port from an HTTP_PORT value like "127.0.0.1:18000". */
function httpPortOf(value: string | undefined): number | null {
	if (!value) {
		return null;
	}
	const port = Number(value.trim().split(":").pop());
	return Number.isInteger(port) && port > 0 ? port : null;
}

/** Coerce a string field to a positive integer port, or null. */
function portNum(value: string | undefined): number | null {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Parse one sanitized TSV row from the wrapper's `siteinfo` into a DetectedSite.
 * Columns: installDir  slug(caddy)  domain  prodPort  stagePort  hasStaging  stagingDomain
 * Returns null for a blank/malformed row (missing install dir or domain).
 */
function parseSiteinfoRow(raw: string): DetectedSite | null {
	const line = raw.replace(TRAILING_CR, "");
	if (!line.trim()) {
		return null;
	}
	const cols = line.split("\t");
	const installDir = cols[0];
	const domain = cols[2];
	if (!(installDir && domain)) {
		return null;
	}
	const slug = installDir.split("/").filter(Boolean).pop() ?? installDir;
	const caddySlug = cols[1];
	const staged = cols[5] === "1";
	const stagingDomain = cols[6];
	return {
		id: slug,
		slug,
		caddySlug: caddySlug || slug,
		installDir,
		domain,
		hasStaging: staged,
		stagingDomain: staged && stagingDomain ? stagingDomain : null,
		prodPort: portNum(cols[3]),
		stagePort: portNum(cols[4]),
	};
}

/**
 * Privileged path: the panel runs unprivileged and CANNOT read the 0600 root
 * env files. Obtain the site list from the root-owned wrapper, which reads those
 * files itself and prints ONLY sanitized non-secret fields (see parseSiteinfoRow
 * for the columns). The caddy-derived slug becomes caddySlug; the panel's stable
 * id/slug stays the install-dir tail (unchanged contract). No secret ever reaches
 * the panel here.
 */
async function detectSitesViaRunner(runner: string): Promise<DetectedSite[]> {
	const proc = Bun.spawn(["sudo", "-n", runner, "siteinfo"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	// A non-zero exit means sudo/the wrapper itself failed (e.g. the sudoers rule
	// is missing or the wrapper is gone). Surfacing an empty list here would make
	// the panel wrongly report "no sites", so THROW with the captured stderr.
	if (code !== 0) {
		throw new Error(
			`privileged site listing failed (exit ${code}): ${redact(err).trim()}`
		);
	}
	const sites: DetectedSite[] = [];
	for (const raw of out.split("\n")) {
		const site = parseSiteinfoRow(raw);
		if (site) {
			sites.push(site);
		}
	}
	return sites;
}

/**
 * Find bin/vibe marker files under one root via an argv `find` (no shell).
 * `find` itself reports a missing/unreadable root on stderr and exits non-zero;
 * we pipe stderr away and treat any failure as "no matches", matching the old
 * `[ -d "$root" ] && ... 2>/dev/null` behavior.
 */
async function findVibeBinsUnder(root: string): Promise<string[]> {
	const proc = Bun.spawn(
		["find", root, "-maxdepth", "4", "-type", "f", "-path", "*/bin/vibe"],
		{ stdout: "pipe", stderr: "ignore" }
	);
	const out = await new Response(proc.stdout).text();
	return out
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
}

/** Dev path: read the env files directly (panel runs as a user that can read them). */
async function detectSitesDirect(): Promise<DetectedSite[]> {
	// Iterate roots in TypeScript and spawn `find` per-root with an argv array.
	// Never interpolate env-derived values into a shell string.
	const roots = env.PANEL_SITES_ROOTS.split(":").filter(Boolean);
	const found = await Promise.all(roots.map((root) => findVibeBinsUnder(root)));
	const dirs = found.flat().map((p) => p.replace(STRIP_BIN_VIBE, ""));

	const sites: DetectedSite[] = [];
	for (const dir of dirs) {
		const prod = parseEnvFile(await readFileSafe(`${dir}/env/prod.env`));
		const stage = parseEnvFile(await readFileSafe(`${dir}/env/stage.env`));
		// Shared-database sites have NO prod.env — their production-equivalent
		// non-secret fields live in env/shared-db.env. Use whichever carries the
		// production WP_HOME as the primary source so these sites are listed too.
		const shared = parseEnvFile(await readFileSafe(`${dir}/env/shared-db.env`));
		const primary = prod.WP_HOME ? prod : shared;
		const home = primary.WP_HOME ?? stage.WP_HOME;
		if (!home) {
			continue;
		}
		const slug = dir.split("/").filter(Boolean).pop() ?? dir;
		sites.push({
			id: slug,
			slug,
			caddySlug: slugFromComposeProject(primary.COMPOSE_PROJECT_NAME, slug),
			installDir: dir,
			domain: hostFromUrl(home),
			hasStaging: Boolean(stage.WP_HOME),
			stagingDomain: stage.WP_HOME ? hostFromUrl(stage.WP_HOME) : null,
			prodPort: httpPortOf(primary.HTTP_PORT),
			stagePort: httpPortOf(stage.HTTP_PORT),
		});
	}
	return sites;
}

export function detectSites(): Promise<DetectedSite[]> {
	const runner = process.env.PANEL_PRIVILEGED_RUNNER;
	if (runner && runner.length > 0) {
		return detectSitesViaRunner(runner);
	}
	return detectSitesDirect();
}

export async function findSite(siteId: string): Promise<DetectedSite | null> {
	return (await detectSites()).find((s) => s.id === siteId) ?? null;
}
