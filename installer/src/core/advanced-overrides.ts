import type { InstallerState } from "./types";

export interface AdvancedOverrideWarning {
  consequence: string;
  id: string;
  label: string;
}

export function advancedOverrideWarnings(state: InstallerState): AdvancedOverrideWarning[] {
  const warnings: AdvancedOverrideWarning[] = [];
  if (state.dnsPreflightOverride) {
    warnings.push({
      consequence:
        "The installer will continue even if the primary domain is not resolving here yet.",
      id: "dns-preflight",
      label: "DNS preflight override"
    });
  }
  if (!state.installDocker) {
    warnings.push({
      consequence: "Docker must already be installed and working before the stack can start.",
      id: "host-install",
      label: "Host package installation disabled"
    });
  }
  if (!state.installCaddy) {
    warnings.push({
      consequence: "Caddy must already be installed or the site will not receive a host route.",
      id: "caddy",
      label: "Caddy installation disabled"
    });
  }
  if (!state.wwwAlias) {
    warnings.push({
      consequence: "The www hostname will not be added to the generated Caddy route.",
      id: "www-alias",
      label: "www alias disabled"
    });
  }
  if (!state.hardenServer) {
    warnings.push({
      consequence: "Firewall, fail2ban, and unattended-upgrades are left to the operator.",
      id: "hardening",
      label: "Server hardening disabled"
    });
  }
  if (!state.monitorEnabled) {
    warnings.push({
      consequence: "The hourly health-monitoring timer will not be installed.",
      id: "monitoring",
      label: "Monitoring disabled"
    });
  }
  if (state.fullDelete) {
    warnings.push({
      consequence: "Selected files, Caddy snippets, and Docker volumes can be removed permanently.",
      id: "full-delete",
      label: "Full delete enabled"
    });
  }
  if (state.performanceCustom && Object.keys(state.performanceOverrides).length > 0) {
    warnings.push({
      consequence: "Custom resource values override the RAM-sized preset.",
      id: "performance",
      label: "Performance values customized"
    });
  }
  return warnings;
}
