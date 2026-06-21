import { describe, expect, it } from "vitest";

import {
	hostFromUrl,
	parseBackups,
	parseChecksJson,
	parseEnvFile,
	parseLogLines,
	parseMonitorJson,
	parsePerfJson,
	parseSmoke,
} from "./parse";

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
		const first = r[0];
		const second = r[1];
		expect(first).toBeDefined();
		expect(second).toBeDefined();
		expect((first?.whenISO ?? "") > (second?.whenISO ?? "")).toBe(true);
		expect(first?.location).toBe("local");
	});
});

describe("parseChecksJson", () => {
	it("parses the --json checks envelope", () => {
		const r = parseChecksJson(
			'{"passed":false,"checks":[{"name":"HTTP 200","ok":true},{"name":"TLS","ok":false}]}'
		);
		expect(r.passed).toBe(false);
		expect(r.checks).toEqual([
			{ name: "HTTP 200", ok: true },
			{ name: "TLS", ok: false },
		]);
	});
	it("returns a safe empty result on garbage", () => {
		expect(parseChecksJson("not json")).toEqual({ passed: false, checks: [] });
	});
});

describe("parseMonitorJson", () => {
	it("parses a valid monitor --json envelope", () => {
		const r = parseMonitorJson(
			'{"status":"warn","failures":0,"warnings":1,"uptimePercent":99.5,"checks":[{"name":"HTTP uptime","ok":true},{"name":"Disk space","ok":false}]}'
		);
		expect(r.status).toBe("warn");
		expect(r.failures).toBe(0);
		expect(r.warnings).toBe(1);
		expect(r.uptimePercent).toBe(99.5);
		expect(r.checks).toEqual([
			{ name: "HTTP uptime", ok: true },
			{ name: "Disk space", ok: false },
		]);
	});
	it("returns safe fallback on garbage input", () => {
		expect(parseMonitorJson("not json")).toEqual({
			status: "fail",
			failures: 0,
			warnings: 0,
			uptimePercent: 0,
			checks: [],
		});
	});
});

describe("parsePerfJson", () => {
	it("parses a valid perf-report --json envelope", () => {
		const r = parsePerfJson(
			'{"ttfbMs":142,"cacheHitPercent":87,"opcacheHitPercent":99,"redisHitPercent":95}'
		);
		expect(r.ttfbMs).toBe(142);
		expect(r.cacheHitPercent).toBe(87);
		expect(r.opcacheHitPercent).toBe(99);
		expect(r.redisHitPercent).toBe(95);
	});
	it("returns safe fallback on garbage input", () => {
		expect(parsePerfJson("not json")).toEqual({
			ttfbMs: 0,
			cacheHitPercent: 0,
			opcacheHitPercent: 0,
			redisHitPercent: 0,
		});
	});
});

describe("parseLogLines", () => {
	it("splits stdout into LogLine entries with the given source", () => {
		const lines = parseLogLines("line one\nline two\nline three\n", "nginx");
		expect(lines).toHaveLength(3);
		expect(lines[0]?.source).toBe("nginx");
		expect(lines[0]?.text).toBe("line one");
		expect(lines[1]?.text).toBe("line two");
		expect(lines[2]?.text).toBe("line three");
		expect(lines[0]?.id).toBe("0");
	});
	it("returns an empty array for empty stdout", () => {
		expect(parseLogLines("", "php")).toEqual([]);
	});
});
