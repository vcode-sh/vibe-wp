import { describe, expect, it } from "vitest";

import { redact } from "../core-bridge/redact";
import { compareDnsResult } from "./preflight";

describe("compareDnsResult", () => {
	it("is ok when a resolved A record matches this VPS's IP", () => {
		const r = compareDnsResult("shop.io", ["203.0.113.10"], "203.0.113.10");
		expect(r.ok).toBe(true);
		expect(r.resolvedIp).toBe("203.0.113.10");
		expect(r.expectedIp).toBe("203.0.113.10");
		expect(r.message).toContain("points to this VPS");
	});

	it("matches ANY resolved A record (NAT / multi-A membership, not equality)", () => {
		const r = compareDnsResult(
			"shop.io",
			["198.51.100.7", "203.0.113.10"],
			"203.0.113.10"
		);
		expect(r.ok).toBe(true);
	});

	it("is not ok and names the target IP when DNS doesn't resolve at all", () => {
		const r = compareDnsResult("new.io", [], "203.0.113.10");
		expect(r.ok).toBe(false);
		expect(r.resolvedIp).toBeNull();
		expect(r.message).toContain("doesn't point here yet");
		expect(r.message).toContain("203.0.113.10");
	});

	it("is not ok and mentions CDN/proxy when DNS points elsewhere", () => {
		const r = compareDnsResult("proxied.io", ["104.21.5.5"], "203.0.113.10");
		expect(r.ok).toBe(false);
		expect(r.resolvedIp).toBe("104.21.5.5");
		expect(r.message).toContain("203.0.113.10");
		expect(r.message.toLowerCase()).toContain("cdn");
	});

	it("is a SOFT warning (not a hard block) when our IP can't be detected", () => {
		const r = compareDnsResult("shop.io", ["203.0.113.10"], null);
		expect(r.ok).toBe(false);
		expect(r.expectedIp).toBeNull();
		expect(r.message).toContain("you can still create");
	});
});

describe("secret safety for AI connector keys", () => {
	// The keys ride InstallerState → STDIN, but defense-in-depth: any KEY=value
	// captured into logs/output MUST be masked by the panel redact().
	it("redact() masks OPENAI/GOOGLE/ANTHROPIC API keys in KEY=value output", () => {
		const out = redact(
			[
				"OPENAI_API_KEY=sk-secret-openai-value",
				"GOOGLE_API_KEY=google-secret-value",
				"ANTHROPIC_API_KEY=sk-ant-secret-value",
			].join("\n")
		);
		expect(out).not.toContain("sk-secret-openai-value");
		expect(out).not.toContain("google-secret-value");
		expect(out).not.toContain("sk-ant-secret-value");
		expect(out).toContain("OPENAI_API_KEY=***");
		expect(out).toContain("GOOGLE_API_KEY=***");
		expect(out).toContain("ANTHROPIC_API_KEY=***");
	});
});
