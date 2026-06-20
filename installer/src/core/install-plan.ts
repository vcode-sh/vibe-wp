import { renderCaddyfile } from "./caddyfile";
import { INSTALLER_VERSION } from "./defaults";
import { buildDnsPreflightTask } from "./dns-preflight";
import {
  buildEnvFiles,
  buildManageTasks,
  buildRemoveTasks,
  buildStagingOnlyTasks,
  buildUpdateTasks,
  skipCaddyForMode
} from "./operations-plan";
import { buildPlanWarnings } from "./plan-warnings";
import { shellQuote } from "./shell";
import type { InstallerState, InstallPlan, InstallTask } from "./types";

export function buildInstallPlan(state: InstallerState): InstallPlan {
  const warnings = buildPlanWarnings(state);
  const tasks = buildTasks(state);
  const envFiles = buildEnvFiles(state);
  const skipCaddy = skipCaddyForMode(state.mode);

  return {
    version: INSTALLER_VERSION,
    generatedAt: new Date().toISOString(),
    installDir: state.installDir,
    localSandbox: state.localSandbox,
    repo: state.repo,
    ref: state.ref,
    siteSlug: state.siteSlug,
    domains: {
      production: state.productionDomain.trim().toLowerCase(),
      wwwAlias: state.wwwAlias,
      stagingEnabled: state.stagingEnabled,
      staging: state.stagingDomain.trim().toLowerCase()
    },
    envFiles,
    caddyfile: skipCaddy ? "" : renderCaddyfile(state),
    tasks,
    warnings,
    summary: {
      productionUrl: `https://${state.productionDomain.trim().toLowerCase()}`,
      adminUrl: `https://${state.productionDomain.trim().toLowerCase()}/wp-admin`,
      stagingUrl: state.stagingEnabled
        ? `https://${state.stagingDomain.trim().toLowerCase()}`
        : "disabled",
      installDir: state.installDir,
      siteSlug: state.siteSlug,
      performancePreset: state.performancePreset,
      backupPolicy: state.backupPolicy
    }
  };
}

function buildTasks(state: InstallerState): InstallTask[] {
  if (state.mode === "manage-existing") {
    return buildManageTasks(state);
  }
  if (state.mode === "remove-existing") {
    return buildRemoveTasks(state);
  }
  if (state.mode === "staging-only") {
    return buildStagingOnlyTasks(state);
  }
  if (state.mode === "update-existing") {
    return buildUpdateTasks(state);
  }
  // external-services intentionally falls through to the full install flow for now,
  // pending a dedicated bring-your-own-services plan.

  const tasks: InstallTask[] = [];
  const sudo = state.host.sudo ? "sudo " : "";
  const installDir = shellQuote(state.installDir);
  const ref = shellQuote(state.ref);
  const repo = shellQuote(state.repo);

  tasks.push(buildDnsPreflightTask(state));

  if (state.installDocker && !state.host.docker) {
    tasks.push({
      id: "install-docker",
      title: "Install Docker Engine",
      description: "Install Docker from the official apt repository.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `${sudo}apt update && ${sudo}apt install -y ca-certificates curl && ${sudo}install -m 0755 -d /etc/apt/keyrings && ${sudo}curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && ${sudo}chmod a+r /etc/apt/keyrings/docker.asc && ${sudo}tee /etc/apt/sources.list.d/docker.sources >/dev/null <<'EOF'\nTypes: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: $(. /etc/os-release && echo "\${UBUNTU_CODENAME:-$VERSION_CODENAME}")\nComponents: stable\nArchitectures: $(dpkg --print-architecture)\nSigned-By: /etc/apt/keyrings/docker.asc\nEOF\n${sudo}apt update && ${sudo}apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`
      ]
    });
  }

  if (state.installCaddy && !state.host.caddy) {
    tasks.push({
      id: "install-caddy",
      title: "Install Caddy",
      description: "Install Caddy from the official package repository.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `${sudo}apt install -y debian-keyring debian-archive-keyring apt-transport-https curl && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | ${sudo}gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | ${sudo}tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null && ${sudo}chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list && ${sudo}apt update && ${sudo}apt install -y caddy`
      ]
    });
  }

  tasks.push({
    id: "checkout",
    title: "Prepare Vibe WP checkout",
    description: "Clone or update the Vibe WP repository.",
    command: [
      "sh",
      "-lc",
      `if [ -d ${shellQuote(`${state.installDir}/.git`)} ]; then git -C ${installDir} fetch --all --prune && git -C ${installDir} checkout ${ref} && git -C ${installDir} pull --ff-only; else mkdir -p ${installDir} && git clone --branch ${ref} ${repo} ${installDir}; fi`
    ]
  });

  tasks.push({
    id: "env-prod",
    title: "Generate production environment",
    description: "Create production env file with loopback HTTP binding and generated secrets.",
    // Idempotent: make init-* refuses to overwrite an existing env file, so a
    // retried install would fail here. Only scaffold when missing; the
    // task-runner's writeEnvFile special-write merges plan values on top.
    command: ["sh", "-lc", `cd ${installDir} && { [ -f env/prod.env ] || make init-prod; }`]
  });

  if (state.stagingEnabled) {
    tasks.push({
      id: "env-stage",
      title: "Generate staging environment",
      description: "Create isolated staging env file with noindex and mail safeguards.",
      command: ["sh", "-lc", `cd ${installDir} && { [ -f env/stage.env ] || make init-stage; }`]
    });
  }

  tasks.push(
    {
      id: "caddyfile",
      title: "Configure HTTPS proxy",
      description: "Write and validate the Caddy reverse proxy configuration.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `${sudo}caddy validate --config /etc/caddy/Caddyfile && ${sudo}systemctl reload caddy`
      ]
    },
    {
      id: "prod-config",
      title: "Validate production Compose",
      description: "Check Docker Compose config before starting containers.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod config`]
    },
    {
      id: "prod-up",
      title: "Start production",
      description: "Build and start the production stack.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod up`]
    },
    {
      id: "prod-install",
      title: "Install WordPress",
      description: "Install WordPress, Redis Object Cache, AI plugins, and cleanup defaults.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod install`]
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
      description: "Print read-only performance diagnostics.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod perf-report`]
    }
  );

  if (state.stagingEnabled) {
    tasks.push(
      {
        id: "stage-config",
        title: "Validate staging Compose",
        description: "Check staging Compose config before starting containers.",
        command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe stage config`]
      },
      {
        id: "stage-up",
        title: "Start staging",
        description: "Build and start the isolated staging stack.",
        command: [
          "sh",
          "-lc",
          `cd ${installDir} && ./bin/vibe stage up && ./bin/vibe stage install && ./bin/vibe stage smoke`
        ]
      }
    );
  }

  if (state.backupPolicy !== "manual") {
    tasks.push({
      id: "first-backup",
      title: "Create first backup",
      description: "Create and verify the first production backup.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod backup`]
    });
  }
  return tasks;
}
