import { emptyHostFacts } from "./defaults";
import { portPairFromSlug, siteSlugFromDomain } from "./site-profile";
import type { HostFacts, InstallerState } from "./types";

const localDomain = "demo.vibe.local";
const trailingSlashPattern = /\/$/;

export function createLocalSandboxHostFacts(cwd = process.cwd()): HostFacts {
  const root = localSandboxRoot(cwd);
  return {
    ...emptyHostFacts(),
    arch: process.arch === "arm64" ? "arm64" : "x86_64",
    caddy: "caddy local simulator",
    compose: "Docker Compose local simulator",
    cpuCount: 8,
    curl: "curl local simulator",
    docker: "Docker local simulator",
    existingSites: [
      {
        hasStaging: true,
        installDir: `${root}/sites/acme-studio`,
        productionPort: 18_000,
        productionProject: "vibe_wp_acme_prod",
        productionUrl: "https://acme.vibe.local",
        stagingPort: 18_001,
        stagingProject: "vibe_wp_acme_stage",
        stagingUrl: "https://stage.acme.vibe.local"
      },
      {
        hasStaging: false,
        installDir: `${root}/sites/portfolio`,
        productionPort: 18_010,
        productionProject: "vibe_wp_portfolio_prod",
        productionUrl: "https://portfolio.vibe.local",
        stagingPort: null,
        stagingProject: null,
        stagingUrl: null
      }
    ],
    git: "git local simulator",
    kernel: "local sandbox",
    osName: "macOS local sandbox",
    osVersion: "local",
    publicIp: "203.0.113.10",
    sudo: false,
    totalMemoryMb: 8192,
    user: process.env.USER ?? "local-user"
  };
}

export function applyLocalSandboxDefaults(
  state: InstallerState,
  cwd = process.cwd()
): InstallerState {
  const siteSlug = siteSlugFromDomain(localDomain);
  const ports = portPairFromSlug(siteSlug);
  return {
    ...state,
    adminEmail: `owner@${localDomain}`,
    installCaddy: false,
    installDir: `${localSandboxRoot(cwd)}/sites/${siteSlug}`,
    installDocker: false,
    localSandbox: true,
    mode: "new-site",
    productionDomain: localDomain,
    productionHttpPort: ports.production,
    selectedSiteDir: "",
    siteSlug,
    stagingDomain: `stage.${localDomain}`,
    stagingEnabled: true,
    stagingHttpPort: ports.staging,
    wwwAlias: false
  };
}

export function localSandboxRoot(cwd = process.cwd()): string {
  return `${cwd.replace(trailingSlashPattern, "")}/.vibe-local`;
}
