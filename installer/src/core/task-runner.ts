import { writeEnvFile } from "./env-writer";
import { redact } from "./redaction";
import type { InstallPlan, InstallTask } from "./types";

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

const TASK_TIMEOUT_MS = 30 * 60 * 1000;

export interface TaskResult {
  code: number;
  id: string;
  output: string;
  status: TaskStatus;
}

export interface RunPlanEvents {
  onTaskResult?: (
    task: InstallTask,
    result: TaskResult,
    index: number,
    total: number
  ) => void | Promise<void>;
  onTaskStart?: (task: InstallTask, index: number, total: number) => void | Promise<void>;
}

export async function runTask(
  task: InstallTask,
  apply: boolean,
  plan?: InstallPlan
): Promise<TaskResult> {
  if (task.skip) {
    return { id: task.id, status: "skipped", output: "Skipped by plan.", code: 0 };
  }

  if (apply && plan?.localSandbox) {
    return simulateLocalTask(task);
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

  // Safety net: a stuck command (e.g. one that unexpectedly streams) must never
  // hang the UI forever. 30 minutes is generous enough for real installs.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, TASK_TIMEOUT_MS);

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited
  ]);
  clearTimeout(timer);

  if (timedOut) {
    return {
      id: task.id,
      status: "failed",
      output: redact(`Timed out after ${TASK_TIMEOUT_MS / 60_000} minutes. ${stdout}\n${stderr}`),
      code: 124
    };
  }

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

export async function runPlan(
  plan: InstallPlan,
  apply: boolean,
  events: RunPlanEvents = {}
): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (const [index, task] of plan.tasks.entries()) {
    await events.onTaskStart?.(task, index, plan.tasks.length);
    const result = await runTask(task, apply, plan);
    results.push(result);
    await events.onTaskResult?.(task, result, index, plan.tasks.length);
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
      const sitePath = `/etc/caddy/sites-enabled/vibe-wp-${plan.siteSlug}.caddy`;
      const install = Bun.spawn(
        [
          "sh",
          "-lc",
          [
            'if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi',
            "$SUDO install -d -m 0755 /etc/caddy/sites-enabled",
            "if [ -f /etc/caddy/Caddyfile ]; then $SUDO cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.vibe-wp.$(date -u +%Y%m%dT%H%M%SZ).bak; fi",
            "if [ ! -f /etc/caddy/Caddyfile ]; then printf '%s\\n' 'import /etc/caddy/sites-enabled/*.caddy' | $SUDO tee /etc/caddy/Caddyfile >/dev/null; fi",
            "grep -q 'sites-enabled/\\*.caddy' /etc/caddy/Caddyfile || printf '\\n%s\\n' 'import /etc/caddy/sites-enabled/*.caddy' | $SUDO tee -a /etc/caddy/Caddyfile >/dev/null",
            `$SUDO install -m 0644 ${tempPath} ${sitePath}`
          ].join("; ")
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
        output: `Installed ${sitePath} and ensured the global Caddy import.`,
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

function simulateLocalTask(task: InstallTask): TaskResult {
  const command = task.command ? `$ ${task.command.join(" ")}` : "No command required.";
  return {
    id: task.id,
    status: "done",
    output: redact(`Local sandbox: simulated task only.\n${command}`),
    code: 0
  };
}
