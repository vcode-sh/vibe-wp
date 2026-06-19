import type { InstallerState } from "./types";

const domainPattern = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  return null;
}

export function validateState(state: InstallerState): string[] {
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
  return errors;
}
