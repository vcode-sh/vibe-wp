/**
 * Pure (DB-free) helpers for monitor alert channel config.
 * Imported by both notify-config.ts (DB layer) and tests.
 */

export const GLOBAL_SITE_ID = "__global__";

/** Shape matching the Drizzle notifyConfig table row. */
export interface NotifyConfigRow {
	alertOnWarn: number | null;
	email: string | null;
	siteId: string;
	telegramChatId: string | null;
	telegramToken: string | null;
	webhookUrl: string | null;
}

/** Effective (resolved) notify config — all nullable fields inherited. */
export interface EffectiveNotifyConfig {
	alertOnWarn: number | null;
	email: string | null;
	telegramChatId: string | null;
	telegramToken: string | null;
	webhookUrl: string | null;
}

/**
 * Merges a global row and a site-specific row into effective config.
 * For every channel field: the site value takes precedence over global.
 * The presence of any channel is the de-facto enable — there is no separate
 * master enable switch (bin/monitor has none).
 */
export function mergeNotifyConfig(
	global: NotifyConfigRow | null,
	site: NotifyConfigRow | null
): EffectiveNotifyConfig {
	const g = global ?? ({} as Partial<NotifyConfigRow>);
	const s = site ?? ({} as Partial<NotifyConfigRow>);

	return {
		telegramToken: s.telegramToken ?? g.telegramToken ?? null,
		telegramChatId: s.telegramChatId ?? g.telegramChatId ?? null,
		webhookUrl: s.webhookUrl ?? g.webhookUrl ?? null,
		email: s.email ?? g.email ?? null,
		alertOnWarn: s.alertOnWarn ?? g.alertOnWarn ?? null,
	};
}

/**
 * Maps an effective config to the VIBE_MONITOR_* environment variables that
 * bin/monitor reads. Only keys with a set value are included; alertOnWarn is
 * always emitted as "1"/"0" so the cron monitor has an authoritative flag.
 */
export function toEnv(cfg: EffectiveNotifyConfig): Record<string, string> {
	const env: Record<string, string> = {};

	if (cfg.telegramToken) {
		env.VIBE_MONITOR_TELEGRAM_TOKEN = cfg.telegramToken;
	}
	if (cfg.telegramChatId) {
		env.VIBE_MONITOR_TELEGRAM_CHAT_ID = cfg.telegramChatId;
	}
	if (cfg.webhookUrl) {
		env.VIBE_MONITOR_WEBHOOK_URL = cfg.webhookUrl;
	}
	if (cfg.email) {
		env.VIBE_MONITOR_EMAIL_TO = cfg.email;
	}
	env.VIBE_MONITOR_ALERT_ON_WARN = cfg.alertOnWarn === 1 ? "1" : "0";

	return env;
}
