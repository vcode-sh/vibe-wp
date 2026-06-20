import { detectHostFacts } from "./host";
import { buildInstallPlan } from "./install-plan";
import { availableOperations, type ManageOperation } from "./manage-operations";
import { buildOperationTask } from "./manage-tasks";
import { redactPlan } from "./redaction";
import { runPlan, runTask, type TaskResult } from "./task-runner";
import type { HostFacts, InstallerState, InstallPlan } from "./types";
import { validateState } from "./validation";

// Frontend-agnostic request/response surface. Any frontend (TUI, web, desktop,
// or an IPC/daemon bridge) drives the core through this one function, so the
// business logic stays the single shared brain. JSON-serializable by design.
export type CoreRequest =
  | { kind: "detect" }
  | { kind: "validate"; state: InstallerState }
  | { kind: "plan"; state: InstallerState; redact?: boolean }
  | { kind: "operations"; hasStaging?: boolean }
  | { kind: "runPlan"; plan: InstallPlan; apply: boolean }
  | { kind: "runOperation"; operationId: string; state: InstallerState; apply: boolean };

export type CoreResponse =
  | { kind: "detect"; host: HostFacts }
  | { kind: "validate"; errors: string[] }
  | { kind: "plan"; plan: InstallPlan }
  | { kind: "operations"; operations: ManageOperation[] }
  | { kind: "runPlan"; results: TaskResult[] }
  | { kind: "runOperation"; result: TaskResult }
  | { kind: "error"; message: string };

export async function runHeadless(request: CoreRequest): Promise<CoreResponse> {
  switch (request.kind) {
    case "detect":
      return { kind: "detect", host: await detectHostFacts() };
    case "validate":
      return { kind: "validate", errors: validateState(request.state) };
    case "plan": {
      const plan = buildInstallPlan(request.state);
      return { kind: "plan", plan: request.redact ? redactPlan(plan) : plan };
    }
    case "operations":
      return { kind: "operations", operations: availableOperations(request.hasStaging ?? false) };
    case "runPlan":
      return { kind: "runPlan", results: await runPlan(request.plan, request.apply) };
    case "runOperation":
      return runOperation(request.operationId, request.state, request.apply);
    default:
      return { kind: "error", message: "Unknown request kind." };
  }
}

async function runOperation(
  operationId: string,
  state: InstallerState,
  apply: boolean
): Promise<CoreResponse> {
  const op = availableOperations(true).find((candidate) => candidate.id === operationId);
  if (!op) {
    return { kind: "error", message: `Unknown operation: ${operationId}` };
  }
  const plan = buildInstallPlan(state);
  const result = await runTask(buildOperationTask(op, state), apply, plan);
  return { kind: "runOperation", result };
}
