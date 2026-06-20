import type { InstallerState } from "./types";

const domainPattern = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const siteSlugPattern = /^[a-z0-9][a-z0-9-]{1,48}$/;
const wholeNumberPattern = /^\d+$/;
const blockedDomainSuffixes = [".example.com", ".example.net", ".example.org", ".localhost"];
const blockedDomains = new Set([
  "example.com",
  "example.net",
  "example.org",
  "localhost",
  "test.test"
]);

export function validateDomain(domain: string): string | null {
  const normalized = domain.trim().toLowerCase();
  if (!normalized) {
    return "Domain is required.";
  }
  if (normalized.includes("://")) {
    return "Enter only the domain, without https://.";
  }
  if (normalized.length > 253) {
    return "Domain is too long.";
  }
  if (
    blockedDomains.has(normalized) ||
    blockedDomainSuffixes.some((suffix) => normalized.endsWith(suffix)) ||
    normalized.endsWith(".test") ||
    normalized.endsWith(".invalid")
  ) {
    return "Use a real domain with DNS pointing to this VPS.";
  }
  if (!domainPattern.test(normalized)) {
    return "Domain contains unsupported characters.";
  }
  if (!normalized.includes(".")) {
    return "Domain must include a dot, for example example.com.";
  }
  for (const label of normalized.split(".")) {
    if (label.length < 1 || label.length > 63) {
      return "Each domain part must be 1-63 characters.";
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return "Domain parts cannot start or end with a dash.";
    }
  }
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email.trim()) {
    return "Email is required.";
  }
  if (!emailPattern.test(email.trim())) {
    return "Email does not look valid.";
  }
  if (email.trim().toLowerCase().endsWith("@example.com")) {
    return "Use a real mailbox, not example.com.";
  }
  return null;
}

export function validateState(state: InstallerState): string[] {
  if (state.mode === "manage-existing" || state.mode === "remove-existing") {
    return validateExistingMode(state);
  }

  if (state.mode === "external-services") {
    return [
      ...validateSiteIdentity(state),
      ...validatePorts(state),
      ...validateExternalServices(state),
      ...validateBackup(state)
    ];
  }

  return [...validateSiteIdentity(state), ...validatePorts(state), ...validateBackup(state)];
}

function validateBackup(state: InstallerState): string[] {
  const errors: string[] = [];
  if (state.backupPolicy === "manual") {
    return errors;
  }
  if (!state.backupDir.trim().startsWith("/")) {
    errors.push("Backup folder must be an absolute path, for example /var/backups/vibe-wp.");
  }
  if (state.backupRetention.trim() && !wholeNumberPattern.test(state.backupRetention.trim())) {
    errors.push("Backup retention must be a whole number of backups to keep.");
  }
  if (state.backupPolicy === "external-later") {
    if (!state.r2AccountId.trim()) {
      errors.push("Cloudflare R2 account ID is required for off-server backups.");
    }
    if (!state.r2AccessKeyId.trim()) {
      errors.push("Cloudflare R2 access key ID is required.");
    }
    if (!state.r2SecretKey.trim()) {
      errors.push("Cloudflare R2 secret access key is required.");
    }
    if (!state.r2Bucket.trim()) {
      errors.push("Cloudflare R2 bucket name is required.");
    }
  }
  return errors;
}

function validateExternalServices(state: InstallerState): string[] {
  const errors: string[] = [];
  if (!state.extDbHost.trim()) {
    errors.push("External database host is required, for example db.example.com:3306.");
  }
  if (!state.extDbName.trim()) {
    errors.push("External database name is required.");
  }
  if (!state.extDbUser.trim()) {
    errors.push("External database user is required.");
  }
  if (state.extDbPassword.length < 1) {
    errors.push("External database password is required.");
  }
  if (!state.extRedisHost.trim()) {
    errors.push("External Redis host is required.");
  }
  const redisPort = Number(state.extRedisPort);
  if (!Number.isInteger(redisPort) || redisPort < 1 || redisPort > 65_535) {
    errors.push("External Redis port must be between 1 and 65535.");
  }
  return errors;
}

function validateExistingMode(state: InstallerState): string[] {
  const errors: string[] = [];
  if (!state.selectedSiteDir) {
    errors.push("Select an existing Vibe WP installation first.");
  }
  if (state.selectedSiteDir && !state.selectedSiteDir.startsWith("/")) {
    errors.push("Selected site directory must be an absolute path.");
  }
  return errors;
}

function validateSiteIdentity(state: InstallerState): string[] {
  const errors: string[] = [];
  const productionDomainError = validateDomain(state.productionDomain);
  if (productionDomainError) {
    errors.push(`Production domain: ${productionDomainError}`);
  }

  if (state.stagingEnabled) {
    const stagingError = validateDomain(state.stagingDomain);
    if (stagingError) {
      errors.push(`Staging domain: ${stagingError}`);
    }
    if (state.stagingDomain.trim().toLowerCase() === state.productionDomain.trim().toLowerCase()) {
      errors.push("Staging domain must be different from production.");
    }
  }

  const emailError = validateEmail(state.adminEmail);
  if (emailError) {
    errors.push(`Admin email: ${emailError}`);
  }

  if (state.adminPassword.length < 16) {
    errors.push("Admin password must be at least 16 characters.");
  }
  if (!state.installDir.startsWith("/")) {
    errors.push("Install directory must be an absolute path.");
  }
  if (!siteSlugPattern.test(state.siteSlug)) {
    errors.push("Site slug must use lowercase letters, numbers, and dashes.");
  }
  return errors;
}

function validatePorts(state: InstallerState): string[] {
  const errors: string[] = [];
  for (const [label, port] of [
    ["Production HTTP port", state.productionHttpPort],
    ["Staging HTTP port", state.stagingHttpPort]
  ] as const) {
    const parsed = Number(port);
    if (!Number.isInteger(parsed) || parsed < 1024 || parsed > 65_535) {
      errors.push(`${label} must be a TCP port between 1024 and 65535.`);
    }
  }
  if (state.stagingEnabled && state.productionHttpPort === state.stagingHttpPort) {
    errors.push("Production and staging HTTP ports must be different.");
  }
  return errors;
}
