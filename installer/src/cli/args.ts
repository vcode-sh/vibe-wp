import type { InstallerOptions } from "../core/types";

export const DEFAULT_INSTALL_DIR = "/opt/vibe-wp";

type BooleanOption =
  | "ascii"
  | "compact"
  | "dryRun"
  | "headlessJson"
  | "help"
  | "local"
  | "noCaddy"
  | "noHostInstall"
  | "version"
  | "yes";
type StringOption = "exportPlan" | "headlessPlan" | "installDir" | "ref" | "repo";

const booleanFlags = new Map<string, BooleanOption>([
  ["--ascii", "ascii"],
  ["--compact", "compact"],
  ["--dry-run", "dryRun"],
  ["--headless-json", "headlessJson"],
  ["--help", "help"],
  ["-h", "help"],
  ["--local", "local"],
  ["--no-caddy", "noCaddy"],
  ["--no-host-install", "noHostInstall"],
  ["--version", "version"],
  ["--yes", "yes"]
]);

const stringFlags = new Map<string, StringOption>([
  ["--export-plan", "exportPlan"],
  ["--headless", "headlessPlan"],
  ["--install-dir", "installDir"],
  ["--ref", "ref"],
  ["--repo", "repo"]
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
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
  --install-dir <path>   Install directory, default /opt/vibe-wp
  --repo <url>           Vibe WP git repository
  --ref <ref>            Git branch or tag, default main
  --local                Use a safe local sandbox for macOS/UI testing
  --no-caddy             Do not manage Caddy
  --no-host-install      Do not install missing host packages
  --compact              Force compact UI
  --ascii                Avoid Unicode UI characters
  --version              Print version
`;
}
