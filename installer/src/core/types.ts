export type InstallMode = "new-site" | "update-existing" | "staging-only" | "external-services";
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
  git: string | null;
  kernel: string;
  osName: string;
  osVersion: string;
  publicIp: string | null;
  sudo: boolean;
  totalMemoryMb: number | null;
  user: string;
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
  mode: InstallMode;
  performancePreset: PerformancePreset;
  productionDomain: string;
  ref: string;
  repo: string;
  siteTitle: string;
  stagingDomain: string;
  stagingEnabled: boolean;
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
  ref: string;
  repo: string;
  summary: Record<string, string>;
  tasks: InstallTask[];
  version: string;
  warnings: string[];
}
