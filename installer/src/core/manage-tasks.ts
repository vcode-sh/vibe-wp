import type { ManageOperation } from "./manage-operations";
import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

export function buildOperationTask(
  op: ManageOperation,
  state: InstallerState,
  backupPath?: string
): InstallTask {
  const dir = shellQuote(state.selectedSiteDir || state.installDir);
  let command = `cd ${dir} && ./bin/vibe ${op.env} ${op.vibeCommand}`;
  if (op.needsBackup && backupPath) {
    command += ` ${shellQuote(backupPath)} --yes`;
  }
  return {
    id: op.id,
    title: op.label,
    description: op.description,
    privileged: op.safety === "danger",
    command: ["sh", "-lc", command]
  };
}

// Lists the available backup directories for a site (newest last).
export function buildBackupsListTask(env: "prod" | "stage", state: InstallerState): InstallTask {
  const dir = shellQuote(state.selectedSiteDir || state.installDir);
  return {
    id: "list-backups",
    title: "List backups",
    description: "List available backups.",
    command: ["sh", "-lc", `cd ${dir} && ./bin/vibe ${env} backups`]
  };
}

// Lists off-server (R2) backups as restorable paths; restore auto-fetches them.
export function buildRemoteBackupsListTask(
  env: "prod" | "stage",
  state: InstallerState
): InstallTask {
  const dir = shellQuote(state.selectedSiteDir || state.installDir);
  return {
    id: "list-backups-remote",
    title: "List off-server backups",
    description: "List backups stored off-server (R2).",
    command: ["sh", "-lc", `cd ${dir} && ./bin/vibe ${env} backups-remote`]
  };
}
