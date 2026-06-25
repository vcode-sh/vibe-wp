import { z } from "zod";

/**
 * Zod input schemas for the provisioning router. These MIRROR the installer's
 * own rules (installer/src/core/validation.ts) so the panel rejects bad input
 * before spawning anything; the bridge then runs the installer's validateState
 * as the first step (defense in depth). Keep the two in sync.
 */

const domainPattern = /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/;
const blockedDomainSuffixes = [
	".example.com",
	".example.net",
	".example.org",
	".localhost",
];
const blockedDomains = new Set([
	"example.com",
	"example.net",
	"example.org",
	"localhost",
	"test.test",
]);

/** Mirrors installer validateDomain — returns null when valid, else a message. */
export function validateDomainValue(domain: string): string | null {
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

const domainSchema = z.string().refine((v) => validateDomainValue(v) === null, {
	message: "Enter a real domain with DNS pointing to this VPS.",
});

const adminEmailSchema = z
	.string()
	.trim()
	.email("Email does not look valid.")
	.refine((v) => !v.toLowerCase().endsWith("@example.com"), {
		message: "Use a real mailbox, not example.com.",
	});

const portSchema = z
	.string()
	.regex(/^\d+$/, "Port must be a number.")
	.refine(
		(v) => {
			const n = Number(v);
			return Number.isInteger(n) && n >= 1024 && n <= 65_535;
		},
		{ message: "Port must be a TCP port between 1024 and 65535." }
	);

export const performancePresetSchema = z.enum([
	"conservative",
	"balanced",
	"high-memory",
]);
export const backupScheduleSchema = z.enum(["off", "daily", "weekly"]);

/** Base new-site fields shared by createSite + createExternal. */
const createSiteBase = z.object({
	adminEmail: adminEmailSchema,
	backupSchedule: backupScheduleSchema.optional(),
	domain: domainSchema,
	monitorEnabled: z.boolean().optional(),
	performancePreset: performancePresetSchema.optional(),
	siteTitle: z.string().trim().min(1).max(120).optional(),
	stagingDomain: domainSchema.optional(),
	stagingEnabled: z.boolean(),
});

interface StagingFields {
	domain: string;
	stagingDomain?: string;
	stagingEnabled: boolean;
}

/** Staging domain, when enabled, must be present and differ from production. */
function checkStaging(value: StagingFields, ctx: z.RefinementCtx): void {
	if (!value.stagingEnabled) {
		return;
	}
	if (!value.stagingDomain) {
		ctx.addIssue({
			code: "custom",
			message: "Staging domain is required when staging is enabled.",
			path: ["stagingDomain"],
		});
		return;
	}
	if (
		value.stagingDomain.trim().toLowerCase() ===
		value.domain.trim().toLowerCase()
	) {
		ctx.addIssue({
			code: "custom",
			message: "Staging domain must be different from production.",
			path: ["stagingDomain"],
		});
	}
}

export const createSiteSchema = createSiteBase.superRefine(checkStaging);

const createExternalBase = createSiteBase.extend({
	extDbHost: z.string().trim().min(1, "External database host is required."),
	extDbName: z.string().trim().min(1, "External database name is required."),
	extDbPassword: z.string().min(1, "External database password is required."),
	extDbUser: z.string().trim().min(1, "External database user is required."),
	extRedisHost: z.string().trim().min(1, "External Redis host is required."),
	extRedisPassword: z.string(),
	extRedisPort: portSchema,
});

export const createExternalSchema =
	createExternalBase.superRefine(checkStaging);

export const attachStagingSchema = z
	.object({ siteId: z.string().min(1), stagingDomain: domainSchema })
	.refine((v) => v.stagingDomain.trim().length > 0, {
		message: "Staging domain is required.",
		path: ["stagingDomain"],
	});

export const removeSiteSchema = z.object({
	purge: z.boolean(),
	siteId: z.string().min(1),
});

// Creating a site on the SHARED database takes the SAME inputs as a normal new
// site — the panel provisions the per-site `vibe_<slug>` DB+user on the shared
// server itself, so the operator supplies NO external DB credentials.
export const createSharedDbSchema = createSiteSchema;

export type CreateSiteSchema = z.infer<typeof createSiteSchema>;
export type CreateExternalSchema = z.infer<typeof createExternalSchema>;
export type AttachStagingSchema = z.infer<typeof attachStagingSchema>;
export type RemoveSiteSchema = z.infer<typeof removeSiteSchema>;
