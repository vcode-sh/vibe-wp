import { describe, expect, it } from "vitest";
import { describeSession } from "./sessions";

describe("describeSession", () => {
	it("extracts a browser + OS hint", () => {
		const d = describeSession({
			userAgent:
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
			ipAddress: "1.2.3.4",
		});
		expect(d.device).toContain("Chrome");
		expect(d.device).toContain("macOS");
		expect(d.detail).toContain("1.2.3.4");
	});
	it("falls back when user-agent is missing", () => {
		expect(describeSession({ userAgent: null, ipAddress: null }).device).toBe(
			"Unknown device"
		);
	});
});
