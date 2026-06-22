import { buildBaseState } from "./base-state";
import { detectHostFacts } from "./host";
import { buildInstallPlan } from "./install-plan";
import { availableOperations, type ManageOperation } from "./manage-operations";
import { buildOperationTask } from "./manage-tasks";
import { runPlan } from "./plan-runner";
import { redactPlan } from "./redaction";
import { runTask, type TaskResult } from "./task-runner";
import type {
  HostFacts,
  InstallerState,
  InstallMode,
  InstallPlan,
  ProgressEvent
} from "./types";
import { validateState } from "./validation";

// Frontend-agnostic request/response surface. Any frontend (TUI, web, desktop,
// or an IPC/daemon bridge) drives the core through this one function, so the
// business logic stays the single shared brain. JSON-serializable by design.
export type CoreRequest =
  | { kind: "detect" }
  | { kind: "baseState"; domain?: string; mode?: InstallMode }
  | { kind: "validate"; state: InstallerState }
  | { kind: "plan"; state: InstallerState; redact?: boolean }
  | { kind: "operations"; hasStaging?: boolean }
  | { kind: "runPlan"; plan: InstallPlan; apply: boolean }
  | { kind: "runOperation"; operationId: string; state: InstallerState; apply: boolean };

export type CoreResponse =
  | { kind: "detect"; host: HostFacts }
  | { kind: "baseState"; state: InstallerState }
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
    case "baseState": {
      const host = await detectHostFacts();
      return {
        kind: "baseState",
        state: buildBaseState(host, { domain: request.domain, mode: request.mode })
      };
    }
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

// Streaming variant of the runPlan case. runHeadless stays the one-shot brain
// for every kind; this is the ONLY entry that emits per-task progress, by
// wiring plan-runner's RunPlanEvents to `emit`. It returns the SAME final
// { kind: "runPlan", results } CoreResponse runHeadless would — the CLI prints
// the progress events as NDJSON, then this terminal response as the last line.
export async function runHeadlessRunPlan(
  plan: InstallPlan,
  apply: boolean,
  emit: (event: ProgressEvent) => void
): Promise<CoreResponse> {
  const results = await runPlan(plan, apply, {
    onTaskStart: (task, index, total) => {
      emit({
        kind: "progress",
        phase: "start",
        taskId: task.id,
        name: task.title,
        index,
        total
      });
    },
    onTaskResult: (task, result, index, total) => {
      emit({
        kind: "progress",
        phase: "result",
        taskId: task.id,
        name: task.title,
        index,
        total,
        status: result.status,
        output: result.output
      });
    }
  });
  return { kind: "runPlan", results };
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
