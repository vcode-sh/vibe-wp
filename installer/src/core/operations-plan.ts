import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

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
  const installDir = shellQuote(state.selectedSiteDir || state.installDir);
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
      description: "Stop staging containers without deleting volumes.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe stage down`]
    });
  }

  tasks.push({
    id: "prod-down",
    title: "Stop production",
    description: "Stop production containers without deleting files or volumes.",
    command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe prod down`]
  });
  tasks.push({
    id: "disable-caddy-route",
    title: "Disable HTTPS route",
    description: "Move this site's Caddy snippet aside and reload Caddy.",
    privileged: true,
    command: ["sh", "-lc", disableCaddyCommand(state.siteSlug)]
  });

  return tasks;
}

function disableCaddyCommand(siteSlug: string): string {
  return [
    "command -v caddy >/dev/null 2>&1 || exit 0",
    'if [ "$(id -u)" = 0 ]; then SUDO=""; else SUDO="sudo"; fi',
    `path=/etc/caddy/sites-enabled/vibe-wp-${siteSlug}.caddy`,
    'if [ -f "$path" ]; then $SUDO mv "$path" "$path.disabled.$(date -u +%Y%m%dT%H%M%SZ)"; fi',
    "$SUDO caddy validate --config /etc/caddy/Caddyfile",
    "$SUDO systemctl reload caddy"
  ].join("; ");
}
