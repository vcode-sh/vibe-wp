// Excludes shell/compose interpolation + comment triggers ($, #, backtick,
// quotes) so secrets are safe in env files consumed by BOTH `. source` and
// docker compose --env-file. Still 60+ chars of entropy.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@%^*-_=+";
const domainProtocolPattern = /^https?:\/\//;
const domainSlugSeparatorPattern = /[^a-z0-9]+/g;
const domainSlugTrimPattern = /^-+|-+$/g;

export function randomPassword(length = 28): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function randomHex(bytes = 32): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function slugFromDomain(domain: string): string {
  return (
    domain
      .trim()
      .toLowerCase()
      .replace(domainProtocolPattern, "")
      .replace(domainSlugSeparatorPattern, "-")
      .replace(domainSlugTrimPattern, "")
      .slice(0, 48) || "vibe-wp"
  );
}
