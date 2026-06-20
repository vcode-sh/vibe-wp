import { PERFORMANCE_FIELDS } from "../core/performance";
import type { BackupPolicy, InstallerState, InstallMode, PerformancePreset } from "../core/types";

// Most steps have a fixed focusable count; the Performance step grows when the
// user turns on per-setting customisation (preset + toggle + memory + N fields).
export function focusCountFor(step: Step, state: InstallerState): number {
  if (step.id === "performance" && state.performanceCustom) {
    return 3 + PERFORMANCE_FIELDS.length;
  }
  return step.focusCount;
}

export type StepId =
  | "welcome"
  | "sites"
  | "dashboard"
  | "system"
  | "domain"
  | "external-db"
  | "external-redis"
  | "mode"
  | "admin"
  | "performance"
  | "ai"
  | "backup"
  | "staging"
  | "review"
  | "execute"
  | "success";

export interface Step {
  focusCount: number;
  help: string;
  id: StepId;
  title: string;
}

export const steps: Step[] = [
  {
    id: "welcome",
    focusCount: 1,
    title: "Welcome",
    help: "A guided production installer for a real Vibe WP VPS."
  },
  {
    id: "sites",
    focusCount: 2,
    title: "Sites",
    help: "Create a new WordPress site or manage one already installed on this VPS."
  },
  {
    id: "dashboard",
    focusCount: 1,
    title: "Manage",
    help: "Run safe checks and maintenance on the selected site, in plain language."
  },
  {
    id: "system",
    focusCount: 2,
    title: "System",
    help: "Checks host readiness before touching Docker, Caddy, or env files."
  },
  {
    id: "domain",
    focusCount: 6,
    title: "Domain",
    help: "Collects public domains and keeps app ports bound to loopback."
  },
  {
    id: "admin",
    focusCount: 5,
    title: "Admin",
    help: "Creates the first WordPress administrator with generated secrets."
  },
  {
    id: "staging",
    focusCount: 3,
    title: "Staging",
    help: "Creates a safe private test copy with noindex and mail safeguards."
  },
  {
    id: "external-db",
    focusCount: 6,
    title: "Database",
    help: "Connection details for your external MariaDB or MySQL server."
  },
  {
    id: "external-redis",
    focusCount: 5,
    title: "Redis",
    help: "Connection details for your external Redis server."
  },
  {
    id: "performance",
    focusCount: 3,
    title: "Performance",
    help: "Maps VPS memory to PHP-FPM, Redis, MariaDB, and Nginx — and lets you tune each value."
  },
  {
    id: "backup",
    focusCount: 1,
    title: "Backups",
    help: "Makes backups visible in the install flow instead of an afterthought."
  },
  {
    id: "ai",
    focusCount: 3,
    title: "AI",
    help: "Keeps WordPress AI plugins ready and optionally injects provider keys."
  },
  {
    id: "mode",
    focusCount: 2,
    title: "Location",
    help: "Where the checkout lives on disk and which git ref to deploy."
  },
  {
    id: "review",
    focusCount: 1,
    title: "Review",
    help: "Shows the exact plan, warnings, env paths, Caddyfile, and commands."
  },
  {
    id: "execute",
    focusCount: 1,
    title: "Execute",
    help: "Streams planned tasks. Without --yes this is a dry execution preview."
  },
  {
    id: "success",
    focusCount: 1,
    title: "Done",
    help: "Summarizes URLs, commands, and next operational steps."
  }
];

export const modeOptions: Array<{ name: string; description: string; value: InstallMode }> = [
  {
    name: "Create a new WordPress",
    description: "Production, optional staging, isolated ports, and tuned env files.",
    value: "new-site"
  },
  {
    name: "Manage detected site",
    description: "Run status, smoke checks, and performance diagnostics.",
    value: "manage-existing"
  },
  {
    name: "Remove detected site",
    description: "Create a safety backup, then stop containers without deleting data.",
    value: "remove-existing"
  },
  {
    name: "Update existing checkout",
    description: "Keeps current directory and refreshes config.",
    value: "update-existing"
  },
  {
    name: "Create staging only",
    description: "Attach staging to an existing production site.",
    value: "staging-only"
  },
  {
    name: "Use external database and Redis",
    description: "Bring your own MariaDB and Redis — only WordPress and Nginx run in Docker.",
    value: "external-services"
  }
];

export const performanceOptions: Array<{
  name: string;
  description: string;
  value: PerformancePreset;
}> = [
  { name: "Conservative", description: "Small VPS, lower memory pressure.", value: "conservative" },
  { name: "Balanced", description: "Best default for most business sites.", value: "balanced" },
  {
    name: "High memory",
    description: "Bigger VPS, more PHP workers and cache.",
    value: "high-memory"
  }
];

export const backupOptions: Array<{ name: string; description: string; value: BackupPolicy }> = [
  {
    name: "Manual",
    description: "Expose commands only. You run backups yourself.",
    value: "manual"
  },
  {
    name: "Local first",
    description: "Create the first local backup after install.",
    value: "local-first"
  },
  {
    name: "External later",
    description: "Prepare for R2/S3-style off-server backups.",
    value: "external-later"
  }
];
