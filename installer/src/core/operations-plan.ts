import { buildDnsPreflightTask } from "./dns-preflight";
import { productionEnvValues, stagingEnvValues } from "./env-writer";
import { externalEnvValues } from "./external-plan";
import { shellQuote } from "./shell";
import type { EnvFilePlan, InstallerState, InstallMode, InstallTask } from "./types";

const NO_PROD_REWRITE_MODES = new Set<InstallMode>([
  "manage-existing",
  "remove-existing",
  "update-existing"
]);

export function skipCaddyForMode(mode: InstallMode): boolean {
  return NO_PROD_REWRITE_MODES.has(mode) || mode === "staging-only";
}

export function buildEnvFiles(state: InstallerState): EnvFilePlan[] {
  const dir = state.selectedSiteDir || state.installDir;
  if (state.mode === "external-services") {
    // Bring-your-own MariaDB/Redis: only the external env file is emitted.
    return [{ path: `${state.installDir}/env/external.env`, values: externalEnvValues(state) }];
  }
  if (state.mode === "staging-only") {
    // Staging-only attaches to a live prod site: emit only the stage env file.
    return [{ path: `${dir}/env/stage.env`, values: stagingEnvValues(state) }];
  }
  // manage/remove/update preserve existing secrets and regenerate nothing.
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

export function buildStagingOnlyTasks(state: InstallerState): InstallTask[] {
  const installDir = shellQuote(state.selectedSiteDir || state.installDir);
  const sudo = state.host.sudo ? "sudo " : "";
  return [
    buildDnsPreflightTask(state),
    {
      id: "env-stage",
      title: "Generate staging environment",
      description: "Create the isolated staging env file with noindex and mail safeguards.",
      command: ["sh", "-lc", `cd ${installDir} && { [ -f env/stage.env ] || make init-stage; }`]
    },
    {
      id: "stage-config",
      title: "Validate staging Compose",
      description: "Check staging Compose config before starting containers.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe stage config`]
    },
    {
      id: "stage-caddyfile",
      title: "Add staging HTTPS route",
      description: "Write the staging Caddy snippet so the staging domain gets HTTPS.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `${sudo}caddy validate --config /etc/caddy/Caddyfile && ${sudo}systemctl reload caddy`
      ]
    },
    {
      id: "stage-up",
      title: "Start staging",
      description: "Build, install, and smoke-test the isolated staging stack.",
      command: [
        "sh",
        "-lc",
        `cd ${installDir} && ./bin/vibe stage up && ./bin/vibe stage install && ./bin/vibe stage smoke`
      ]
    }
  ];
}

export function buildUpdateTasks(state: InstallerState): InstallTask[] {
  const dir = state.selectedSiteDir || state.installDir;
  const installDir = shellQuote(dir);
  const ref = shellQuote(state.ref);
  const repo = shellQuote(state.repo);
  return [
    {
      id: "checkout",
      title: "Update Vibe WP checkout",
      description: "Fetch and fast-forward the existing repository without touching data.",
      command: [
        "sh",
        "-lc",
        `if [ -d ${shellQuote(`${dir}/.git`)} ]; then git -C ${installDir} fetch --all --prune && git -C ${installDir} checkout ${ref} && git -C ${installDir} pull --ff-only; else mkdir -p ${installDir} && git clone --branch ${ref} ${repo} ${installDir}; fi`
      ]
    },
    {
      id: "prod-config",
      title: "Validate production Compose",
      description: "Check Docker Compose config before restarting containers.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod config`]
    },
    {
      id: "prod-up",
      title: "Rebuild and restart production",
      description: "Rebuild and restart the production stack in place.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod up`]
    },
    {
      id: "prod-smoke",
      title: "Run production smoke test",
      description: "Verify HTTP, REST loopback, uploads, Redis, and FastCGI cache.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod smoke`]
    }
  ];
}

export function buildManageTasks(state: InstallerState): InstallTask[] {
  const installDir = shellQuote(state.selectedSiteDir || state.installDir);
  const tasks: InstallTask[] = [
    {
      id: "prod-ps",
      title: "Show production containers",
      description: "List running services for the selected Vibe WP installation.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod ps`]
    },
    {
      id: "prod-smoke",
      title: "Run production smoke test",
      description: "Verify HTTP, REST loopback, uploads, Redis, and FastCGI cache.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod smoke`]
    },
    {
      id: "prod-perf",
      title: "Create performance report",
      description: "Print read-only performance diagnostics for the selected site.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod perf-report`]
    }
  ];

  if (state.stagingEnabled) {
    tasks.push({
      id: "stage-smoke",
      title: "Run staging smoke test",
      description: "Verify the selected site's staging environment.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe stage smoke`]
    });
  }

  return tasks;
}

export function buildRemoveTasks(state: InstallerState): InstallTask[] {
  const purge = state.fullDelete;
  const dir = state.selectedSiteDir || state.installDir;
  const installDir = shellQuote(dir);
  // Purge also drops Docker volumes (data) and deletes files; default keeps both.
  const downFlags = purge ? " -v --remove-orphans" : "";
  const tasks: InstallTask[] = [
    {
      id: "pre-remove-backup",
      title: "Create safety backup",
      description: "Create a production backup before stopping services.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod backup --label pre-remove`]
    }
  ];

  if (state.stagingEnabled) {
    tasks.push({
      id: "stage-down",
      title: "Stop staging",
      description: purge ? "Stop staging and delete its volumes." : "Stop staging containers.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe stage down${downFlags}`]
    });
  }

  tasks.push({
    id: "prod-down",
    title: "Stop production",
    description: purge ? "Stop production and delete its Docker volumes." : "Stop production.",
    command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod down${downFlags}`]
  });
  tasks.push({
    id: "disable-caddy-route",
    title: purge ? "Remove HTTPS route" : "Disable HTTPS route",
    description: purge
      ? "Delete this site's Caddy snippet and reload Caddy."
      : "Move this site's Caddy snippet aside and reload Caddy.",
    privileged: true,
    command: ["sh", "-lc", disableCaddyCommand(state.siteSlug, purge)]
  });

  if (purge) {
    tasks.push({
      id: "purge-files",
      title: "Delete site files",
      description: "Permanently delete the site's install directory. Off-server backups remain.",
      privileged: true,
      command: ["sh", "-lc", `${state.host.sudo ? "sudo " : ""}rm -rf ${installDir}`]
    });
  }

  return tasks;
}

function disableCaddyCommand(siteSlug: string, remove = false): string {
  const base = `/etc/caddy/sites-enabled/vibe-wp-${siteSlug}`;
  // Purge deletes the prod + staging snippets; default moves prod aside.
  const action = remove
    ? `$SUDO rm -f "${base}.caddy" "${base}-stage.caddy"`
    : `if [ -f "${base}.caddy" ]; then $SUDO mv "${base}.caddy" "${base}.caddy.disabled.$(date -u +%Y%m%dT%H%M%SZ)"; fi`;
  return [
    "command -v caddy >/dev/null 2>&1 || exit 0",
    'if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi',
    action,
    "$SUDO caddy validate --config /etc/caddy/Caddyfile",
    "$SUDO systemctl reload caddy"
  ].join("; ");
}
