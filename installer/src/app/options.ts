import type { BackupPolicy, BackupSchedule, InstallMode, PerformancePreset } from "../core/types";

interface Option<T> {
  description: string;
  name: string;
  value: T;
}

export const modeOptions: Option<InstallMode>[] = [
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

export const performanceOptions: Option<PerformancePreset>[] = [
  { name: "Conservative", description: "Small VPS, lower memory pressure.", value: "conservative" },
  { name: "Balanced", description: "Best default for most business sites.", value: "balanced" },
  {
    name: "High memory",
    description: "Bigger VPS, more PHP workers and cache.",
    value: "high-memory"
  }
];

export const backupOptions: Option<BackupPolicy>[] = [
  {
    name: "Manual",
    description: "No automatic backups. Run them yourself anytime from the dashboard.",
    value: "manual"
  },
  {
    name: "Local backups",
    description: "Saved on this server in a folder we create, with retention and a schedule.",
    value: "local-first"
  },
  {
    name: "Local + Cloudflare R2",
    description: "Also copy every backup off-server to R2 — safest if the server fails.",
    value: "external-later"
  }
];

export const scheduleOptions: Option<BackupSchedule>[] = [
  { name: "Off", description: "No scheduled backups.", value: "off" },
  { name: "Daily", description: "Back up every night.", value: "daily" },
  { name: "Weekly", description: "Back up once a week.", value: "weekly" }
];
