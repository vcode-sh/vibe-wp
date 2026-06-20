import {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stagingDomainFor,
  titleFromDomain
} from "../core/site-profile";
import type { InstallerOptions, InstallerState } from "../core/types";
import { DEFAULT_INSTALL_DIR } from "./args";

const DEFAULT_TITLES = new Set(["", "Vibe WP", "My Site"]);

// Apply non-interactive CLI flags onto the freshly built installer state so a
// headless install can run without the TUI. Mirrors domain-screen's
// updateProductionDomain so derived values stay consistent.
export function applyCliState(state: InstallerState, options: InstallerOptions): InstallerState {
  if (options.mode) {
    state.mode = options.mode;
    // A fresh-install mode must not inherit a site auto-selected from host
    // detection, or its install dir would target the existing site and clobber it.
    if (options.mode === "new-site" || options.mode === "external-services") {
      state.selectedSiteDir = "";
    }
    // External mode has no bundled staging path.
    if (options.mode === "external-services") {
      state.stagingEnabled = false;
    }
  }

  if (options.domain) {
    applyDomain(state, options.domain, !options.stagingDomain);
  }

  if (options.stagingDomain) {
    state.stagingDomain = options.stagingDomain;
    state.stagingEnabled = true;
  }

  if (options.adminEmail) {
    state.adminEmail = options.adminEmail;
  }

  applyExternalServices(state, options);
  applyPerfOverrides(state, options);
  applyBackup(state, options);
  if (options.monitorEmail) {
    state.monitorEmail = options.monitorEmail;
  }
  if (options.monitorWebhook) {
    state.monitorWebhookUrl = options.monitorWebhook;
  }

  return state;
}

function applyBackup(state: InstallerState, options: InstallerOptions): void {
  if (options.backupDir) {
    state.backupDir = options.backupDir;
  }
  if (options.backupSchedule) {
    state.backupSchedule = options.backupSchedule;
  }
  const r2 =
    options.r2AccountId || options.r2AccessKeyId || options.r2SecretKey || options.r2Bucket;
  if (r2) {
    // Any R2 flag opts into off-server backups.
    state.backupPolicy = "external-later";
    state.backupR2Enabled = true;
    state.r2AccountId = options.r2AccountId ?? state.r2AccountId;
    state.r2AccessKeyId = options.r2AccessKeyId ?? state.r2AccessKeyId;
    state.r2SecretKey = options.r2SecretKey ?? state.r2SecretKey;
    state.r2Bucket = options.r2Bucket ?? state.r2Bucket;
  }
}

function applyPerfOverrides(state: InstallerState, options: InstallerOptions): void {
  if (!options.perfOverrides?.length) {
    return;
  }
  const overrides: Record<string, string> = { ...state.performanceOverrides };
  for (const entry of options.perfOverrides) {
    const eq = entry.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    overrides[entry.slice(0, eq).trim()] = entry.slice(eq + 1).trim();
  }
  state.performanceOverrides = overrides;
  state.performanceCustom = true;
}

function applyExternalServices(state: InstallerState, options: InstallerOptions): void {
  if (options.extDbHost) {
    state.extDbHost = options.extDbHost;
  }
  if (options.extDbName) {
    state.extDbName = options.extDbName;
  }
  if (options.extDbUser) {
    state.extDbUser = options.extDbUser;
  }
  if (options.extDbPassword) {
    state.extDbPassword = options.extDbPassword;
  }
  if (options.extRedisHost) {
    state.extRedisHost = options.extRedisHost;
  }
  if (options.extRedisPort) {
    state.extRedisPort = options.extRedisPort;
  }
  if (options.extRedisPassword) {
    state.extRedisPassword = options.extRedisPassword;
  }
}

function applyDomain(state: InstallerState, domain: string, deriveStaging: boolean): void {
  const slug = siteSlugFromDomain(domain);
  const ports = portPairFromSlug(slug);
  state.productionDomain = domain;
  state.siteSlug = slug;
  state.productionHttpPort = ports.production;
  state.stagingHttpPort = ports.staging;

  if (deriveStaging) {
    state.stagingDomain = stagingDomainFor(domain);
  }

  if (DEFAULT_TITLES.has(state.siteTitle.trim())) {
    state.siteTitle = titleFromDomain(domain) || state.siteTitle;
  }

  if (state.installDir === DEFAULT_INSTALL_DIR && !state.selectedSiteDir) {
    state.installDir = defaultInstallDir(slug, state.host.existingSites.length);
  }
}
