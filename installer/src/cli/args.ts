import type { BackupSchedule, InstallerOptions, InstallMode } from "../core/types";

export const DEFAULT_INSTALL_DIR = "/opt/vibe-wp";

const INSTALL_MODES: InstallMode[] = [
  "new-site",
  "manage-existing",
  "remove-existing",
  "update-existing",
  "staging-only",
  "external-services"
];

type BooleanOption =
  | "ascii"
  | "compact"
  | "dryRun"
  | "headlessJson"
  | "help"
  | "local"
  | "noCaddy"
  | "noWww"
  | "noHostInstall"
  | "noHarden"
  | "noMonitor"
  | "version"
  | "yes";
type StringOption =
  | "adminEmail"
  | "backupDir"
  | "domain"
  | "exportPlan"
  | "monitorEmail"
  | "monitorWebhook"
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
  | "ref"
  | "repo"
  | "stagingDomain";

const booleanFlags = new Map<string, BooleanOption>([
  ["--ascii", "ascii"],
  ["--compact", "compact"],
  ["--dry-run", "dryRun"],
  ["--headless-json", "headlessJson"],
  ["--help", "help"],
  ["-h", "help"],
  ["--local", "local"],
  ["--no-caddy", "noCaddy"],
  ["--no-www", "noWww"],
  ["--no-host-install", "noHostInstall"],
  ["--no-harden", "noHarden"],
  ["--no-monitor", "noMonitor"],
  ["--version", "version"],
  ["--yes", "yes"]
]);

const stringFlags = new Map<string, StringOption>([
  ["--admin-email", "adminEmail"],
  ["--backup-dir", "backupDir"],
  ["--monitor-email", "monitorEmail"],
  ["--monitor-webhook", "monitorWebhook"],
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
  ["--ref", "ref"],
  ["--repo", "repo"],
  ["--staging-domain", "stagingDomain"]
]);

export function parseArgs(argv: string[]): InstallerOptions {
  const options: InstallerOptions = {
    compact: false,
    ascii: false,
    dryRun: false,
    yes: false,
    installDir: DEFAULT_INSTALL_DIR,
    repo: "https://github.com/vcode-sh/vibe-wp.git",
    ref: "main",
    local: false,
    noCaddy: false,
    noWww: false,
    noHostInstall: false,
    noHarden: false,
    noMonitor: false,
    version: false,
    help: false,
    headlessJson: false
  };

  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    index += 1;
    if (!arg) {
      continue;
    }

    const booleanKey = booleanFlags.get(arg);
    if (booleanKey) {
      options[booleanKey] = true;
      continue;
    }

    const stringKey = stringFlags.get(arg);
    if (stringKey) {
      options[stringKey] = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--mode") {
      options.mode = parseMode(requireValue(argv, index, arg));
      index += 1;
      continue;
    }

    if (arg === "--backup-schedule") {
      options.backupSchedule = parseSchedule(requireValue(argv, index, arg));
      index += 1;
      continue;
    }

    // Repeatable: --perf KEY=VALUE overrides a single performance setting.
    if (arg === "--perf") {
      options.perfOverrides = options.perfOverrides ?? [];
      options.perfOverrides.push(requireValue(argv, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseMode(value: string): InstallMode {
  const mode = INSTALL_MODES.find((candidate) => candidate === value);
  if (!mode) {
    throw new Error(`Invalid --mode value: ${value}. Allowed: ${INSTALL_MODES.join(", ")}.`);
  }
  return mode;
}

function parseSchedule(value: string): BackupSchedule {
  if (value === "off" || value === "daily" || value === "weekly") {
    return value;
  }
  throw new Error(`Invalid --backup-schedule value: ${value}. Allowed: off, daily, weekly.`);
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}
