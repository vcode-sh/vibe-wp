import { ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";
import type { LogLine } from "../contract";
import {
	applySourceFilter,
	applyTextFilter,
	assertSourceAllowed,
	decorateLines,
	hostArgs,
	mapServiceToSource,
	maskStreamLine,
} from "./logs-helpers";

const mk = (over: Partial<LogLine>): LogLine => ({
	id: "0",
	source: "nginx",
	text: "",
	whenISO: "",
	...over,
});

describe("hostArgs", () => {
	it("maps php → wordpress and passes tail", () =>
		expect(hostArgs("php", "500")).toEqual(["wordpress", "500"]));
	it("maps mariadb → db", () =>
		expect(hostArgs("mariadb", "100")).toEqual(["db", "100"]));
	it("maps wp → cron", () =>
		expect(hostArgs("wp", "100")).toEqual(["cron", "100"]));
	it("maps access → nginx", () =>
		expect(hostArgs("access", "100")).toEqual(["nginx", "100"]));
	it("sends all → all", () =>
		expect(hostArgs("all", "2000")).toEqual(["all", "2000"]));
});

describe("applySourceFilter", () => {
	const access = mk({
		text: '1.2.3.4 - - "GET / HTTP/1.1" 200 5 "-" "ua" "-" cache=HIT',
	});
	const error = mk({ text: "2026/06/24 [error] open() failed" });
	it("nginx tab drops access lines", () =>
		expect(applySourceFilter([access, error], "nginx")).toEqual([error]));
	it("access tab keeps only access lines", () =>
		expect(applySourceFilter([access, error], "access")).toEqual([access]));
	it("other tabs keep everything", () =>
		expect(applySourceFilter([access, error], "php")).toHaveLength(2));
});

describe("decorateLines", () => {
	it("masks IPs + extracts cache + retags source on access", () => {
		const [l] = decorateLines(
			[
				mk({
					text: '9.9.9.9 - - "GET / HTTP/1.1" 200 5 "-" "-" "-" cache=MISS',
				}),
			],
			"access"
		);
		expect(l.source).toBe("access");
		expect(l.cache).toBe("MISS");
		expect(l.text).not.toContain("9.9.9.9");
	});
	it("masks SQL literals on mariadb", () => {
		const [l] = decorateLines(
			[mk({ source: "mariadb", text: "WHERE email = 'x@y.z'" })],
			"mariadb"
		);
		expect(l.text).not.toContain("x@y.z");
	});
	it("masks IPs on access-format lines even under the all tab", () => {
		const [l] = decorateLines(
			[
				mk({
					text: '8.8.8.8 - - "GET / HTTP/1.1" 200 5 "-" "-" "-" cache=HIT',
				}),
			],
			"all"
		);
		expect(l.text).not.toContain("8.8.8.8");
	});
});

describe("applyTextFilter", () => {
	const lines = [mk({ text: "alpha" }), mk({ text: "beta" })];
	it("substring matches", () =>
		expect(applyTextFilter(lines, "alph")).toHaveLength(1));
	it("regex matches", () =>
		expect(applyTextFilter(lines, "^be")).toHaveLength(1));
	it("invalid regex falls back to literal", () =>
		expect(applyTextFilter([mk({ text: "a(b" })], "a(b")).toHaveLength(1));
});

describe("assertSourceAllowed", () => {
	it("blocks access for operator", () =>
		expect(() => assertSourceAllowed("access", "operator")).toThrow(ORPCError));
	it("blocks mariadb for operator", () =>
		expect(() => assertSourceAllowed("mariadb", "operator")).toThrow(
			ORPCError
		));
	it("allows access for admin", () =>
		expect(() => assertSourceAllowed("access", "admin")).not.toThrow());
	it("allows nginx for operator", () =>
		expect(() => assertSourceAllowed("nginx", "operator")).not.toThrow());
});

describe("mapServiceToSource", () => {
	it("seeds access", () => expect(mapServiceToSource("access")).toBe("access"));
	it("seeds php", () => expect(mapServiceToSource("php")).toBe("php"));
});

describe("maskStreamLine", () => {
	it("masks the client IP on an nginx access line under the nginx tab", () => {
		const raw =
			'nginx-1  | 5.6.7.8 - - "GET / HTTP/1.1" 200 12 "-" "ua" "-" cache=HIT';
		const out = maskStreamLine(raw, "nginx");
		expect(out).not.toContain("5.6.7.8");
		expect(out).toContain("[ip]");
	});
	it("masks the client IP under the all tab too", () => {
		const raw =
			'nginx-1  | 9.9.9.9 - - "GET /x HTTP/1.1" 404 0 "-" "-" "-" cache=MISS';
		expect(maskStreamLine(raw, "all")).not.toContain("9.9.9.9");
	});
	it("masks SQL literals on a db-prefixed line", () => {
		const raw = "db-1  | ... WHERE user_email = 'a@b.com'";
		expect(maskStreamLine(raw, "all")).not.toContain("a@b.com");
	});
	it("masks SQL on the mariadb tab regardless of prefix", () => {
		expect(maskStreamLine("some slow query 'secret'", "mariadb")).not.toContain(
			"secret"
		);
	});
	it("leaves a plain nginx error line unchanged", () => {
		const raw = "nginx-1  | 2026/06/24 [error] open() failed";
		expect(maskStreamLine(raw, "nginx")).toBe(raw);
	});
});
