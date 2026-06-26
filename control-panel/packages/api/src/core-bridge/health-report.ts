import type { HealthReport, MetricTile, Verdict } from "../contract";
import type { MonitorSampleRow } from "./monitor-history";

export interface NotifyChannelConfig {
	email?: string | null;
	telegramChatId?: string | null;
	telegramToken?: string | null;
	webhookUrl?: string | null;
}

const tile = (
	key: string,
	label: string,
	verdict: Verdict,
	value: string,
	detail: string,
	help = "From the latest persisted monitor sample."
): MetricTile => ({
	key,
	label,
	verdict,
	value,
	detail,
	help,
});

function statusVerdict(row: MonitorSampleRow): Verdict {
	if (row.status === "ok") {
		return "good";
	}
	return row.status === "warn" ? "watch" : "act";
}

function certVerdict(days: number | null): Verdict {
	if (days === null) {
		return "watch";
	}
	return days >= 14 ? "good" : "act";
}

function httpValue(row: MonitorSampleRow): string {
	if (row.httpStatus) {
		return `HTTP ${row.httpStatus}`;
	}
	return row.up ? "Reachable" : "Down";
}

function dnsVerdict(dnsOk: number | null): Verdict {
	if (dnsOk === 0) {
		return "act";
	}
	if (dnsOk === 1) {
		return "good";
	}
	return "watch";
}

function dnsValue(dnsOk: number | null): string {
	if (dnsOk === null) {
		return "Unknown";
	}
	return dnsOk ? "OK" : "Check";
}

export function healthAlertChannels(config: NotifyChannelConfig): string[] {
	const channels: string[] = [];
	if (config.telegramToken && config.telegramChatId) {
		channels.push("Telegram");
	}
	if (config.webhookUrl) {
		channels.push("Webhook");
	}
	if (config.email) {
		channels.push("Email");
	}
	return channels;
}

export function healthTiles(row: MonitorSampleRow | null): MetricTile[] {
	if (!row) {
		return [
			tile(
				"monitoring-sample",
				"Monitoring",
				"watch",
				"Pending",
				"No monitoring sample has been recorded yet.",
				"The background recorder writes health samples to SQLite."
			),
		];
	}
	return [
		tile(
			"monitoring-status",
			"Status",
			statusVerdict(row),
			row.status,
			`${row.failures} failure(s), ${row.warnings} warning(s)`
		),
		tile(
			"http",
			"HTTP",
			row.up ? "good" : "act",
			httpValue(row),
			`Last checked ${row.ts.toISOString()}`
		),
		tile(
			"tls",
			"TLS",
			certVerdict(row.certDaysLeft),
			row.certDaysLeft === null ? "Unknown" : `${row.certDaysLeft}d`,
			"Certificate freshness from the latest monitor sample."
		),
		tile(
			"dns",
			"DNS",
			dnsVerdict(row.dnsOk),
			dnsValue(row.dnsOk),
			"Approximate DNS state derived from the HTTP probe."
		),
	];
}

export function buildHealthReport(
	sample: MonitorSampleRow | null,
	alertChannels: string[]
): HealthReport {
	return {
		tiles: healthTiles(sample),
		uptimePercent: sample?.up ? 100 : 0,
		alertChannels,
	};
}
