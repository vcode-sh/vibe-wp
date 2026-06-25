import {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stagingDomainFor,
  stripProtocol,
  titleFromDomain
} from "../core/site-profile";
import type { InstallerOptions, InstallerState } from "../core/types";
import { DEFAULT_INSTALL_DIR } from "./args";

const DEFAULT_TITLES = new Set(["", "Vibe WP", "My Site"]);
const EXISTING_SITE_MODES = new Set([
  "manage-existing",
  "remove-existing",
  "update-existing",
  "staging-only"
]);

// Apply non-interactive CLI flags onto the freshly built installer state so a
// headless install can run without the TUI. Mirrors domain-screen's
// updateProductionDomain so derived values stay consistent.
// Fresh-install modes that provision a brand-new site (no bundled staging path).
const STANDALONE_INSTALL_MODES = new Set(["external-services", "shared-db"]);

function applyMode(state: InstallerState, options: InstallerOptions): void {
  const mode = options.mode;
  if (!mode) {
    return;
  }
  state.mode = mode;
  // A fresh-install mode must not inherit a site auto-selected from host
  // detection, or its install dir would target the existing site and clobber it.
  if (mode === "new-site" || STANDALONE_INSTALL_MODES.has(mode)) {
    state.selectedSiteDir = "";
  }
  if (STANDALONE_INSTALL_MODES.has(mode)) {
    state.stagingEnabled = false;
  }
  // Existing-site modes act on --install-dir, so treat it as the selected site
  // and adopt its identity (slug/domains) from host detection — the headless
  // mirror of picking a site in the TUI. Needed so e.g. remove finds the right
  // Caddy snippet (named after the site slug).
  if (EXISTING_SITE_MODES.has(mode) && options.installDir) {
    state.selectedSiteDir = options.installDir;
    adoptDetectedSite(state, options.installDir);
  }
  // staging-only attaches a fresh staging env: enable it and give it the site's
  // designated staging port (deterministic from the slug).
  if (mode === "staging-only") {
    state.stagingEnabled = true;
    state.stagingHttpPort = portPairFromSlug(state.siteSlug).staging;
  }
}

export function applyCliState(state: InstallerState, options: InstallerOptions): InstallerState {
  applyMode(state, options);

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

  if (options.access) {
    state.panelAccessMode = options.access;
  }

  if (options.adminPassword) {
    state.adminPassword = options.adminPassword;
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
  if (options.monitorTelegramToken) {
    state.monitorTelegramToken = options.monitorTelegramToken;
  }
  if (options.monitorTelegramChat) {
    state.monitorTelegramChat = options.monitorTelegramChat;
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

// Adopt a detected site's identity (slug, domains, staging) by install dir, so
// existing-site operations target the right files. Falls back to the dir
// basename as the slug when host detection has no matching record.
function adoptDetectedSite(state: InstallerState, installDir: string): void {
  const site = state.host.existingSites.find((candidate) => candidate.installDir === installDir);
  if (site?.productionUrl) {
    const domain = stripProtocol(site.productionUrl);
    state.productionDomain = domain;
    state.siteSlug = siteSlugFromDomain(domain);
    state.stagingEnabled = site.hasStaging;
    if (site.stagingUrl) {
      state.stagingDomain = stripProtocol(site.stagingUrl);
    }
    return;
  }
  const base = installDir.split("/").pop() ?? "";
  if (base) {
    state.siteSlug = base;
  }
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
