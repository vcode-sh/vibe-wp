import { appendFile, mkdir } from "node:fs/promises";
import { redact } from "./redaction";
import type { TaskResult } from "./task-runner";

// A persistent install journal: records each task's status to state.json and a
// human-readable install.log under .vibe-installer/, so a failed or interrupted
// install can be re-run with --resume and skip the steps that already succeeded.
export interface PlanJournal {
  completed: ReadonlySet<string>;
  logPath: string;
  record(result: TaskResult): Promise<void>;
  statePath: string;
}

interface JournalState {
  results: TaskResult[];
  updatedAt: string;
}

export async function openJournal(dir: string, resume: boolean): Promise<PlanJournal> {
  await mkdir(dir, { recursive: true });
  const statePath = `${dir}/state.json`;
  const logPath = `${dir}/install.log`;
  const results: TaskResult[] = [];
  const completed = new Set<string>();

  if (resume) {
    const file = Bun.file(statePath);
    if (await file.exists()) {
      try {
        const prev = (await file.json()) as JournalState;
        for (const result of prev.results ?? []) {
          results.push(result);
          if (result.status === "done") {
            completed.add(result.id);
          }
        }
      } catch {
        // A corrupt journal just means we start fresh; never block the install.
      }
    }
  }

  async function persist(): Promise<void> {
    const state: JournalState = { updatedAt: new Date().toISOString(), results };
    await Bun.write(statePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  return {
    completed,
    statePath,
    logPath,
    async record(result: TaskResult): Promise<void> {
      const index = results.findIndex((entry) => entry.id === result.id);
      if (index >= 0) {
        results[index] = result;
      } else {
        results.push(result);
      }
      await persist();
      const body = redact(result.output ?? "").trim();
      await appendFile(logPath, `[${result.status}] ${result.id}\n${body}\n\n`);
    }
  };
}
