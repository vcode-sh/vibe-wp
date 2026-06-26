import type { PanelAccessMode } from "../core/panel-access";
import { PANEL_ACCESS_MODES } from "../core/panel-access";
import type { BackupSchedule, InstallerOptions, InstallMode } from "../core/types";
import { booleanFlags, INSTALL_MODES, stringFlags } from "./arg-definitions";

export const DEFAULT_INSTALL_DIR = "/opt/vibe-wp";

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
    localInventory: false,
    noCaddy: false,
    noWww: false,
    noHostInstall: false,
    noHarden: false,
    noMonitor: false,
    purge: false,
    resume: false,
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

    if (arg === "--access") {
      options.access = parseAccess(requireValue(argv, index, arg));
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

function parseAccess(value: string): PanelAccessMode {
  const mode = PANEL_ACCESS_MODES.find((candidate) => candidate === value);
  if (!mode) {
    throw new Error(`Invalid --access value: ${value}`);
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
