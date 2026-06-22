import { describe, expect, it } from "vitest";

import { redact } from "./redact";

describe("redact", () => {
	it("masks KEY=VALUE secrets", () => {
		expect(redact("DB_PASSWORD=hunter2 next")).toBe("DB_PASSWORD=*** next");
		expect(redact("REDIS_PASSWORD: s3cr3t")).toBe("REDIS_PASSWORD: ***");
	});
	it("masks WordPress salts and tokens", () => {
		expect(redact("AUTH_KEY='abc def'")).toContain("AUTH_KEY=***");
		expect(redact("token=ghp_AAA111")).toBe("token=***");
	});
	it("leaves ordinary text untouched", () => {
		expect(redact("HTTP 200 OK · TLS 89 days")).toBe(
			"HTTP 200 OK · TLS 89 days"
		);
	});
	it("masks --flag-form secret arguments (space-separated)", () => {
		expect(redact("--s3-secret-access-key wJalrXUtnFEMI/K7MDENG")).toBe(
			"--s3-secret-access-key ***"
		);
	});
	it("masks --flag-form secret arguments (equals-separated)", () => {
		expect(redact("--access-key-id=AKIAIOSFODNN7EXAMPLE")).toBe(
			"--access-key-id=***"
		);
	});
	it("masks Authorization: Bearer tokens (token bytes not present in output)", () => {
		const line = "Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.payload.sig";
		const result = redact(line);
		// The token must not appear; the header value is fully redacted.
		expect(result).not.toContain("eyJ");
		expect(result).not.toContain("payload");
	});
	it("masks standalone Bearer tokens", () => {
		const line = "Sending: Bearer sk-abc123XYZ";
		const result = redact(line);
		expect(result).toContain("Bearer ***");
		expect(result).not.toContain("sk-abc123XYZ");
	});
	it("leaves an ordinary log line with numbers untouched", () => {
		expect(redact("Transferred 12 files in 3.2s")).toBe(
			"Transferred 12 files in 3.2s"
		);
	});
});
