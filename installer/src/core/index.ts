// biome-ignore-all lint/performance/noBarrelFile: intentional public API facade for the core
// Public, frontend-agnostic API for the Vibe WP core.
//
// This is the stable surface that frontends (TUI today; web + desktop later)
// import from — `import { buildInstallPlan } from "../core"` — instead of reaching
// into deep module paths. The core has NO UI dependencies (enforced by
// boundary.test.ts), so the same brain powers every frontend.

export {
  choosePreset,
  defaultState,
  emptyHostFacts,
  INSTALLER_VERSION,
  performanceValues
} from "./defaults";
export type { CoreRequest, CoreResponse } from "./headless";
export { runHeadless } from "./headless";
export { detectHostFacts } from "./host";
export { buildInstallPlan } from "./install-plan";
export { applyLocalSandboxDefaults, createLocalSandboxHostFacts } from "./local-sandbox";
export type { ManageOperation, OpGroup, OpGroupView, OpSafety } from "./manage-operations";
export {
  availableOperations,
  groupedOperations,
  MANAGE_OPERATIONS
} from "./manage-operations";
export { buildBackupsListTask, buildOperationTask } from "./manage-tasks";
export type { RunPlanEvents } from "./plan-runner";
export { runPlan } from "./plan-runner";
export { redact, redactPlan } from "./redaction";
export {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stripProtocol
} from "./site-profile";
export type { TaskResult, TaskStatus } from "./task-runner";
export { runTask } from "./task-runner";
export type {
  BackupPolicy,
  EnvFilePlan,
  ExistingSite,
  HostFacts,
  InstallerOptions,
  InstallerState,
  InstallMode,
  InstallPlan,
  InstallTask,
  PerformancePreset
} from "./types";
export { validateState } from "./validation";
