import { describe, expect, it } from "vitest";

import type { NotifyConfigRow } from "./notify-config-pure";
import { mergeNotifyConfig, toEnv } from "./notify-config-pure";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function row(overrides: Partial<NotifyConfigRow> = {}): NotifyConfigRow {
	return {
		siteId: "__global__",
		telegramToken: null,
		telegramChatId: null,
		webhookUrl: null,
		email: null,
		alertOnWarn: null,
		enabled: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// mergeNotifyConfig
// ---------------------------------------------------------------------------

describe("mergeNotifyConfig", () => {
	it("site values override global", () => {
		const global = row({ telegramChatId: "global-chat", email: "g@x.com" });
		const site = row({ siteId: "s1", telegramChatId: "site-chat" });
		const cfg = mergeNotifyConfig(global, site);
		expect(cfg.telegramChatId).toBe("site-chat");
		expect(cfg.email).toBe("g@x.com");
	});

	it("falls back to global when site field is null", () => {
		const global = row({ telegramToken: "TOK", webhookUrl: "https://hook" });
		const site = row({ siteId: "s1" });
		const cfg = mergeNotifyConfig(global, site);
		expect(cfg.telegramToken).toBe("TOK");
		expect(cfg.webhookUrl).toBe("https://hook");
	});

	it("enabled comes only from site row", () => {
		const global = row({ enabled: 1 });
		const site = row({ siteId: "s1", enabled: 0 });
		const cfg = mergeNotifyConfig(global, site);
		expect(cfg.enabled).toBe(0);
	});

	it("enabled is null when site row has no enabled", () => {
		const global = row({ enabled: 1 });
		const site = row({ siteId: "s1" });
		const cfg = mergeNotifyConfig(global, site);
		expect(cfg.enabled).toBeNull();
	});

	it("alertOnWarn inherits from global when site is null", () => {
		const global = row({ alertOnWarn: 1 });
		const cfg = mergeNotifyConfig(global, row({ siteId: "s1" }));
		expect(cfg.alertOnWarn).toBe(1);
	});

	it("nulls on both rows → all effective fields null", () => {
		const cfg = mergeNotifyConfig(null, null);
		expect(cfg.telegramToken).toBeNull();
		expect(cfg.telegramChatId).toBeNull();
		expect(cfg.webhookUrl).toBeNull();
		expect(cfg.email).toBeNull();
		expect(cfg.alertOnWarn).toBeNull();
		expect(cfg.enabled).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// toEnv
// ---------------------------------------------------------------------------

describe("toEnv", () => {
	const fullCfg = {
		telegramToken: "TOK",
		telegramChatId: "123456789",
		webhookUrl: "https://hook.example.com",
		email: "ops@example.com",
		alertOnWarn: 1 as number | null,
		enabled: 1 as number | null,
	};

	it("maps all channel fields when fully configured", () => {
		const env = toEnv(fullCfg);
		expect(env.VIBE_MONITOR_TELEGRAM_TOKEN).toBe("TOK");
		expect(env.VIBE_MONITOR_TELEGRAM_CHAT_ID).toBe("123456789");
		expect(env.VIBE_MONITOR_WEBHOOK_URL).toBe("https://hook.example.com");
		expect(env.VIBE_MONITOR_EMAIL_TO).toBe("ops@example.com");
		expect(env.VIBE_MONITOR_ALERT_ON_WARN).toBe("1");
	});

	it("omits unset channel keys", () => {
		const env = toEnv({ ...fullCfg, telegramToken: null, email: null });
		expect(env.VIBE_MONITOR_TELEGRAM_TOKEN).toBeUndefined();
		expect(env.VIBE_MONITOR_EMAIL_TO).toBeUndefined();
		expect(env.VIBE_MONITOR_TELEGRAM_CHAT_ID).toBe("123456789");
	});

	it("alertOnWarn maps to '0' when not 1", () => {
		expect(
			toEnv({ ...fullCfg, alertOnWarn: 0 }).VIBE_MONITOR_ALERT_ON_WARN
		).toBe("0");
		expect(
			toEnv({ ...fullCfg, alertOnWarn: null }).VIBE_MONITOR_ALERT_ON_WARN
		).toBe("0");
	});

	it("always emits the alert-on-warn flag even with no channels", () => {
		const env = toEnv({
			telegramToken: null,
			telegramChatId: null,
			webhookUrl: null,
			email: null,
			alertOnWarn: null,
			enabled: null,
		});
		expect(env).toEqual({ VIBE_MONITOR_ALERT_ON_WARN: "0" });
	});
});
