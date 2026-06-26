import { describe, expect, it } from "vitest";

import {
	parseSecurityConfig,
	securityConfigToEnv,
} from "./security-config-pure";

describe("security config bridge", () => {
	it("parses host security config JSON with safe defaults", () => {
		expect(
			parseSecurityConfig(
				'{"firewall":{"enabled":true},"fail2ban":{"enabled":true,"maxRetry":4,"findTime":"10m","banTime":"1h"},"autoUpdates":true}'
			)
		).toEqual({
			firewall: { enabled: true },
			fail2ban: { enabled: true, maxRetry: 4, findTime: "10m", banTime: "1h" },
			autoUpdates: true,
		});
	});

	it("falls back to a conservative disabled shape on invalid output", () => {
		expect(parseSecurityConfig("not json")).toEqual({
			firewall: { enabled: false },
			fail2ban: { enabled: false, maxRetry: 5, findTime: "10m", banTime: "1h" },
			autoUpdates: false,
		});
	});

	it("maps admin input to root env with bounded retry count", () => {
		expect(
			securityConfigToEnv({
				firewallEnabled: true,
				fail2banEnabled: true,
				maxRetry: 99,
				findTime: "15m",
				banTime: "12h",
			})
		).toEqual({
			VIBE_SECURITY_FIREWALL: "on",
			VIBE_SECURITY_FAIL2BAN: "on",
			VIBE_FAIL2BAN_MAX_RETRY: "10",
			VIBE_FAIL2BAN_FIND_TIME: "15m",
			VIBE_FAIL2BAN_BAN_TIME: "12h",
		});
	});
});
