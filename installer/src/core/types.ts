export type InstallMode =
  | "new-site"
  | "manage-existing"
  | "remove-existing"
  | "update-existing"
  | "staging-only"
  | "external-services";
export type PerformancePreset = "conservative" | "balanced" | "high-memory";
export type BackupPolicy = "manual" | "local-first" | "external-later";

export interface InstallerOptions {
  ascii: boolean;
  compact: boolean;
  dryRun: boolean;
  exportPlan?: string;
  headlessPlan?: string;
  help: boolean;
  installDir: string;
  local: boolean;
  noCaddy: boolean;
  noHostInstall: boolean;
  ref: string;
  repo: string;
  version: boolean;
  yes: boolean;
}

export interface HostFacts {
  arch: string;
  caddy: string | null;
  compose: string | null;
  cpuCount: number | null;
  curl: string | null;
  docker: string | null;
  existingSites: ExistingSite[];
  git: string | null;
  kernel: string;
  osName: string;
  osVersion: string;
  publicIp: string | null;
  sudo: boolean;
  totalMemoryMb: number | null;
  user: string;
}

export interface ExistingSite {
  hasStaging: boolean;
  installDir: string;
  productionProject: string | null;
  productionUrl: string | null;
  stagingProject: string | null;
  stagingUrl: string | null;
}

export interface InstallerState {
  adminEmail: string;
  adminPassword: string;
  adminUser: string;
  aiAnthropicKey: string;
  aiGoogleKey: string;
  aiOpenAiKey: string;
  backupPolicy: BackupPolicy;
  host: HostFacts;
  installCaddy: boolean;
  installDir: string;
  installDocker: boolean;
  locale: string;
  localSandbox: boolean;
  mode: InstallMode;
  performancePreset: PerformancePreset;
  productionDomain: string;
  productionHttpPort: string;
  quickInstall: boolean;
  ref: string;
  repo: string;
  selectedSiteDir: string;
  siteSlug: string;
  siteTitle: string;
  stagingDomain: string;
  stagingEnabled: boolean;
  stagingHttpPort: string;
  wwwAlias: boolean;
}

export interface EnvFilePlan {
  path: string;
  values: Record<string, string>;
}

export interface InstallTask {
  command?: string[];
  cwd?: string;
  description: string;
  id: string;
  privileged?: boolean;
  skip?: boolean;
  title: string;
}

export interface InstallPlan {
  caddyfile: string;
  domains: {
    production: string;
    wwwAlias: boolean;
    stagingEnabled: boolean;
    staging: string;
  };
  envFiles: EnvFilePlan[];
  generatedAt: string;
  installDir: string;
  localSandbox: boolean;
  ref: string;
  repo: string;
  siteSlug: string;
  summary: Record<string, string>;
  tasks: InstallTask[];
  version: string;
  warnings: string[];
}
