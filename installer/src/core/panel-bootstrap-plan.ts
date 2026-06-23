import { INSTALLER_VERSION } from "./defaults";
import { buildDnsPreflightTask } from "./dns-preflight";
import { buildHostInstallTasks } from "./host-install";
import { resolvePanelAccessUrl } from "./panel-access";
import { shellQuote } from "./shell";
import type { InstallerState, InstallPlan, InstallTask } from "./types";

// The panel's canonical repo checkout — deliberately NOT the installer's site
// DEFAULT_INSTALL_DIR (/opt/vibe-wp), so the panel source never collides with a
// site installed at the default path.
const PANEL_CHECKOUT_DIR = "/opt/vibe-wp-src";

export function buildPanelBootstrapPlan(state: InstallerState): InstallPlan {
  const tasks: InstallTask[] = [];

  if (state.panelAccessMode === "domain") {
    tasks.push(buildDnsPreflightTask(state));
  }
  tasks.push(...buildHostInstallTasks(state));

  const parts = [
    `${PANEL_CHECKOUT_DIR}/bin/panel install`,
    `--access ${state.panelAccessMode}`,
    `--admin-email ${shellQuote(state.adminEmail)}`
  ];
  if (state.panelAccessMode === "domain") {
    parts.push(`--domain ${shellQuote(state.productionDomain)}`);
  }

  tasks.push({
    id: "panel-install",
    title: "Install the control panel",
    description: "Deploy the Vibe WP control panel (systemd + Caddy + owner).",
    privileged: true,
    command: ["sh", "-lc", parts.join(" ")]
  });

  const url = resolvePanelAccessUrl(
    state.panelAccessMode,
    state.productionDomain,
    state.host.publicIp
  );

  return {
    caddyfile: "",
    domains: {
      production: state.productionDomain,
      stagingEnabled: false,
      staging: "",
      wwwAlias: false
    },
    envFiles: [],
    generatedAt: new Date().toISOString(),
    installDir: PANEL_CHECKOUT_DIR,
    localSandbox: state.localSandbox,
    ref: state.ref,
    repo: state.repo,
    siteSlug: "panel",
    summary: {
      panelUrl: url,
      installDir: PANEL_CHECKOUT_DIR,
      accessMode: state.panelAccessMode
    },
    tasks,
    version: INSTALLER_VERSION,
    warnings: []
  };
}
