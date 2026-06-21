import { describe, expect, it } from "vitest";

import { hostFromUrl, parseBackups, parseEnvFile, parseSmoke } from "./parse";

describe("parseEnvFile", () => {
	it("reads KEY=VALUE lines, ignoring comments and quotes", () => {
		const env = parseEnvFile("# c\nWP_HOME='https://acme.com'\nFOO=bar\n");
		expect(env.WP_HOME).toBe("https://acme.com");
		expect(env.FOO).toBe("bar");
	});
});

describe("hostFromUrl", () => {
	it("extracts the hostname", () => {
		expect(hostFromUrl("https://acme.com/")).toBe("acme.com");
		expect(hostFromUrl("not a url")).toBe("not a url");
	});
});

describe("parseSmoke", () => {
	it("maps ok/failed lines to checks + overall pass", () => {
		const r = parseSmoke("ok: HTTP 200\nok: Redis connected\nfailed: TLS\n");
		expect(r.passed).toBe(false);
		expect(r.checks).toEqual([
			{ name: "HTTP 200", ok: true },
			{ name: "Redis connected", ok: true },
			{ name: "TLS", ok: false },
		]);
	});
	it("passes when no failures", () => {
		expect(parseSmoke("ok: HTTP 200\n").passed).toBe(true);
	});
});

describe("parseBackups", () => {
	it("turns backup dir paths into records, newest first", () => {
		const r = parseBackups(
			"/srv/acme/backups/local/2026-06-20T03-00-00\n/srv/acme/backups/local/2026-06-21T03-00-00\n"
		);
		expect(r).toHaveLength(2);
		expect(r[0].whenISO > r[1].whenISO).toBe(true);
		expect(r[0].location).toBe("local");
	});
});
