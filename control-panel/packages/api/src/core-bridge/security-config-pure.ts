import { z } from "zod";

export interface SecurityConfig {
	autoUpdates: boolean;
	fail2ban: {
		banTime: string;
		enabled: boolean;
		findTime: string;
		maxRetry: number;
	};
	firewall: { enabled: boolean };
}

export interface SecurityConfigPatch {
	banTime?: string;
	fail2banEnabled?: boolean;
	findTime?: string;
	firewallEnabled?: boolean;
	maxRetry?: number;
}

const duration = z.string().regex(/^[1-9][0-9]*[smhd]$/);
const configSchema = z.object({
	autoUpdates: z.boolean(),
	fail2ban: z.object({
		enabled: z.boolean(),
		maxRetry: z.number().int().min(1).max(10),
		findTime: duration,
		banTime: duration,
	}),
	firewall: z.object({ enabled: z.boolean() }),
});

export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
	autoUpdates: false,
	fail2ban: {
		enabled: false,
		maxRetry: 5,
		findTime: "10m",
		banTime: "1h",
	},
	firewall: { enabled: false },
};

function boundedRetry(value: number | undefined): number {
	if (!Number.isFinite(value ?? Number.NaN)) {
		return DEFAULT_SECURITY_CONFIG.fail2ban.maxRetry;
	}
	return Math.min(10, Math.max(1, Math.trunc(value ?? 5)));
}

function validDuration(value: string | undefined, fallback: string): string {
	return duration.safeParse(value).success ? (value as string) : fallback;
}

export function parseSecurityConfig(stdout: string): SecurityConfig {
	try {
		return configSchema.parse(JSON.parse(stdout.trim()));
	} catch {
		return DEFAULT_SECURITY_CONFIG;
	}
}

export function securityConfigToEnv(
	patch: SecurityConfigPatch
): Record<string, string> {
	const defaults = DEFAULT_SECURITY_CONFIG.fail2ban;
	return {
		VIBE_SECURITY_FIREWALL: patch.firewallEnabled === false ? "off" : "on",
		VIBE_SECURITY_FAIL2BAN: patch.fail2banEnabled === false ? "off" : "on",
		VIBE_FAIL2BAN_MAX_RETRY: String(boundedRetry(patch.maxRetry)),
		VIBE_FAIL2BAN_FIND_TIME: validDuration(patch.findTime, defaults.findTime),
		VIBE_FAIL2BAN_BAN_TIME: validDuration(patch.banTime, defaults.banTime),
	};
}
