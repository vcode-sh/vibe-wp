import { describe, expect, it } from "vitest";
import { passwordSchema, scorePassword } from "./password";

describe("scorePassword", () => {
	it("scores empty as 0", () => {
		expect(scorePassword("").score).toBe(0);
	});
	it("rates a short simple password weak", () => {
		expect(scorePassword("aaaaaaaa").score).toBeLessThanOrEqual(1);
	});
	it("rates a long mixed password strong", () => {
		const s = scorePassword("Tr0ub4dour&3xtra-long");
		expect(s.score).toBeGreaterThanOrEqual(3);
		expect(s.percent).toBeGreaterThan(60);
	});
	it("clamps percent to 0..100", () => {
		const s = scorePassword("aA1!aA1!aA1!aA1!aA1!");
		expect(s.percent).toBeLessThanOrEqual(100);
		expect(s.percent).toBeGreaterThanOrEqual(0);
	});
});

describe("passwordSchema", () => {
	it("rejects < 8 chars", () => {
		expect(passwordSchema.safeParse("short").success).toBe(false);
	});
	it("accepts >= 8 chars", () => {
		expect(passwordSchema.safeParse("longenough").success).toBe(true);
	});
	it("rejects > 128 chars", () => {
		expect(passwordSchema.safeParse("a".repeat(129)).success).toBe(false);
	});
});
