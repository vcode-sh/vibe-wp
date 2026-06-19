import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

export function buildDnsPreflightTask(state: InstallerState): InstallTask {
  const domains = [
    state.productionDomain.trim().toLowerCase(),
    state.wwwAlias ? `www.${state.productionDomain.trim().toLowerCase()}` : "",
    state.stagingEnabled ? state.stagingDomain.trim().toLowerCase() : ""
  ].filter(Boolean);

  return {
    id: "dns-preflight",
    title: "Verify DNS points to this VPS",
    description:
      "Block installation before host changes when domains do not resolve to this server.",
    command: ["sh", "-lc", renderDnsPreflightCommand(domains, state.host.publicIp)]
  };
}

function renderDnsPreflightCommand(domains: string[], detectedPublicIp: string | null): string {
  const domainArgs = domains.map(shellQuote).join(" ");
  const fallbackIp = shellQuote(detectedPublicIp ?? "");

  return `set -eu
expected_ip=${fallbackIp}
if [ -z "$expected_ip" ]; then
  expected_ip="$(curl -fsS https://api.ipify.org || true)"
fi
if [ -z "$expected_ip" ]; then
  echo "Could not detect this server public IP."
  exit 1
fi
failed=0
for domain in ${domainArgs}; do
  resolved_ips="$(getent ahosts "$domain" | awk '{print $1}' | sort -u | tr '\\n' ' ' || true)"
  if printf " %s " "$resolved_ips" | grep -q " $expected_ip "; then
    echo "$domain resolves to $expected_ip"
  else
    echo "$domain resolves to: \${resolved_ips:-none}; expected: $expected_ip"
    failed=1
  fi
done
exit "$failed"`;
}
