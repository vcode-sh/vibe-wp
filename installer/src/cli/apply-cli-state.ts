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

  return state;
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
