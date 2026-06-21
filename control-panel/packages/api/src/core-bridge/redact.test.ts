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
});
