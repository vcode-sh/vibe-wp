import { slugFromDomain } from "./secrets";

const commonDomainSuffixPattern = /-com$|-net$|-org$/;
const protocolPattern = /^https?:\/\//;
const hashModulo = 1_000_000_007;

export function siteSlugFromDomain(domain: string): string {
  return slugFromDomain(domain).replace(commonDomainSuffixPattern, "") || "site";
}

export function stripProtocol(url: string): string {
  return url.replace(protocolPattern, "");
}

export function defaultInstallDir(siteSlug: string, existingCount: number): string {
  return existingCount > 0 ? `/opt/vibe-wp-sites/${siteSlug}` : "/opt/vibe-wp";
}

export function portPairFromSlug(siteSlug: string): { production: string; staging: string } {
  const base = 18_000 + (hash(siteSlug) % 5000) * 2;
  return {
    production: String(base),
    staging: String(base + 1)
  };
}

function hash(value: string): number {
  let result = 0;
  for (const char of value) {
    result = (result * 31 + char.charCodeAt(0)) % hashModulo;
  }
  return result;
}
