import { describe, expect, it } from "vitest";

import { isNearBottom } from "./use-auto-scroll";

describe("isNearBottom", () => {
	it("returns true when exactly at the bottom", () => {
		// scrollTop + clientHeight === scrollHeight  → distance 0
		expect(isNearBottom(900, 1000, 100)).toBe(true);
	});

	it("returns true when within the default 32 px threshold", () => {
		// distance = 1000 - 870 - 100 = 30
		expect(isNearBottom(870, 1000, 100)).toBe(true);
	});

	it("returns false when beyond the default 32 px threshold", () => {
		// distance = 1000 - 800 - 100 = 100
		expect(isNearBottom(800, 1000, 100)).toBe(false);
	});

	it("respects a custom threshold", () => {
		// distance = 1000 - 840 - 100 = 60  → false with threshold 50
		expect(isNearBottom(840, 1000, 100, 50)).toBe(false);
		// same distance → true with threshold 64
		expect(isNearBottom(840, 1000, 100, 64)).toBe(true);
	});

	it("handles zero-height content (scrollHeight equals clientHeight)", () => {
		expect(isNearBottom(0, 100, 100)).toBe(true);
	});
});
