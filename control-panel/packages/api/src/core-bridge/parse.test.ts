import { describe, expect, it } from "vitest";

import {
	hostFromUrl,
	parseBackups,
	parseChecksJson,
	parseEnvFile,
	parseLogLines,
	parseMonitorJson,
	parsePerfJson,
	parseSecurityStatus,
	parseSmoke,
	parseWpUpdateCount,
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

	it("parses the real compact YYYYMMDDTHHMMSSZ dir format", () => {
		const r = parseBackups("/var/backups/vibe-wp/acme/prod/20260621T200601Z\n");
		expect(r[0]?.whenISO).toBe("2026-06-21T20:06:01Z");
	});

	it("leaves whenISO empty (→ 'never') when no timestamp is present", () => {
		expect(
			parseBackups("/var/backups/vibe-wp/acme/prod/latest\n")[0]?.whenISO
		).toBe("");
	});

	it("parses new TAB-separated format with real size, location=both, and complete", () => {
		const r = parseBackups(
			"/var/backups/vibe-wp/acme/prod/20260622T102446Z\t9438934\tboth\tcomplete\n"
		);
		expect(r).toHaveLength(1);
		const rec = r[0];
		expect(rec?.whenISO).toBe("2026-06-22T10:24:46Z");
		expect(rec?.sizeMB).toBe(9.0);
		expect(rec?.location).toBe("both");
		expect(rec?.verified).toBe(true);
	});

	it("parses TAB format with location=local and partial completeness", () => {
		const r = parseBackups(
			"/var/backups/vibe-wp/acme/prod/20260622T120000Z\t2097152\tlocal\tpartial\n"
		);
		expect(r[0]?.location).toBe("local");
		expect(r[0]?.verified).toBe(false);
		expect(r[0]?.sizeMB).toBe(2);
	});

	it("back-compat: plain path (no tab) falls back to old behavior — sizeMB 0, verified false", () => {
		const r = parseBackups("/var/backups/vibe-wp/acme/prod/20260621T200601Z\n");
		expect(r[0]?.sizeMB).toBe(0);
		expect(r[0]?.verified).toBe(false);
		expect(r[0]?.location).toBe("local");
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

describe("parseSecurityStatus", () => {
	it("parses a valid security-status envelope", () => {
		const r = parseSecurityStatus(
			'{"firewall":true,"fail2ban":false,"autoUpdates":true}'
		);
		expect(r).toEqual({
			firewall: true,
			fail2ban: false,
			autoUpdates: true,
		});
	});
	it("parses a genuine all-off posture (valid JSON) as all false", () => {
		const r = parseSecurityStatus(
			'{"firewall":false,"fail2ban":false,"autoUpdates":false}'
		);
		expect(r).toEqual({
			firewall: false,
			fail2ban: false,
			autoUpdates: false,
		});
	});
	it("throws on garbage input (couldn't determine, not all-off)", () => {
		expect(() => parseSecurityStatus("not json")).toThrow();
	});
	it("throws on empty input", () => {
		expect(() => parseSecurityStatus("")).toThrow();
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

describe("parseWpUpdateCount", () => {
	it("returns the array length for a valid JSON array", () => {
		const json = JSON.stringify([
			{ name: "woocommerce", version: "8.0.0", update_version: "8.1.0" },
			{ name: "akismet", version: "5.0.0", update_version: "5.1.0" },
		]);
		expect(parseWpUpdateCount(json)).toBe(2);
	});
	it("returns 0 for non-JSON garbage", () => {
		expect(parseWpUpdateCount("not json at all")).toBe(0);
	});
});
