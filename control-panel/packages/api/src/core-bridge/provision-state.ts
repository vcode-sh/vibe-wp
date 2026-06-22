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

/** Staging-only overrides for attaching staging to an existing site (pure). */
export function applyAttachStagingOverrides(
	base: InstallerStateLike,
	installDir: string,
	productionDomain: string,
	stagingDomain: string
): InstallerStateLike {
	return {
		...base,
		selectedSiteDir: installDir,
		installDir,
		productionDomain: productionDomain.trim().toLowerCase(),
		stagingDomain: stagingDomain.trim().toLowerCase(),
		stagingEnabled: true,
	};
}

/** Remove-existing overrides; `purge` maps to the installer's fullDelete (pure). */
export function applyRemoveSiteOverrides(
	base: InstallerStateLike,
	installDir: string,
	purge: boolean
): InstallerStateLike {
	return {
		...base,
		selectedSiteDir: installDir,
		installDir,
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
	installDir: string,
	productionDomain: string,
	stagingDomain: string
): Promise<InstallerStateLike> {
	const base = await fetchBaseState("staging-only", productionDomain);
	return applyAttachStagingOverrides(
		base,
		installDir,
		productionDomain,
		stagingDomain
	);
}

export async function buildRemoveSiteState(
	installDir: string,
	productionDomain: string,
	purge: boolean
): Promise<InstallerStateLike> {
	const base = await fetchBaseState("remove-existing", productionDomain);
	return applyRemoveSiteOverrides(base, installDir, purge);
}
