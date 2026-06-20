import { slugFromDomain } from "./secrets";

const commonDomainSuffixPattern = /-com$|-net$|-org$/;
const protocolPattern = /^https?:\/\//;
const trailingSlashPattern = /\/+$/;
const wordSeparatorPattern = /[-_]/;
const hashModulo = 1_000_000_007;

export function siteSlugFromDomain(domain: string): string {
  return slugFromDomain(domain).replace(commonDomainSuffixPattern, "") || "site";
}

export function stripProtocol(url: string): string {
  return url.replace(protocolPattern, "");
}

// Compact a long filesystem path for display, keeping the meaningful tail (the
// last two segments) so it stays readable and doesn't truncate on narrow
// terminals. Short paths (≤3 segments) are returned unchanged.
export function shortPath(path: string, keep = 2): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length <= keep + 1) {
    return path;
  }
  return `…/${segments.slice(-keep).join("/")}`;
}

export function defaultInstallDir(siteSlug: string, existingCount: number): string {
  return existingCount > 0 ? `/opt/vibe-wp-sites/${siteSlug}` : "/opt/vibe-wp";
}

// A sensible staging hostname for a production domain, e.g. shop.com → stage.shop.com.
export function stagingDomainFor(domain: string): string {
  const clean = stripProtocol(domain).trim().toLowerCase().replace(trailingSlashPattern, "");
  return clean ? `stage.${clean}` : "";
}

// A friendly site title guessed from a domain, e.g. my-shop.com → My Shop.
export function titleFromDomain(domain: string): string {
  const host = stripProtocol(domain).trim().toLowerCase().split("/")[0] ?? "";
  const label = host.split(".")[0] ?? "";
  return label
    .split(wordSeparatorPattern)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
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
