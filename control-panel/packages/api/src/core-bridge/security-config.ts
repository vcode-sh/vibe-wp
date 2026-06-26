import { runVibe } from "./exec";
import {
	parseSecurityConfig,
	type SecurityConfig,
	type SecurityConfigPatch,
	securityConfigToEnv,
} from "./security-config-pure";

export async function getSecurityConfig(
	hostDir: string
): Promise<SecurityConfig> {
	const result = await runVibe(hostDir, "prod", "securityConfigGet", {
		timeoutMs: 10_000,
	});
	return parseSecurityConfig(result.stdout);
}

export async function applySecurityConfig(
	hostDir: string,
	patch: SecurityConfigPatch
): Promise<SecurityConfig> {
	const result = await runVibe(hostDir, "prod", "securityConfigApply", {
		env: securityConfigToEnv(patch),
		timeoutMs: 120_000,
	});
	if (result.code !== 0) {
		throw new Error(
			`security-config apply failed (exit ${result.code}): ${result.stderr.trim()}`
		);
	}
	return parseSecurityConfig(result.stdout);
}
