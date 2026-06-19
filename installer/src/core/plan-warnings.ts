import type { InstallerState } from "./types";
import { validateState } from "./validation";

export function buildPlanWarnings(state: InstallerState): string[] {
  const warnings = validateState(state);
  if (!(state.host.docker || state.installDocker)) {
    warnings.push("Docker is missing and host install is disabled.");
  }
  if (!(state.host.caddy || state.installCaddy)) {
    warnings.push("Caddy is missing and host install is disabled.");
  }
  if (shouldWarnAboutHostOs(state)) {
    warnings.push(`Detected OS is ${state.host.osName}; Ubuntu 26.04 LTS is the primary target.`);
  }
  return warnings;
}

function shouldWarnAboutHostOs(state: InstallerState): boolean {
  return (
    !state.localSandbox &&
    state.host.osName !== "unknown" &&
    !state.host.osName.toLowerCase().includes("ubuntu")
  );
}
