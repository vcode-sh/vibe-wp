import { describe, expect, it } from "vitest";

import {
	certLabel,
	certTier,
	dnsTier,
	statusTier,
	tierTextClass,
	uptimeTier,
	worstTier,
} from "./tiers";

describe("certTier", () => {
	it("returns none when not measured", () => {
		expect(certTier(null)).toBe("none");
	});

	it("alerts when expired or within 3 days", () => {
		expect(certTier(-1)).toBe("alert");
		expect(certTier(0)).toBe("alert");
		expect(certTier(2)).toBe("alert");
	});

	it("warns between 3 and 14 days", () => {
		expect(certTier(3)).toBe("warn");
		expect(certTier(7)).toBe("warn");
		expect(certTier(13)).toBe("warn");
	});

	it("is ok at or above 14 days", () => {
		expect(certTier(14)).toBe("ok");
		expect(certTier(90)).toBe("ok");
	});
});

describe("certLabel", () => {
	it("formats the not-measured, expired, expiring and valid cases", () => {
		expect(certLabel(null)).toBe("Not measured");
		expect(certLabel(-1)).toBe("Expired 1 day ago");
		expect(certLabel(-5)).toBe("Expired 5 days ago");
		expect(certLabel(1)).toBe("Expires in 1 day");
		expect(certLabel(9)).toBe("Expires in 9 days");
		expect(certLabel(42)).toBe("Valid 42 days");
	});
});

describe("uptimeTier", () => {
	it("maps none/ok/warn/alert by percentage", () => {
		expect(uptimeTier(null)).toBe("none");
		expect(uptimeTier(100)).toBe("ok");
		expect(uptimeTier(99.9)).toBe("warn");
		expect(uptimeTier(95)).toBe("warn");
		expect(uptimeTier(94.9)).toBe("alert");
		expect(uptimeTier(0)).toBe("alert");
	});
});

describe("dnsTier", () => {
	it("maps the approximate dnsOk flag", () => {
		expect(dnsTier(null)).toBe("none");
		expect(dnsTier(1)).toBe("ok");
		expect(dnsTier(0)).toBe("alert");
	});
});

describe("statusTier", () => {
	it("maps the monitor verdict to a tier", () => {
		expect(statusTier("ok")).toBe("ok");
		expect(statusTier("warn")).toBe("warn");
		expect(statusTier("fail")).toBe("alert");
		expect(statusTier("unknown")).toBe("none");
	});
});

describe("tierTextClass", () => {
	it("returns semantic token classes only", () => {
		expect(tierTextClass("ok")).toBe("text-success");
		expect(tierTextClass("warn")).toBe("text-warning");
		expect(tierTextClass("alert")).toBe("text-destructive");
		expect(tierTextClass("none")).toBe("text-muted-foreground");
	});
});

describe("worstTier", () => {
	it("ranks alert > warn > ok > none", () => {
		expect(worstTier(["ok", "warn", "alert"])).toBe("alert");
		expect(worstTier(["ok", "warn", "none"])).toBe("warn");
		expect(worstTier(["ok", "none"])).toBe("ok");
		expect(worstTier(["none", "none"])).toBe("none");
		expect(worstTier([])).toBe("none");
	});
});
