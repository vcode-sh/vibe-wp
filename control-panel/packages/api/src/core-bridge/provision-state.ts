import type { ProvisionMode } from "./provision";
import { type InstallerStateLike, runHeadlessRequest } from "./provision";
import type { CreateExternalSchema, CreateSiteSchema } from "./provision-input";

/**
 * Build a COMPLETE, valid InstallerState for a provisioning run WITHOUT
 * replicating the installer's defaults/slug/port/dir logic. We ask the installer
 * (over the headless bridge) for a fully-seeded, non-colliding base state, then
 * apply only the validated panel overrides on top.
 *
 * `state` is opaque to the panel (InstallerStateLike): we forward it verbatim
 * and only set the fields the panel owns. Secrets (ext DB/Redis passwords) are
 * set into the state object here and ride the bridge's STDIN JSON — never argv.
 *
 * The override functions are PURE + exported so they can be unit-tested without
 * spawning the installer; the thin async wrappers fetch the base state first.
 */
export async function fetchBaseState(
	mode: ProvisionMode,
	domain?: string
): Promise<InstallerStateLike> {
	const res = await runHeadlessRequest({ kind: "baseState", domain, mode });
	if (res.kind !== "baseState") {
		throw new Error("expected a baseState response from the installer core");
	}
	return res.state;
}

/** Common new-site overrides shared by createSite + createExternal (pure). */
export function applyNewSiteOverrides(
	base: InstallerStateLike,
	input: CreateSiteSchema
): InstallerStateLike {
	const next: InstallerStateLike = {
		...base,
		adminEmail: input.adminEmail.trim(),
		productionDomain: input.domain.trim().toLowerCase(),
		stagingEnabled: input.stagingEnabled,
	};
	if (input.siteTitle) {
		next.siteTitle = input.siteTitle;
	}
	if (input.stagingEnabled && input.stagingDomain) {
		next.stagingDomain = input.stagingDomain.trim().toLowerCase();
	}
	if (input.performancePreset) {
		next.performancePreset = input.performancePreset;
	}
	if (input.backupSchedule) {
		next.backupSchedule = input.backupSchedule;
	}
	if (typeof input.monitorEnabled === "boolean") {
		next.monitorEnabled = input.monitorEnabled;
	}
	return next;
}

/** External DB/Redis overrides on top of the new-site overrides (pure). */
export function applyExternalOverrides(
	base: InstallerStateLike,
	input: CreateExternalSchema
): InstallerStateLike {
	return {
		...applyNewSiteOverrides(base, input),
		extDbHost: input.extDbHost.trim(),
		extDbName: input.extDbName.trim(),
		// Secrets stay in the state object → piped on STDIN by the bridge.
		extDbPassword: input.extDbPassword,
		extDbUser: input.extDbUser.trim(),
		extRedisHost: input.extRedisHost.trim(),
		extRedisPassword: input.extRedisPassword,
		extRedisPort: input.extRedisPort.trim(),
	};
}

/**
 * The AUTHORITATIVE identity of an already-installed site, read from its env
 * files (NOT recomputed by buildBaseState, whose new-site collision-avoidance
 * would BUMP the slug — e.g. shop-com → shop-com-2 — and target a nonexistent
 * Caddy snippet, leaving the deleted site's HTTPS route live). `slug` is the
 * real Caddy/compose slug (`vibe-wp-<slug>.caddy`).
 */
export interface ExistingSiteTarget {
	hasStaging: boolean;
	installDir: string;
	productionDomain: string;
	slug: string;
	stagingDomain: string | null;
}

/** Staging-only overrides for attaching staging to an existing site (pure). */
export function applyAttachStagingOverrides(
	base: InstallerStateLike,
	site: ExistingSiteTarget,
	stagingDomain: string
): InstallerStateLike {
	return {
		...base,
		// Pin the production site's REAL slug so the staging stack + Caddy snippet
		// (vibe-wp-<slug>-stage.caddy) match the live production site.
		siteSlug: site.slug,
		selectedSiteDir: site.installDir,
		installDir: site.installDir,
		productionDomain: site.productionDomain.trim().toLowerCase(),
		stagingDomain: stagingDomain.trim().toLowerCase(),
		stagingEnabled: true,
	};
}

/**
 * Remove-existing overrides; `purge` maps to the installer's fullDelete (pure).
 * Pins the REAL slug + the site's real staging presence/domain so buildRemoveTasks
 * tears down the right Caddy snippets (`vibe-wp-<slug>.caddy` + `-stage.caddy`)
 * and emits stage-down when the site actually has staging.
 */
export function applyRemoveSiteOverrides(
	base: InstallerStateLike,
	site: ExistingSiteTarget,
	purge: boolean
): InstallerStateLike {
	return {
		...base,
		siteSlug: site.slug,
		selectedSiteDir: site.installDir,
		installDir: site.installDir,
		productionDomain: site.productionDomain.trim().toLowerCase(),
		stagingEnabled: site.hasStaging,
		stagingDomain: (site.stagingDomain ?? base.stagingDomain ?? "")
			.toString()
			.trim()
			.toLowerCase(),
		fullDelete: purge,
	};
}

export async function buildCreateSiteState(
	input: CreateSiteSchema
): Promise<InstallerStateLike> {
	return applyNewSiteOverrides(
		await fetchBaseState("new-site", input.domain),
		input
	);
}

export async function buildCreateExternalState(
	input: CreateExternalSchema
): Promise<InstallerStateLike> {
	const base = await fetchBaseState("external-services", input.domain);
	return applyExternalOverrides(base, input);
}

export async function buildAttachStagingState(
	site: ExistingSiteTarget,
	stagingDomain: string
): Promise<InstallerStateLike> {
	const base = await fetchBaseState("staging-only", site.productionDomain);
	return applyAttachStagingOverrides(base, site, stagingDomain);
}

export async function buildRemoveSiteState(
	site: ExistingSiteTarget,
	purge: boolean
): Promise<InstallerStateLike> {
	const base = await fetchBaseState("remove-existing", site.productionDomain);
	return applyRemoveSiteOverrides(base, site, purge);
}
