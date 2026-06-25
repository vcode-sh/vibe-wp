import { SECRET_ENV_KEYS, writeEnvFile } from "./env-writer";
import { EXTERNAL_PRESERVE_KEYS } from "./external-plan";
import { redact } from "./redaction";
import { SHARED_DB_PRESERVE_KEYS } from "./shared-db-plan";
import type { InstallPlan, InstallTask } from "./types";

export type TaskStatus = "pending" | "running" | "done" | "failed" | "skipped";

const TASK_TIMEOUT_MS = 30 * 60 * 1000;

// The currently-running apply command, if any. The headless entry kills this on
// SIGTERM/SIGINT so a canceled provision propagates the cancel to the in-flight
// subprocess (e.g. `docker compose up`) instead of orphaning it to keep running
// on the host after the operator believes the operation stopped.
let activeProc: { kill: () => void } | null = null;

/** Terminate the in-flight task subprocess (no-op when nothing is running). */
export function terminateActiveTask(): void {
  activeProc?.kill();
}

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
  // Expose the live child so a cancel signal can reap it (see terminateActiveTask).
  activeProc = proc;

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
  if (activeProc === proc) {
    activeProc = null;
  }

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

// env special-writes: which file each env task owns and which secrets are
// write-once. External DB/Redis creds are user-provided, so only salts preserve.
const ENV_WRITE_SPECS: Record<string, { suffix: string; preserve: ReadonlySet<string> }> = {
  "env-prod": { suffix: "/env/prod.env", preserve: SECRET_ENV_KEYS },
  "env-stage": { suffix: "/env/stage.env", preserve: SECRET_ENV_KEYS },
  "env-external": { suffix: "/env/external.env", preserve: EXTERNAL_PRESERVE_KEYS },
  // shared-db: DB creds are panel-provided (reflect latest input); the generated
  // salts AND the generated internal-Redis password are write-once.
  "env-shared-db": { suffix: "/env/shared-db.env", preserve: SHARED_DB_PRESERVE_KEYS }
};

async function runEnvWrite(taskId: string, plan: InstallPlan): Promise<TaskResult | null> {
  const spec = ENV_WRITE_SPECS[taskId];
  if (!spec) {
    return null;
  }
  const env = plan.envFiles.find((file) => file.path.endsWith(spec.suffix));
  if (!env) {
    return null;
  }
  await writeEnvFile(env.path, env.values, { preserveExisting: spec.preserve });
  return { id: taskId, status: "done", output: `Updated ${env.path}.`, code: 0 };
}

// Writes the site's Caddy snippet, ensures the global import, and reports the
// privileged install's exit status as the task result.
async function deployCaddyfile(
  taskId: string,
  plan: InstallPlan,
  suffix: string
): Promise<TaskResult> {
  const tempPath = `/tmp/vibe-wp-caddyfile-${Date.now()}`;
  await Bun.write(tempPath, plan.caddyfile);
  const sitePath = `/etc/caddy/sites-enabled/vibe-wp-${plan.siteSlug}${suffix}.caddy`;
  const script = [
    'if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi',
    "$SUDO install -d -m 0755 /etc/caddy/sites-enabled",
    "if [ -f /etc/caddy/Caddyfile ]; then $SUDO cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.vibe-wp.$(date -u +%Y%m%dT%H%M%SZ).bak; fi",
    "if [ ! -f /etc/caddy/Caddyfile ]; then printf '%s\\n' 'import /etc/caddy/sites-enabled/*.caddy' | $SUDO tee /etc/caddy/Caddyfile >/dev/null; fi",
    "grep -q 'sites-enabled/\\*.caddy' /etc/caddy/Caddyfile || printf '\\n%s\\n' 'import /etc/caddy/sites-enabled/*.caddy' | $SUDO tee -a /etc/caddy/Caddyfile >/dev/null",
    `$SUDO install -m 0644 ${tempPath} ${sitePath}`
  ].join("; ");
  const install = Bun.spawn(["sh", "-lc", script], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(install.stdout).text(),
    new Response(install.stderr).text(),
    install.exited
  ]);
  if (code !== 0) {
    return {
      id: taskId,
      status: "failed",
      output: redact([stdout, stderr].join("\n").trim()),
      code
    };
  }
  return {
    id: taskId,
    status: "done",
    output: `Installed ${sitePath} and ensured the global Caddy import.`,
    code: 0
  };
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
    if (phase === "after") {
      const envWrite = await runEnvWrite(task.id, plan);
      if (envWrite) {
        return envWrite;
      }
    }

    if (phase === "before" && task.id === "caddyfile") {
      return await deployCaddyfile(task.id, plan, "");
    }

    if (phase === "before" && task.id === "stage-caddyfile") {
      return await deployCaddyfile(task.id, plan, "-stage");
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
