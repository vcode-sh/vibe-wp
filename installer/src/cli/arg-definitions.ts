import type { InstallMode } from "../core/types";

export const INSTALL_MODES: InstallMode[] = [
  "new-site",
  "manage-existing",
  "remove-existing",
  "update-existing",
  "staging-only",
  "external-services",
  "shared-db"
];

export type BooleanOption =
  | "ascii"
  | "bootstrapPanel"
  | "compact"
  | "dryRun"
  | "headlessJson"
  | "help"
  | "local"
  | "localInventory"
  | "noCaddy"
  | "noWww"
  | "noHostInstall"
  | "noHarden"
  | "noMonitor"
  | "purge"
  | "resume"
  | "version"
  | "yes";

export type StringOption =
  | "adminEmail"
  | "adminPassword"
  | "backupDir"
  | "domain"
  | "exportPlan"
  | "monitorEmail"
  | "monitorWebhook"
  | "monitorTelegramToken"
  | "monitorTelegramChat"
  | "supportBundle"
  | "r2AccountId"
  | "r2AccessKeyId"
  | "r2Bucket"
  | "r2SecretKey"
  | "extDbHost"
  | "extDbName"
  | "extDbPassword"
  | "extDbUser"
  | "extRedisHost"
  | "extRedisPassword"
  | "extRedisPort"
  | "headlessPlan"
  | "installDir"
  | "localCreate"
  | "localDelete"
  | "localDomain"
  | "localReset"
  | "localRoot"
  | "localTitle"
  | "ref"
  | "repo"
  | "stagingDomain";

export const booleanFlags = new Map<string, BooleanOption>([
  ["--ascii", "ascii"],
  ["--bootstrap-panel", "bootstrapPanel"],
  ["--compact", "compact"],
  ["--dry-run", "dryRun"],
  ["--headless-json", "headlessJson"],
  ["--help", "help"],
  ["-h", "help"],
  ["--local", "local"],
  ["--local-inventory", "localInventory"],
  ["--no-caddy", "noCaddy"],
  ["--no-www", "noWww"],
  ["--no-host-install", "noHostInstall"],
  ["--no-harden", "noHarden"],
  ["--no-monitor", "noMonitor"],
  ["--purge", "purge"],
  ["--resume", "resume"],
  ["--version", "version"],
  ["--yes", "yes"]
]);

export const stringFlags = new Map<string, StringOption>([
  ["--admin-email", "adminEmail"],
  ["--admin-password", "adminPassword"],
  ["--backup-dir", "backupDir"],
  ["--monitor-email", "monitorEmail"],
  ["--monitor-webhook", "monitorWebhook"],
  ["--monitor-telegram-token", "monitorTelegramToken"],
  ["--monitor-telegram-chat", "monitorTelegramChat"],
  ["--support-bundle", "supportBundle"],
  ["--r2-account", "r2AccountId"],
  ["--r2-access-key", "r2AccessKeyId"],
  ["--r2-bucket", "r2Bucket"],
  ["--r2-secret", "r2SecretKey"],
  ["--domain", "domain"],
  ["--export-plan", "exportPlan"],
  ["--ext-db-host", "extDbHost"],
  ["--ext-db-name", "extDbName"],
  ["--ext-db-password", "extDbPassword"],
  ["--ext-db-user", "extDbUser"],
  ["--ext-redis-host", "extRedisHost"],
  ["--ext-redis-password", "extRedisPassword"],
  ["--ext-redis-port", "extRedisPort"],
  ["--headless", "headlessPlan"],
  ["--install-dir", "installDir"],
  ["--local-create", "localCreate"],
  ["--local-delete", "localDelete"],
  ["--local-domain", "localDomain"],
  ["--local-reset", "localReset"],
  ["--local-root", "localRoot"],
  ["--local-title", "localTitle"],
  ["--ref", "ref"],
  ["--repo", "repo"],
  ["--staging-domain", "stagingDomain"]
]);
