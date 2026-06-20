import type { PlanJournal } from "./journal";
import { runTask, type TaskResult } from "./task-runner";
import type { InstallPlan, InstallTask } from "./types";

export interface RunPlanEvents {
  onTaskResult?: (
    task: InstallTask,
    result: TaskResult,
    index: number,
    total: number
  ) => void | Promise<void>;
  onTaskStart?: (task: InstallTask, index: number, total: number) => void | Promise<void>;
}

// Runs a plan's tasks in order, stopping at the first failure. When a journal is
// supplied, completed tasks are skipped (resume) and every result is persisted.
export async function runPlan(
  plan: InstallPlan,
  apply: boolean,
  events: RunPlanEvents = {},
  journal?: PlanJournal
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (const [index, task] of plan.tasks.entries()) {
    if (journal?.completed.has(task.id)) {
      const skipped: TaskResult = {
        id: task.id,
        status: "done",
        output: "Skipped (already completed in a previous run).",
        code: 0
      };
      results.push(skipped);
      await events.onTaskResult?.(task, skipped, index, plan.tasks.length);
      continue;
    }
    await events.onTaskStart?.(task, index, plan.tasks.length);
    const result = await runTask(task, apply, plan);
    results.push(result);
    await journal?.record(result);
    await events.onTaskResult?.(task, result, index, plan.tasks.length);
    if (result.status === "failed") {
      break;
    }
  }
  return results;
}
