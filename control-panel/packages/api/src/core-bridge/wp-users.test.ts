import { describe, expect, it } from "vitest";

import { assertPassword, assertUserId } from "./wp-users-validate";

describe("assertUserId", () => {
	it.each([1, 5, 42, 999_999])("accepts %d", (id) => {
		expect(() => assertUserId(id)).not.toThrow();
	});

	it.each([
		0,
		-1,
		1.5,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("rejects %s", (id) => {
		expect(() => assertUserId(id)).toThrow();
	});
});

describe("assertPassword", () => {
	it.each([
		"password1",
		"a-strong-PASS_123",
		"x".repeat(128),
		"😀😀😀😀😀😀😀😀",
	])("accepts %j", (p) => {
		expect(() => assertPassword(p)).not.toThrow();
	});

	it("rejects an empty password", () => {
		expect(() => assertPassword("")).toThrow();
	});

	it("rejects a password over 128 characters", () => {
		expect(() => assertPassword("x".repeat(129))).toThrow();
	});

	// Control chars would be truncated by the shell before WordPress sees them
	// (newline/NUL -> silent lockout), so every one must be rejected up front.
	const NUL = String.fromCharCode(0);
	const DEL = String.fromCharCode(0x7f);
	const BELL = String.fromCharCode(0x07);
	it.each([
		["newline", "good\npart"],
		["carriage return", "good\rpart"],
		["NUL", `good${NUL}part`],
		["tab", "good\tpart"],
		["DEL", `good${DEL}part`],
		["bell", `good${BELL}part`],
	])("rejects a password with a %s", (_name, p) => {
		expect(() => assertPassword(p)).toThrow("control characters");
	});
});
