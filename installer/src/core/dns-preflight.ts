import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

/**
 * DNS preflight before any host changes.
 *
 * Only the PRIMARY domain (the production domain, or the staging domain in
 * staging-only mode) is a HARD requirement — a site that doesn't resolve here
 * can't get a TLS cert, so we block unless the operator explicitly overrode the
 * wizard's check ("Create anyway", for DNS that's still propagating).
 *
 * Secondary domains — the `www.` alias and a new site's staging subdomain — are
 * ADVISORY: they print a notice but never fail the task. The primary site is
 * fully functional without them, and their certs issue automatically once their
 * DNS resolves. (Previously every domain was fatal, so a brand-new site whose
 * owner had set only the bare domain — `www` defaults ON — was blocked at the
 * very first step even though the site itself was perfectly configured.)
 */
export function buildDnsPreflightTask(state: InstallerState): InstallTask {
  const prod = state.productionDomain.trim().toLowerCase();
  const staging = (state.stagingDomain ?? "").trim().toLowerCase();

  let required: string[];
  let optional: string[];
  if (state.mode === "staging-only") {
    // Prod is already live; only the new staging domain is the primary target.
    required = [staging].filter(Boolean);
    optional = [];
  } else {
    required = [prod].filter(Boolean);
    optional = [state.wwwAlias ? `www.${prod}` : "", state.stagingEnabled ? staging : ""].filter(
      Boolean
    );
  }

  return {
    id: "dns-preflight",
    title: "Verify DNS points to this VPS",
    description:
      "Block host changes when the primary domain does not resolve here (unless overridden); the www alias and staging domain only warn.",
    command: [
      "sh",
      "-lc",
      renderDnsPreflightCommand(
        required,
        optional,
        state.host.publicIp,
        state.dnsPreflightOverride === true
      )
    ]
  };
}

function renderDnsPreflightCommand(
  required: string[],
  optional: string[],
  detectedPublicIp: string | null,
  override: boolean
): string {
  const requiredArgs = required.map(shellQuote).join(" ");
  const optionalArgs = optional.map(shellQuote).join(" ");
  const fallbackIp = shellQuote(detectedPublicIp ?? "");
  const overrideFlag = override ? "1" : "0";

  return `set -eu
expected_ip=${fallbackIp}
if [ -z "$expected_ip" ]; then
  expected_ip="$(curl -fsS https://api.ipify.org || true)"
fi
override=${overrideFlag}
if [ -z "$expected_ip" ]; then
  if [ "$override" = "1" ]; then
    echo "Could not detect this server public IP; continuing because 'Create anyway' is set."
    exit 0
  fi
  echo "Could not detect this server public IP."
  exit 1
fi
failed=0
check_domain() {
  domain="$1"
  is_required="$2"
  resolved_ips="$(getent ahosts "$domain" | awk '{print $1}' | sort -u | tr '\\n' ' ' || true)"
  if printf " %s " "$resolved_ips" | grep -q " $expected_ip "; then
    echo "$domain resolves to $expected_ip"
  elif [ "$is_required" = "1" ] && [ "$override" != "1" ]; then
    echo "$domain does NOT point here yet (resolves to: \${resolved_ips:-none}; expected: $expected_ip). Add an A record -> $expected_ip, or use 'Create anyway' to proceed while DNS propagates."
    failed=1
  else
    echo "Notice: $domain does not point here yet (resolves to: \${resolved_ips:-none}; expected: $expected_ip) - continuing; it will start working once DNS resolves."
  fi
}
for domain in ${requiredArgs}; do check_domain "$domain" 1; done
for domain in ${optionalArgs}; do check_domain "$domain" 0; done
exit "$failed"`;
}
