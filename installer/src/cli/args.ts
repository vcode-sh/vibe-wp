import type { InstallerOptions, InstallMode } from "../core/types";

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
  | "version"
  | "yes";
type StringOption =
  | "adminEmail"
  | "domain"
  | "exportPlan"
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
  ["--version", "version"],
  ["--yes", "yes"]
]);

const stringFlags = new Map<string, StringOption>([
  ["--admin-email", "adminEmail"],
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

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function usage(): string {
  return `vibe-wp-installer

Usage:
  vibe-wp-installer
  vibe-wp-installer --dry-run
  vibe-wp-installer --local
  vibe-wp-installer --export-plan install-plan.json
  vibe-wp-installer --headless install-plan.json [--yes]
  echo '<json>' | vibe-wp-installer --headless-json

Options:
  --domain <host>        Production domain (derives slug, ports, staging, title)
  --admin-email <email>  WordPress admin email
  --staging-domain <h>   Staging domain (enables staging)
  --mode <mode>          Install mode: new-site, manage-existing,
                         remove-existing, update-existing, staging-only,
                         external-services
  --install-dir <path>   Install directory, default /opt/vibe-wp
  --repo <url>           Vibe WP git repository
  --ref <ref>            Git branch or tag, default main
  --local                Use a safe local sandbox for macOS/UI testing
  --no-caddy             Do not manage Caddy
  --no-www               Do not add a www. alias or require its DNS
  --no-host-install      Do not install missing host packages
  --ext-db-host <h:port> External MariaDB host (external-services mode)
  --ext-db-name <name>   External database name
  --ext-db-user <user>   External database user
  --ext-db-password <pw> External database password
  --ext-redis-host <h>   External Redis host
  --ext-redis-port <p>   External Redis port
  --ext-redis-password <pw> External Redis password
  --perf KEY=VALUE       Override a performance setting (repeatable),
                         e.g. --perf REDIS_MAXMEMORY=512mb
  --compact              Force compact UI
  --ascii                Avoid Unicode UI characters
  --version              Print version
`;
}
