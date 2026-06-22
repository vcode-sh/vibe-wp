import { defaultState } from "./defaults";
import {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stagingDomainFor,
  titleFromDomain
} from "./site-profile";
import type { HostFacts, InstallerState, InstallMode } from "./types";

// A fully-seeded, non-colliding base InstallerState for a brand-new provisioning
// run, computed by the installer's own site-profile helpers. The panel calls
// this over the headless bridge instead of replicating slug/port/dir logic.
//
// "Non-colliding" means: the chosen siteSlug, installDir, and HTTP ports do not
// clash with any already-installed site reported in host.existingSites. We never
// reuse defaultState's "adopt the first existing site" branch — provisioning is
// always for a NEW, distinct site, so we override mode + identity explicitly.

const PORT_STEP = 2;
const MAX_PORT = 65_535;
const MIN_PORT = 1024;

export interface BaseStateInput {
  domain?: string;
  mode?: InstallMode;
}

export function buildBaseState(host: HostFacts, input: BaseStateInput = {}): InstallerState {
  const mode: InstallMode = input.mode ?? "new-site";
  const domain = (input.domain ?? "").trim();
  const slug = uniqueSlug(domain ? siteSlugFromDomain(domain) : "site", host);
  const installDir = uniqueInstallDir(slug, host);
  const ports = uniquePorts(slug, host);

  // Start from defaults for the rich field set (performance preset, backup
  // defaults, generated admin password, locale, etc.), then override every
  // identity field so we never adopt an existing site's values.
  const base = defaultState(host);
  return {
    ...base,
    mode,
    selectedSiteDir: "",
    siteSlug: slug,
    installDir,
    productionDomain: domain || base.productionDomain,
    stagingDomain: domain ? stagingDomainFor(domain) : base.stagingDomain,
    stagingEnabled: false,
    productionHttpPort: ports.production,
    stagingHttpPort: ports.staging,
    siteTitle: domain ? titleFromDomain(domain) || base.siteTitle : base.siteTitle,
    // Identity defaults that must not be inherited from an adopted site.
    adminEmail: "",
    fullDelete: false
  };
}

function existingDirs(host: HostFacts): Set<string> {
  return new Set(host.existingSites.map((site) => site.installDir));
}

// Ports actually in use by existing sites, read from their env files
// (ExistingSite.productionPort/stagingPort). This is authoritative: a site
// created after an earlier collision runs on a WALKED port the slug no longer
// predicts, so reconstructing the pair from the slug would miss it and let a
// new provision collide. We reserve the real bound ports instead.
function reservedPorts(host: HostFacts): Set<number> {
  const used = new Set<number>();
  for (const site of host.existingSites) {
    if (site.productionPort !== null) {
      used.add(site.productionPort);
    }
    if (site.stagingPort !== null) {
      used.add(site.stagingPort);
    }
  }
  return used;
}

function installDirSlug(installDir: string): string {
  return installDir.split("/").filter(Boolean).pop() ?? installDir;
}

function uniqueSlug(seed: string, host: HostFacts): string {
  const taken = new Set(host.existingSites.map((site) => installDirSlug(site.installDir)));
  if (!taken.has(seed)) {
    return seed;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${seed}-${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return seed;
}

function uniqueInstallDir(slug: string, host: HostFacts): string {
  const dirs = existingDirs(host);
  const first = defaultInstallDir(slug, host.existingSites.length);
  if (!dirs.has(first)) {
    return first;
  }
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `/opt/vibe-wp-sites/${slug}-${suffix}`;
    if (!dirs.has(candidate)) {
      return candidate;
    }
  }
  return first;
}

function uniquePorts(slug: string, host: HostFacts): { production: string; staging: string } {
  const reserved = reservedPorts(host);
  let pair = portPairFromSlug(slug);
  let production = Number(pair.production);
  // Walk forward in 2-port steps until neither port collides with a reserved one.
  while ((reserved.has(production) || reserved.has(production + 1)) && production + 1 <= MAX_PORT) {
    production += PORT_STEP;
  }
  if (production + 1 > MAX_PORT || production < MIN_PORT) {
    pair = portPairFromSlug(slug);
    return pair;
  }
  return { production: String(production), staging: String(production + 1) };
}
