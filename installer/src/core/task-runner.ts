import { writeEnvFile } from "./env-writer";
import { redact } from "./redaction";
import type { InstallPlan, InstallTask } from "./types";

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface TaskResult {
  code: number;
  id: string;
  output: string;
  status: TaskStatus;
}

export async function runTask(
  task: InstallTask,
  apply: boolean,
  plan?: InstallPlan
): Promise<TaskResult> {
  if (task.skip) {
    return { id: task.id, status: "skipped", output: "Skipped by plan.", code: 0 };
  }

  if (!(apply && task.command)) {
    return {
      id: task.id,
      status: "done",
      output: task.command ? `$ ${task.command.join(" ")}` : "No command required.",
      code: 0
    };
  }

  const preflight = await runSpecialWrite(task, apply, plan, "before");
  if (preflight.status === "failed") {
    return preflight;
  }

  const proc = Bun.spawn(task.command, {
    cwd: task.cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);

  const postflight = await runSpecialWrite(task, apply && code === 0, plan, "after");
  if (postflight.status === "failed") {
    return postflight;
  }

  const specialOutput = [preflight.output, postflight.output].filter(Boolean).join("\n");
  const commandOutput = [stdout, stderr].filter(Boolean).join("\n").trim();
  const output = redact([specialOutput, commandOutput].filter(Boolean).join("\n").trim());
  return {
    id: task.id,
    status: code === 0 ? "done" : "failed",
    output,
    code
  };
}

export async function runPlan(plan: InstallPlan, apply: boolean): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (const task of plan.tasks) {
    const result = await runTask(task, apply, plan);
    results.push(result);
    if (result.status === "failed") {
      break;
    }
  }
  return results;
}

async function runSpecialWrite(
  task: InstallTask,
  apply: boolean,
  plan: InstallPlan | undefined,
  phase: "before" | "after"
): Promise<TaskResult> {
  if (!(apply && plan)) {
    return { id: task.id, status: "done", output: "", code: 0 };
  }

  try {
    if (phase === "after" && task.id === "env-prod") {
      const env = plan.envFiles.find((file) => file.path.endsWith("/env/prod.env"));
      if (env) {
        await writeEnvFile(env.path, env.values);
        return { id: task.id, status: "done", output: `Updated ${env.path}.`, code: 0 };
      }
    }

    if (phase === "after" && task.id === "env-stage") {
      const env = plan.envFiles.find((file) => file.path.endsWith("/env/stage.env"));
      if (env) {
        await writeEnvFile(env.path, env.values);
        return { id: task.id, status: "done", output: `Updated ${env.path}.`, code: 0 };
      }
    }

    if (phase === "before" && task.id === "caddyfile") {
      const tempPath = `/tmp/vibe-wp-caddyfile-${Date.now()}`;
      await Bun.write(tempPath, plan.caddyfile);
      const install = Bun.spawn(
        [
          "sh",
          "-lc",
          `if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi; if [ -f /etc/caddy/Caddyfile ]; then $SUDO cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.vibe-wp.$(date -u +%Y%m%dT%H%M%SZ).bak; fi; $SUDO install -m 0644 ${tempPath} /etc/caddy/Caddyfile`
        ],
        {
          stdout: "pipe",
          stderr: "pipe"
        }
      );
      const [stdout, stderr, code] = await Promise.all([
        new Response(install.stdout).text(),
        new Response(install.stderr).text(),
        install.exited
      ]);
      if (code !== 0) {
        return {
          id: task.id,
          status: "failed",
          output: redact([stdout, stderr].join("\n").trim()),
          code
        };
      }
      return {
        id: task.id,
        status: "done",
        output: "Installed /etc/caddy/Caddyfile with backup.",
        code: 0
      };
    }

    return { id: task.id, status: "done", output: "", code: 0 };
  } catch (error) {
    return {
      id: task.id,
      status: "failed",
      output: redact(error instanceof Error ? error.message : String(error)),
      code: 1
    };
  }
}
