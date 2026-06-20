import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

// Host hardening as the last install step: runs ./bin/harden (idempotent) to set
// up the firewall (allowing SSH + 80/443 first), fail2ban, and automatic
// security updates. Skipped when the user opts out or host installs are off.
export function buildHardenTask(state: InstallerState): InstallTask | null {
  if (!state.hardenServer) {
    return null;
  }
  const installDir = shellQuote(state.selectedSiteDir || state.installDir);
  return {
    id: "harden",
    title: "Secure the server",
    description: "Firewall (allow SSH + web), fail2ban, and automatic security updates.",
    privileged: true,
    command: ["sh", "-lc", `cd ${installDir} && ./bin/harden`]
  };
}
