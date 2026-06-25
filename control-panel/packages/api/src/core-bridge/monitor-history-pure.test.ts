import { describe, expect, it } from "vitest";

import {
	deriveCertDaysLeft,
	deriveDnsOk,
	deriveHttpStatus,
	deriveUp,
	extractSampleFields,
	type MonitorParsed,
	sinceCutoffMs,
	uptimePercentOver,
} from "./monitor-history-pure";

function parsed(over: Partial<MonitorParsed> = {}): MonitorParsed {
	return {
		status: "ok",
		failures: 0,
		warnings: 0,
		uptimePercent: 100,
		checks: [],
		...over,
	};
}

describe("deriveUp", () => {
	it("is 1 when uptimePercent is 100", () => {
		expect(deriveUp(parsed({ uptimePercent: 100 }))).toBe(1);
	});

	it("is 0 when uptimePercent is 0", () => {
		expect(deriveUp(parsed({ uptimePercent: 0 }))).toBe(0);
	});

	it("falls back to the HTTP check when uptimePercent is unexpected", () => {
		expect(
			deriveUp(
				parsed({
					uptimePercent: 0,
					checks: [{ name: "HTTP uptime: https://x returned 200", ok: true }],
				})
			)
		).toBe(1);
	});
});

describe("deriveHttpStatus (name-string fallback)", () => {
	it("parses the 3-digit code from the HTTP check name", () => {
		expect(
			deriveHttpStatus(
				parsed({
					checks: [
						{ name: "HTTP uptime: https://x.test/ returned 503", ok: false },
					],
				})
			)
		).toBe(503);
	});

	it("prefers a structured httpStatus field when present", () => {
		expect(deriveHttpStatus(parsed({ httpStatus: 200 }))).toBe(200);
	});

	it("returns null when there is no HTTP check", () => {
		expect(deriveHttpStatus(parsed())).toBeNull();
	});
});

describe("deriveCertDaysLeft (name-string fallback)", () => {
	it("parses 'valid for N day(s)' as positive", () => {
		expect(
			deriveCertDaysLeft(
				parsed({
					checks: [
						{ name: "TLS certificate: x.test valid for 42 day(s)", ok: true },
					],
				})
			)
		).toBe(42);
	});

	it("parses 'expires in N day(s)' as positive", () => {
		expect(
			deriveCertDaysLeft(
				parsed({
					checks: [
						{ name: "TLS certificate: x.test expires in 7 day(s)", ok: false },
					],
				})
			)
		).toBe(7);
	});

	it("parses 'expired N day(s) ago' as negative", () => {
		expect(
			deriveCertDaysLeft(
				parsed({
					checks: [
						{ name: "TLS certificate: x.test expired 3 day(s) ago", ok: false },
					],
				})
			)
		).toBe(-3);
	});

	it("prefers a structured certDaysLeft field when present", () => {
		expect(deriveCertDaysLeft(parsed({ certDaysLeft: 90 }))).toBe(90);
	});

	it("returns null for a skipped cert check", () => {
		expect(
			deriveCertDaysLeft(
				parsed({
					checks: [
						{
							name: "TLS certificate: no public domain to check (skipped)",
							ok: false,
						},
					],
				})
			)
		).toBeNull();
	});
});

describe("deriveDnsOk (approximate, derived from HTTP reachability)", () => {
	it("is 1 when the HTTP check passed", () => {
		expect(
			deriveDnsOk(
				parsed({
					checks: [{ name: "HTTP uptime: https://x returned 200", ok: true }],
				})
			)
		).toBe(1);
	});

	it("is 0 when the HTTP check failed", () => {
		expect(
			deriveDnsOk(
				parsed({
					checks: [{ name: "HTTP uptime: https://x returned 000", ok: false }],
				})
			)
		).toBe(0);
	});

	it("prefers a structured dnsOk field when present", () => {
		expect(deriveDnsOk(parsed({ dnsOk: true }))).toBe(1);
		expect(deriveDnsOk(parsed({ dnsOk: false }))).toBe(0);
	});

	it("is null when there is no HTTP signal", () => {
		expect(deriveDnsOk(parsed())).toBeNull();
	});
});

describe("extractSampleFields", () => {
	it("composes all derived fields from a realistic monitor result", () => {
		const fields = extractSampleFields(
			parsed({
				status: "warn",
				failures: 0,
				warnings: 1,
				uptimePercent: 100,
				checks: [
					{ name: "HTTP uptime: https://x.test/ returned 200", ok: true },
					{ name: "TLS certificate: x.test expires in 9 day(s)", ok: false },
				],
			})
		);
		expect(fields).toEqual({
			status: "warn",
			up: 1,
			httpStatus: 200,
			certDaysLeft: 9,
			dnsOk: 1,
			failures: 0,
			warnings: 1,
		});
	});
});

describe("sinceCutoffMs", () => {
	it("computes the cutoff for a clamped day window", () => {
		const now = 1_000_000_000_000;
		expect(sinceCutoffMs(1, now)).toBe(now - 86_400_000);
		expect(sinceCutoffMs(7, now)).toBe(now - 7 * 86_400_000);
	});

	it("clamps below 1 and above 90", () => {
		const now = 1_000_000_000_000;
		expect(sinceCutoffMs(0, now)).toBe(now - 86_400_000);
		expect(sinceCutoffMs(999, now)).toBe(now - 90 * 86_400_000);
	});
});

describe("uptimePercentOver", () => {
	it("is the fraction of reachable samples, one decimal", () => {
		expect(
			uptimePercentOver([{ up: 1 }, { up: 1 }, { up: 0 }, { up: 1 }])
		).toBe(75);
	});

	it("rounds to one decimal", () => {
		expect(uptimePercentOver([{ up: 1 }, { up: 1 }, { up: 0 }])).toBe(66.7);
	});

	it("is null for an empty set", () => {
		expect(uptimePercentOver([])).toBeNull();
	});
});
