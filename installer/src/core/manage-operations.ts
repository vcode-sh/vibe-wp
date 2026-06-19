import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

// Plain-English operations for non-technical owners. Each maps to a bin/vibe
// command; labels avoid jargon and every action carries a safety level.
export type OpSafety = "safe" | "caution" | "danger";

// Plain-language buckets so the dashboard reads like a friendly control panel
// instead of a flat list. "danger" lives in its own clearly separated zone.
export type OpGroup = "check" | "maintain" | "staging" | "danger";

export interface ManageOperation {
  description: string;
  env: "prod" | "stage";
  group: OpGroup;
  id: string;
  label: string;
  safety: OpSafety;
  stagingOnly?: boolean;
  vibeCommand: string;
}

export interface OpGroupView {
  group: OpGroup;
  operations: ManageOperation[];
  title: string;
}

const GROUP_TITLES: Record<OpGroup, string> = {
  check: "Check on it",
  maintain: "Maintain",
  staging: "Staging",
  danger: "Danger zone"
};

// Fixed order keeps the calm-to-scary flow: look first, tidy up, then the
// clearly separated danger zone at the very bottom.
const GROUP_ORDER: OpGroup[] = ["check", "maintain", "staging", "danger"];

export const MANAGE_OPERATIONS: ManageOperation[] = [
  {
    id: "health",
    label: "Check it's healthy",
    description: "Quick tests: the site loads, uploads work, cache and Redis are on.",
    safety: "safe",
    group: "check",
    env: "prod",
    vibeCommand: "smoke"
  },
  {
    id: "speed",
    label: "Speed report",
    description: "Shows performance diagnostics for the live site.",
    safety: "safe",
    group: "check",
    env: "prod",
    vibeCommand: "perf-report"
  },
  {
    id: "status",
    label: "What's running",
    description: "Lists the live site's running services.",
    safety: "safe",
    group: "check",
    env: "prod",
    vibeCommand: "ps"
  },
  {
    id: "server",
    label: "Check the server itself",
    description: "Runtime checks on the server: database, cache and file permissions.",
    safety: "safe",
    group: "check",
    env: "prod",
    vibeCommand: "doctor-runtime"
  },
  {
    id: "logs",
    label: "Recent logs",
    description: "Shows the latest log lines from the live site.",
    safety: "safe",
    group: "check",
    env: "prod",
    vibeCommand: "logs"
  },
  {
    id: "settings",
    label: "Double-check your settings",
    description: "Validates the site's configuration without changing anything.",
    safety: "safe",
    group: "check",
    env: "prod",
    vibeCommand: "config"
  },
  {
    id: "backup",
    label: "Back up now",
    description: "Creates a fresh backup of the live site.",
    safety: "safe",
    group: "maintain",
    env: "prod",
    vibeCommand: "backup"
  },
  {
    id: "cache",
    label: "Clear the cache",
    description: "Flushes page and object cache — safe, it rebuilds automatically.",
    safety: "safe",
    group: "maintain",
    env: "prod",
    vibeCommand: "cache-flush"
  },
  {
    id: "restart",
    label: "Restart the site",
    description: "Restarts services. Brief downtime while it comes back up.",
    safety: "caution",
    group: "maintain",
    env: "prod",
    vibeCommand: "restart"
  },
  {
    id: "stage-refresh",
    label: "Copy live to staging",
    description: "Replaces staging with a fresh copy of the live site.",
    safety: "caution",
    group: "staging",
    env: "stage",
    vibeCommand: "refresh-from-prod",
    stagingOnly: true
  },
  {
    id: "stage-promote",
    label: "Publish staging to live",
    description: "Pushes staging files onto the live site. Back up first.",
    safety: "danger",
    group: "staging",
    env: "stage",
    vibeCommand: "promote-files-to-prod",
    stagingOnly: true
  },
  {
    id: "restore",
    label: "Restore a backup",
    description: "Replaces the live site with a previous backup.",
    safety: "danger",
    group: "danger",
    env: "prod",
    vibeCommand: "restore"
  },
  {
    id: "stop",
    label: "Stop the site",
    description: "Takes the live site offline. Your files are kept.",
    safety: "danger",
    group: "danger",
    env: "prod",
    vibeCommand: "down"
  }
];

export function availableOperations(hasStaging: boolean): ManageOperation[] {
  return MANAGE_OPERATIONS.filter((op) => hasStaging || !op.stagingOnly);
}

// Groups operations under their plain-language headers, in a calm-to-scary
// order, dropping any group that has no operations (e.g. staging when off).
export function groupedOperations(hasStaging: boolean): OpGroupView[] {
  const ops = availableOperations(hasStaging);
  const views: OpGroupView[] = [];
  for (const group of GROUP_ORDER) {
    const operations = ops.filter((op) => op.group === group);
    if (operations.length > 0) {
      views.push({ group, title: GROUP_TITLES[group], operations });
    }
  }
  return views;
}

export function buildOperationTask(op: ManageOperation, state: InstallerState): InstallTask {
  const dir = shellQuote(state.selectedSiteDir || state.installDir);
  return {
    id: op.id,
    title: op.label,
    description: op.description,
    privileged: op.safety === "danger",
    command: ["sh", "-lc", `cd ${dir} && ./bin/vibe ${op.env} ${op.vibeCommand}`]
  };
}
