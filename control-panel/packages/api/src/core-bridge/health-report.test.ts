import { describe, expect, it } from "vitest";

import {
	buildHealthReport,
	healthAlertChannels,
	healthTiles,
} from "./health-report";

describe("health report builder", () => {
	it("returns a pending report when no monitor sample exists", () => {
		const report = buildHealthReport(null, ["Email"]);
		expect(report.uptimePercent).toBe(0);
		expect(report.alertChannels).toEqual(["Email"]);
		expect(report.tiles[0]).toMatchObject({
			key: "monitoring-sample",
			value: "Pending",
			verdict: "watch",
		});
	});

	it("builds tiles from the latest persisted sample", () => {
		const tiles = healthTiles({
			id: "sample-1",
			siteId: "site-1",
			ts: new Date("2026-06-26T12:00:00.000Z"),
			status: "ok",
			up: 1,
			httpStatus: 200,
			certDaysLeft: 45,
			dnsOk: 1,
			failures: 0,
			warnings: 0,
			checksJson: null,
		});
		expect(tiles.map((tile) => tile.key)).toEqual([
			"monitoring-status",
			"http",
			"tls",
			"dns",
		]);
		expect(tiles[1]).toMatchObject({
			key: "http",
			value: "HTTP 200",
			verdict: "good",
		});
	});

	it("derives configured alert channels without exposing secrets", () => {
		expect(
			healthAlertChannels({
				email: "ops@example.com",
				telegramToken: "secret",
				telegramChatId: "123",
				webhookUrl: "https://example.test/hook",
			})
		).toEqual(["Telegram", "Webhook", "Email"]);
	});
});
