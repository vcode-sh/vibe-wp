import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Stores monitor alert channel config per site (or the shared global row).
 * The literal siteId "__global__" holds shared default channels.
 * All channel + preference columns are nullable — absent = inherit from global.
 *
 * These map onto the VIBE_MONITOR_* env keys that bin/monitor reads, so the
 * unattended cron health monitor delivers alerts through the configured
 * channels (Telegram / webhook / email).
 */
export const notifyConfig = sqliteTable("notify_config", {
	siteId: text("site_id").primaryKey(),
	/** Write-only: never returned by the API. */
	telegramToken: text("telegram_token"),
	telegramChatId: text("telegram_chat_id"),
	webhookUrl: text("webhook_url"),
	email: text("email"),
	/** 1 = alert on warnings too, 0 = failures only, null = inherit/default. */
	alertOnWarn: integer("alert_on_warn"),
	/** 1 = enabled, 0 = disabled, null = inherit from global. */
	enabled: integer("enabled"),
});
