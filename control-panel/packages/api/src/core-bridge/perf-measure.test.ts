import { describe, expect, it } from "vitest";

import { emptyMeasurements, parsePerfMeasureJson } from "./perf-measure";

const VALID = JSON.stringify({
	host: { ramTotalMiB: 8192, ramFreeMiB: 4096, ramAvailableMiB: 5000 },
	fpm: {
		active: 4,
		idle: 8,
		total: 12,
		maxChildren: 24,
		listenQueue: 0,
		maxActiveReached: 0,
		slowRequests: 0,
		avgRssMiB: 48,
	},
	opcache: {
		hitRatePercent: 99,
		usedMiB: 100,
		freeMiB: 156,
		wastedMiB: 0,
		oomRestarts: 0,
	},
	redis: {
		hitRatePercent: 99,
		evictedKeysDelta: 0,
		evictedKeysTotal: 0,
		usedMemoryMiB: 100,
		maxMemoryMiB: 512,
		fragmentationRatio: 1.1,
	},
	innodb: {
		bufferPoolReadRatioPercent: 100,
		bufferPoolSizeMiB: 256,
		bufferPoolFreePct: 40,
	},
	fastcgi: { hitRatePercent: 100 },
	window: { sampleMs: 2000, samples: 2 },
});

describe("parsePerfMeasureJson", () => {
	it("parses a valid measurement envelope", () => {
		const m = parsePerfMeasureJson(VALID);
		expect(m.host.ramTotalMiB).toBe(8192);
		expect(m.fpm.maxChildren).toBe(24);
		expect(m.redis.maxMemoryMiB).toBe(512);
	});

	it("returns all-zero defaults on garbage", () => {
		expect(parsePerfMeasureJson("not json")).toEqual(emptyMeasurements());
		expect(parsePerfMeasureJson("")).toEqual(emptyMeasurements());
		expect(parsePerfMeasureJson("{}")).toEqual(emptyMeasurements());
	});

	it("returns all-zero defaults when a required field is missing", () => {
		const partial = JSON.stringify({ host: { ramTotalMiB: 100 } });
		expect(parsePerfMeasureJson(partial)).toEqual(emptyMeasurements());
	});
});
