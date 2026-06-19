import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

// Plain-English operations for non-technical owners. Each maps to a bin/vibe
// command; labels avoid jargon and every action carries a safety level.
export type OpSafety = "safe" | "caution" | "danger";

export interface ManageOperation {
  description: string;
  env: "prod" | "stage";
  id: string;
  label: string;
  safety: OpSafety;
  stagingOnly?: boolean;
  vibeCommand: string;
}

export const MANAGE_OPERATIONS: ManageOperation[] = [
  {
    id: "health",
    label: "Check it's healthy",
    description: "Quick tests: the site loads, uploads work, cache and Redis are on.",
    safety: "safe",
    env: "prod",
    vibeCommand: "smoke"
  },
  {
    id: "speed",
    label: "Speed report",
    description: "Shows performance diagnostics for the live site.",
    safety: "safe",
    env: "prod",
    vibeCommand: "perf-report"
  },
  {
    id: "status",
    label: "What's running",
    description: "Lists the live site's running services.",
    safety: "safe",
    env: "prod",
    vibeCommand: "ps"
  },
  {
    id: "logs",
    label: "Recent logs",
    description: "Shows the latest log lines from the live site.",
    safety: "safe",
    env: "prod",
    vibeCommand: "logs"
  },
  {
    id: "backup",
    label: "Back up now",
    description: "Creates a fresh backup of the live site.",
    safety: "safe",
    env: "prod",
    vibeCommand: "backup"
  },
  {
    id: "cache",
    label: "Clear the cache",
    description: "Flushes page and object cache — safe, it rebuilds automatically.",
    safety: "safe",
    env: "prod",
    vibeCommand: "cache-flush"
  },
  {
    id: "restart",
    label: "Restart the site",
    description: "Restarts services. Brief downtime while it comes back up.",
    safety: "caution",
    env: "prod",
    vibeCommand: "restart"
  },
  {
    id: "stage-refresh",
    label: "Copy live → staging",
    description: "Replaces staging with a fresh copy of the live site.",
    safety: "caution",
    env: "stage",
    vibeCommand: "refresh-from-prod",
    stagingOnly: true
  },
  {
    id: "stage-promote",
    label: "Publish staging → live",
    description: "Pushes staging files onto the live site. Back up first.",
    safety: "danger",
    env: "stage",
    vibeCommand: "promote-files-to-prod",
    stagingOnly: true
  },
  {
    id: "restore",
    label: "Restore a backup",
    description: "Replaces the live site with a previous backup.",
    safety: "danger",
    env: "prod",
    vibeCommand: "restore"
  },
  {
    id: "stop",
    label: "Stop the site",
    description: "Takes the live site offline. Your files are kept.",
    safety: "danger",
    env: "prod",
    vibeCommand: "down"
  }
];

export function availableOperations(hasStaging: boolean): ManageOperation[] {
  return MANAGE_OPERATIONS.filter((op) => hasStaging || !op.stagingOnly);
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
