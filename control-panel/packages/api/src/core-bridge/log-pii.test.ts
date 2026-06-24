import { describe, expect, it } from "vitest";
import {
	extractCache,
	isAccessLine,
	maskAccessPii,
	maskMariadbPii,
} from "./log-pii";

const ACCESS =
	'203.0.113.7 - - [24/Jun/2026:10:00:00 +0000] "GET /wp-login.php HTTP/2.0" 200 512 "https://ref.example/x" "Mozilla/5.0" "-" cache=MISS';
const IPV4_OR_IPV6 = /1\.2\.3\.4|2001:db8::5/;

describe("isAccessLine", () => {
	it("matches an nginx access line", () =>
		expect(isAccessLine(ACCESS)).toBe(true));
	it("matches by cache= field even without a leading IP", () =>
		expect(isAccessLine('foo "GET / HTTP/1.1" 200 cache=HIT')).toBe(true));
	it("rejects an nginx error line", () =>
		expect(
			isAccessLine("2026/06/24 10:00:00 [error] 7#7: *1 open() failed")
		).toBe(false));
});

describe("extractCache", () => {
	it("pulls the cache status", () => expect(extractCache(ACCESS)).toBe("MISS"));
	it("returns undefined when absent", () =>
		expect(extractCache("no cache field")).toBeUndefined());
	it("ignores a dash placeholder", () =>
		expect(extractCache('"GET / HTTP/1.1" 200 cache=-')).toBeUndefined());
});

describe("maskAccessPii", () => {
	it("masks the client IPv4", () => {
		const out = maskAccessPii(ACCESS);
		expect(out).not.toContain("203.0.113.7");
		expect(out).toContain("[ip]");
	});
	it("keeps the rest of the line intact", () =>
		expect(maskAccessPii(ACCESS)).toContain("GET /wp-login.php"));
	it("masks a full IPv6 address", () => {
		const out = maskAccessPii("xff 2a01:db8:0:0:0:0:0:1 end");
		expect(out).not.toContain("2a01");
		expect(out).toContain("[ip]");
	});
	it("masks a compressed IPv6 address", () => {
		expect(maskAccessPii("xff 2001:db8::1 end")).not.toContain("2001:db8::1");
	});
	it("masks a link-local IPv6 address", () => {
		expect(maskAccessPii("xff fe80::1 end")).not.toContain("fe80::1");
	});
	it("does NOT mask a decimal HH:MM:SS timestamp", () => {
		expect(maskAccessPii("[24/Jun/2026:10:00:00 +0000]")).toContain("10:00:00");
	});
	it("still masks IPv4 alongside IPv6", () => {
		expect(maskAccessPii("a 1.2.3.4 b 2001:db8::5 c")).not.toMatch(
			IPV4_OR_IPV6
		);
	});
});

describe("maskMariadbPii", () => {
	it("masks single-quoted SQL string literals", () => {
		const out = maskMariadbPii(
			"SELECT * FROM wp_users WHERE user_email = 'a@b.com'"
		);
		expect(out).not.toContain("a@b.com");
		expect(out).toContain("'[redacted]'");
	});
	it("masks the User@Host slow-query header", () => {
		const out = maskMariadbPii("# User@Host: wp_app[wp_app] @ localhost []");
		expect(out).not.toContain("wp_app[wp_app]");
		expect(out).toContain("[redacted]");
	});
	it("leaves numeric literals alone", () =>
		expect(maskMariadbPii("WHERE id = 42")).toContain("42"));
});
