import type { BackupPolicy, InstallMode, PerformancePreset } from "../core/types";

export type StepId =
  | "welcome"
  | "system"
  | "domain"
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
  help: string;
  id: StepId;
  title: string;
}

export const steps: Step[] = [
  {
    id: "welcome",
    title: "Welcome",
    help: "A guided production installer for a real Vibe WP VPS."
  },
  {
    id: "system",
    title: "System",
    help: "Checks host readiness before touching Docker, Caddy, or env files."
  },
  {
    id: "domain",
    title: "Domain",
    help: "Collects public domains and keeps app ports bound to loopback."
  },
  {
    id: "mode",
    title: "Mode",
    help: "Selects whether this is a fresh site, an update, staging, or advanced external services."
  },
  {
    id: "admin",
    title: "Admin",
    help: "Creates the first WordPress administrator with generated secrets."
  },
  {
    id: "performance",
    title: "Performance",
    help: "Maps VPS memory to PHP-FPM, Redis, MariaDB, and Nginx settings."
  },
  {
    id: "ai",
    title: "AI",
    help: "Keeps WordPress AI plugins ready and optionally injects provider keys."
  },
  {
    id: "backup",
    title: "Backups",
    help: "Makes backups visible in the install flow instead of an afterthought."
  },
  {
    id: "staging",
    title: "Staging",
    help: "Creates a safe private test copy with noindex and mail safeguards."
  },
  {
    id: "review",
    title: "Review",
    help: "Shows the exact plan, warnings, env paths, Caddyfile, and commands."
  },
  {
    id: "execute",
    title: "Execute",
    help: "Streams planned tasks. Without --yes this is a dry execution preview."
  },
  { id: "success", title: "Done", help: "Summarizes URLs, commands, and next operational steps." }
];

export const modeOptions: Array<{ name: string; description: string; value: InstallMode }> = [
  {
    name: "New site on this VPS",
    description: "Recommended. Creates production and optional staging.",
    value: "new-site"
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
    name: "External MariaDB/Redis",
    description: "Advanced mode for managed services.",
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
