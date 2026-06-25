import { describe, expect, it } from "vitest";

import { pointsAttr, sparklinePoints } from "./sparkline";

describe("sparklinePoints", () => {
	it("returns [] for an empty series", () => {
		expect(sparklinePoints([], 100, 20)).toEqual([]);
	});

	it("centers a single sample, top for up=1", () => {
		const pts = sparklinePoints([1], 100, 20, 2);
		expect(pts).toEqual([{ x: 50, y: 2 }]);
	});

	it("centers a single sample, bottom for up=0", () => {
		const pts = sparklinePoints([0], 100, 20, 2);
		expect(pts).toEqual([{ x: 50, y: 18 }]);
	});

	it("spaces multiple samples evenly across the inner width", () => {
		const pts = sparklinePoints([1, 0, 1], 100, 20, 2);
		expect(pts.map((p) => p.x)).toEqual([2, 50, 98]);
		// up=1 → top (pad), up=0 → bottom (height-pad)
		expect(pts.map((p) => p.y)).toEqual([2, 18, 2]);
	});
});

describe("pointsAttr", () => {
	it("formats points into an SVG polyline attribute", () => {
		expect(
			pointsAttr([
				{ x: 2, y: 2 },
				{ x: 50, y: 18 },
			])
		).toBe("2,2 50,18");
	});

	it("rounds to two decimals", () => {
		expect(pointsAttr([{ x: 1.234_56, y: 9.876_54 }])).toBe("1.23,9.88");
	});
});
