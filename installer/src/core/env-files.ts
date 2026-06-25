import { productionEnvValues, stagingEnvValues } from "./env-writer";
import { externalEnvValues } from "./external-plan";
import { sharedDbEnvValues } from "./shared-db-plan";
import type { EnvFilePlan, InstallerState, InstallMode } from "./types";

// manage/remove/update operate on an installed site: they preserve existing
// secrets and rewrite no production env, so no env files are planned for them.
export const NO_PROD_REWRITE_MODES: ReadonlySet<InstallMode> = new Set<InstallMode>([
  "manage-existing",
  "remove-existing",
  "update-existing"
]);

export function buildEnvFiles(state: InstallerState): EnvFilePlan[] {
  const dir = state.selectedSiteDir || state.installDir;
  // Standalone single-env modes: external (bring-your-own DB/Redis) and shared-db
  // (shared MariaDB + per-site internal Redis) each emit only their own env file.
  if (state.mode === "external-services") {
    return [{ path: `${state.installDir}/env/external.env`, values: externalEnvValues(state) }];
  }
  if (state.mode === "shared-db") {
    return [{ path: `${state.installDir}/env/shared-db.env`, values: sharedDbEnvValues(state) }];
  }
  if (state.mode === "staging-only") {
    // Staging-only attaches to a live prod site: emit only the stage env file.
    return [{ path: `${dir}/env/stage.env`, values: stagingEnvValues(state) }];
  }
  if (NO_PROD_REWRITE_MODES.has(state.mode)) {
    return [];
  }
  const envFiles: EnvFilePlan[] = [
    { path: `${state.installDir}/env/prod.env`, values: productionEnvValues(state) }
  ];
  if (state.stagingEnabled) {
    envFiles.push({ path: `${state.installDir}/env/stage.env`, values: stagingEnvValues(state) });
  }
  return envFiles;
}
