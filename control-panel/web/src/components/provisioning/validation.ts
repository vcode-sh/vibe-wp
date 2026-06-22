import type { ProvisionMode, WizardForm } from "./wizard-types";

/**
 * Lightweight client-side validation mirroring the KEY rules from the server
 * (packages/api/src/core-bridge/provision-input.ts) for inline UX only. The
 * server remains the source of truth and rejects anything we miss — those
 * errors surface via toast.
 */

const domainPattern = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const digitsPattern = /^\d+$/;
const blockedDomains = new Set([
	"example.com",
	"example.net",
	"example.org",
	"localhost",
	"test.test",
]);

export function validateDomain(value: string): string | null {
	const normalized = value.trim().toLowerCase();
	if (!normalized) {
		return "Domain is required.";
	}
	if (normalized.includes("://")) {
		return "Enter only the domain, without https://.";
	}
	if (
		blockedDomains.has(normalized) ||
		normalized.endsWith(".example.com") ||
		normalized.endsWith(".test") ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".invalid")
	) {
		return "Use a real domain with DNS pointing to this VPS.";
	}
	if (!normalized.includes(".")) {
		return "Domain must include a dot, for example example.com.";
	}
	if (!domainPattern.test(normalized)) {
		return "Domain contains unsupported characters.";
	}
	return null;
}

export function validateEmail(value: string): string | null {
	const v = value.trim();
	if (!v) {
		return "Admin email is required.";
	}
	if (!emailPattern.test(v)) {
		return "Email does not look valid.";
	}
	if (v.toLowerCase().endsWith("@example.com")) {
		return "Use a real mailbox, not example.com.";
	}
	return null;
}

function validatePort(value: string): string | null {
	const v = value.trim();
	if (!digitsPattern.test(v)) {
		return "Port must be a number.";
	}
	const n = Number(v);
	if (!Number.isInteger(n) || n < 1024 || n > 65_535) {
		return "Port must be between 1024 and 65535.";
	}
	return null;
}

export type Errors = Partial<Record<keyof WizardForm, string>>;

/** Validate the basics step (domain + admin email; title is optional). */
export function validateBasics(form: WizardForm): Errors {
	const errors: Errors = {};
	const domain = validateDomain(form.domain);
	if (domain) {
		errors.domain = domain;
	}
	const email = validateEmail(form.adminEmail);
	if (email) {
		errors.adminEmail = email;
	}
	if (form.siteTitle.trim().length > 120) {
		errors.siteTitle = "Site title is too long.";
	}
	return errors;
}

/** Validate the options step (only staging needs cross-field checks). */
export function validateOptions(form: WizardForm): Errors {
	const errors: Errors = {};
	if (!form.stagingEnabled) {
		return errors;
	}
	const staging = validateDomain(form.stagingDomain);
	if (staging) {
		errors.stagingDomain = staging;
	} else if (
		form.stagingDomain.trim().toLowerCase() === form.domain.trim().toLowerCase()
	) {
		errors.stagingDomain = "Staging domain must differ from production.";
	}
	return errors;
}

/** Validate the external DB/Redis step (required hosts/creds + port). */
export function validateExternal(form: WizardForm): Errors {
	const errors: Errors = {};
	if (!form.extDbHost.trim()) {
		errors.extDbHost = "Database host is required.";
	}
	if (!form.extDbName.trim()) {
		errors.extDbName = "Database name is required.";
	}
	if (!form.extDbUser.trim()) {
		errors.extDbUser = "Database user is required.";
	}
	if (!form.extDbPassword) {
		errors.extDbPassword = "Database password is required.";
	}
	if (!form.extRedisHost.trim()) {
		errors.extRedisHost = "Redis host is required.";
	}
	const port = validatePort(form.extRedisPort);
	if (port) {
		errors.extRedisPort = port;
	}
	return errors;
}

export function validateStep(
	step: "basics" | "options" | "external",
	form: WizardForm
): Errors {
	if (step === "basics") {
		return validateBasics(form);
	}
	if (step === "options") {
		return validateOptions(form);
	}
	return validateExternal(form);
}

/** Whole-form validity used to enable the final Create button. */
export function isFormValid(form: WizardForm, mode: ProvisionMode): boolean {
	const checks = [validateBasics(form), validateOptions(form)];
	if (mode === "external") {
		checks.push(validateExternal(form));
	}
	return checks.every((e) => Object.keys(e).length === 0);
}
