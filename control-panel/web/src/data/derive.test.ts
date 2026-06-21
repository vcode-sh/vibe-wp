import { describe, expect, it } from "vitest";

import { overallVerdict, relativeTime, verdictTone } from "./derive";
import type { MetricTile } from "./types";

const tile = (verdict: MetricTile["verdict"]): MetricTile => ({
	key: "k",
	label: "L",
	verdict,
	value: "v",
	detail: "d",
	help: "h",
});

describe("relativeTime", () => {
	const now = new Date("2026-06-21T12:00:00Z");
	it("formats minutes", () => {
		expect(relativeTime("2026-06-21T11:30:00Z", now)).toBe("30m ago");
	});
	it("formats hours", () => {
		expect(relativeTime("2026-06-21T10:00:00Z", now)).toBe("2h ago");
	});
	it("formats yesterday", () => {
		expect(relativeTime("2026-06-20T12:00:00Z", now)).toBe("Yesterday");
	});
	it("formats days", () => {
		expect(relativeTime("2026-06-18T12:00:00Z", now)).toBe("3 days ago");
	});
	it("clamps the future to just now", () => {
		expect(relativeTime("2026-06-21T12:00:30Z", now)).toBe("just now");
	});
	it("returns never for empty string", () => {
		expect(relativeTime("", now)).toBe("never");
	});
	it("returns never for epoch / zero timestamp", () => {
		expect(relativeTime(new Date(0).toISOString(), now)).toBe("never");
	});
});

describe("overallVerdict", () => {
	it("returns the worst tile verdict", () => {
		expect(overallVerdict([tile("good"), tile("watch"), tile("good")])).toBe(
			"watch"
		);
		expect(overallVerdict([tile("good"), tile("act")])).toBe("act");
		expect(overallVerdict([tile("good"), tile("good")])).toBe("good");
	});
	it("treats an empty list as good", () => {
		expect(overallVerdict([])).toBe("good");
	});
});

describe("verdictTone", () => {
	it("maps each verdict to token classes", () => {
		expect(verdictTone("good").text).toBe("text-success");
		expect(verdictTone("watch").text).toBe("text-warning");
		expect(verdictTone("act").text).toBe("text-destructive");
	});
});
