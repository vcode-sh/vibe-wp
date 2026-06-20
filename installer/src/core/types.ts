export type InstallMode =
  | "new-site"
  | "manage-existing"
  | "remove-existing"
  | "update-existing"
  | "staging-only"
  | "external-services";
export type PerformancePreset = "conservative" | "balanced" | "high-memory";
export type BackupPolicy = "manual" | "local-first" | "external-later";
export type BackupSchedule = "off" | "daily" | "weekly";

export interface InstallerOptions {
  adminEmail?: string;
  ascii: boolean;
  backupDir?: string;
  backupSchedule?: BackupSchedule;
  compact: boolean;
  domain?: string;
  dryRun: boolean;
  exportPlan?: string;
  extDbHost?: string;
  extDbName?: string;
  extDbPassword?: string;
  extDbUser?: string;
  extRedisHost?: string;
  extRedisPassword?: string;
  extRedisPort?: string;
  headlessJson: boolean;
  headlessPlan?: string;
  help: boolean;
  installDir: string;
  local: boolean;
  mode?: InstallMode;
  monitorEmail?: string;
  monitorTelegramChat?: string;
  monitorTelegramToken?: string;
  monitorWebhook?: string;
  noCaddy: boolean;
  noHarden: boolean;
  noHostInstall: boolean;
  noMonitor: boolean;
  noWww: boolean;
  perfOverrides?: string[];
  r2AccessKeyId?: string;
  r2AccountId?: string;
  r2Bucket?: string;
  r2SecretKey?: string;
  ref: string;
  repo: string;
  stagingDomain?: string;
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
  backupDir: string;
  backupPolicy: BackupPolicy;
  backupR2Enabled: boolean;
  backupRetention: string;
  backupSchedule: BackupSchedule;
  extDbCharset: string;
  extDbHost: string;
  extDbName: string;
  extDbPassword: string;
  extDbTablePrefix: string;
  extDbUser: string;
  extRedisDatabase: string;
  extRedisHost: string;
  extRedisPassword: string;
  extRedisPort: string;
  extRedisScheme: string;
  hardenServer: boolean;
  host: HostFacts;
  installCaddy: boolean;
  installDir: string;
  installDocker: boolean;
  installRclone: boolean;
  locale: string;
  localSandbox: boolean;
  memoryOverrideMb: string;
  mode: InstallMode;
  monitorEmail: string;
  monitorEnabled: boolean;
  monitorTelegramChat: string;
  monitorTelegramToken: string;
  monitorWebhookUrl: string;
  performanceCustom: boolean;
  performanceOverrides: Record<string, string>;
  performancePreset: PerformancePreset;
  productionDomain: string;
  productionHttpPort: string;
  quickInstall: boolean;
  r2AccessKeyId: string;
  r2AccountId: string;
  r2Bucket: string;
  r2SecretKey: string;
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
