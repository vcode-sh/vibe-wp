import { describe, expect, it } from "vitest";

import type { PerfMeasurements } from "../contract";
import {
	advisePerf,
	buildPreviewDiff,
	DEFAULT_PER_CHILD_MIB,
	RAM_CAP_PERCENT,
	sizeToMiB,
} from "./perf-advisor";
import { emptyMeasurements } from "./perf-measure";

function measurements(over: Partial<PerfMeasurements> = {}): PerfMeasurements {
	const base = emptyMeasurements();
	return { ...base, ...over } as PerfMeasurements;
}

/** A healthy 8 GiB box with services up and no pressure signals. */
function healthy(): PerfMeasurements {
	return measurements({
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
}

describe("sizeToMiB", () => {
	it("parses M/G/K/bytes forms", () => {
		expect(sizeToMiB("256M")).toBe(256);
		expect(sizeToMiB("1G")).toBe(1024);
		expect(sizeToMiB("512mb")).toBe(512);
		expect(sizeToMiB("268435456")).toBe(256); // bytes
		expect(sizeToMiB(undefined)).toBe(0);
		expect(sizeToMiB("garbage")).toBe(0);
	});
});

describe("advisePerf", () => {
	it("services-down / all-zero measurement → no recommendations", () => {
		const r = advisePerf(emptyMeasurements(), 0, {});
		expect(r.recommendations).toHaveLength(0);
		expect(r.reservedMiB).toBe(0);
	});

	it("unknown host RAM (0) → emits no memory-raising recommendations", () => {
		const m = healthy();
		m.redis.evictedKeysDelta = 1000; // pressure present
		const r = advisePerf(m, 0, {});
		expect(r.recommendations).toHaveLength(0);
	});

	it("healthy box with headroom → no recommendations", () => {
		const r = advisePerf(healthy(), 8192, {});
		expect(r.recommendations).toHaveLength(0);
	});

	it("redis evictions in window → bumps REDIS_MAXMEMORY", () => {
		const m = healthy();
		m.redis.evictedKeysDelta = 500;
		const r = advisePerf(m, 8192, {});
		const redis = r.recommendations.find((x) => x.key === "REDIS_MAXMEMORY");
		expect(redis).toBeDefined();
		expect(sizeToMiB(redis?.suggested)).toBeGreaterThan(512);
		expect(redis?.reason).toMatch(/evicted/i);
	});

	it("low InnoDB read ratio → bumps the buffer pool", () => {
		const m = healthy();
		m.innodb.bufferPoolReadRatioPercent = 92;
		const r = advisePerf(m, 8192, {});
		const innodb = r.recommendations.find(
			(x) => x.key === "MARIADB_INNODB_BUFFER_POOL_SIZE"
		);
		expect(innodb).toBeDefined();
		expect(sizeToMiB(innodb?.suggested)).toBeGreaterThan(256);
		expect(innodb?.risk).toBe("high");
	});

	it("opcache OOM restarts → bumps OPcache memory", () => {
		const m = healthy();
		m.opcache.oomRestarts = 3;
		const r = advisePerf(m, 8192, {});
		const op = r.recommendations.find(
			(x) => x.key === "PHP_OPCACHE_MEMORY_CONSUMPTION"
		);
		expect(op).toBeDefined();
		expect(Number(op?.suggested)).toBeGreaterThan(256);
	});

	it("saturated FPM → raises max_children + derives spare servers", () => {
		const m = healthy();
		m.fpm.active = 24;
		m.fpm.maxChildren = 24;
		m.fpm.listenQueue = 5;
		const r = advisePerf(m, 8192, {});
		const mc = r.recommendations.find(
			(x) => x.key === "PHP_FPM_PM_MAX_CHILDREN"
		);
		expect(mc).toBeDefined();
		expect(Number(mc?.suggested)).toBeGreaterThan(24);
		// derived pool keys present
		expect(
			r.recommendations.some((x) => x.key === "PHP_FPM_PM_START_SERVERS")
		).toBe(true);
		expect(
			r.recommendations.some((x) => x.key === "PHP_FPM_PM_MAX_SPARE_SERVERS")
		).toBe(true);
	});

	it("clamps a suggestion that would breach the 85% cap", () => {
		// 2 GiB box → cap 1740. Baseline = 2*48 (FPM) + 256 innodb + 1200 redis +
		// 512 OS = 2064? No: choose values so baseline FITS but a 1.5× redis raise
		// would breach. FPM 2*48=96, innodb 256, redis 768, OS 512 → baseline 1632
		// (< 1740, headroom 108). Redis 768→1152 wants +384, only 108 fits → clamp.
		const m = measurements({
			host: { ramTotalMiB: 2048, ramFreeMiB: 100, ramAvailableMiB: 150 },
			fpm: {
				active: 2,
				idle: 1,
				total: 3,
				maxChildren: 2,
				listenQueue: 0,
				maxActiveReached: 0,
				slowRequests: 0,
				avgRssMiB: 48,
			},
			redis: {
				hitRatePercent: 80,
				evictedKeysDelta: 1000,
				evictedKeysTotal: 1000,
				usedMemoryMiB: 700,
				maxMemoryMiB: 768,
				fragmentationRatio: 1.2,
			},
			innodb: {
				bufferPoolReadRatioPercent: 100,
				bufferPoolSizeMiB: 256,
				bufferPoolFreePct: 30,
			},
		});
		const r = advisePerf(m, 2048, {});
		const cap = Math.floor((2048 * RAM_CAP_PERCENT) / 100);
		expect(r.capMiB).toBe(cap);
		// The proposed set's reserved total must NEVER exceed the cap.
		expect(r.reservedMiB).toBeLessThanOrEqual(cap);
		const redis = r.recommendations.find((x) => x.key === "REDIS_MAXMEMORY");
		// Either it was clamped (annotated) or dropped because no room remained.
		if (redis) {
			expect(redis.reason).toMatch(/clamped/i);
			expect(sizeToMiB(redis.suggested)).toBeLessThanOrEqual(cap);
		}
	});

	it("baseline already over the cap → downward, high-risk only; never over cap", () => {
		// 1 GiB box, 4 children @64 = 256, innodb 1024, redis 512 → way over 870.
		const m = measurements({
			host: { ramTotalMiB: 1024, ramFreeMiB: 50, ramAvailableMiB: 60 },
			fpm: {
				active: 1,
				idle: 1,
				total: 2,
				maxChildren: 4,
				listenQueue: 0,
				maxActiveReached: 0,
				slowRequests: 0,
				avgRssMiB: 64,
			},
			redis: {
				hitRatePercent: 90,
				evictedKeysDelta: 0,
				evictedKeysTotal: 0,
				usedMemoryMiB: 400,
				maxMemoryMiB: 512,
				fragmentationRatio: 1.1,
			},
			innodb: {
				bufferPoolReadRatioPercent: 100,
				bufferPoolSizeMiB: 1024,
				bufferPoolFreePct: 30,
			},
		});
		const r = advisePerf(m, 1024, {});
		expect(r.recommendations.length).toBeGreaterThan(0);
		for (const rec of r.recommendations) {
			expect(rec.risk).toBe("high");
			// downward: suggested < current
			expect(sizeToMiB(rec.suggested)).toBeLessThan(sizeToMiB(rec.current));
		}
		expect(r.headroomMiB).toBeLessThan(0);
	});

	it("never emits a set whose suggested total exceeds the cap (multi-pressure, baseline fits)", () => {
		// Large 16 GiB box so the baseline comfortably fits but every pressure
		// signal fires. The clamp pass must keep the SUGGESTED reserved <= cap.
		const m = healthy();
		m.host = { ramTotalMiB: 16_384, ramFreeMiB: 4000, ramAvailableMiB: 6000 };
		m.fpm = {
			...m.fpm,
			active: 24,
			maxChildren: 24,
			listenQueue: 9,
			avgRssMiB: 64,
		};
		m.redis.evictedKeysDelta = 1000;
		m.innodb.bufferPoolReadRatioPercent = 80;
		m.opcache.oomRestarts = 2;
		const r = advisePerf(m, 16_384, { perChildMiB: DEFAULT_PER_CHILD_MIB });
		expect(r.recommendations.length).toBeGreaterThan(0);
		// The proposed (suggested) reserved total stays within the cap.
		expect(r.reservedMiB).toBeLessThanOrEqual(r.capMiB);
	});
});

describe("buildPreviewDiff", () => {
	it("empty recs → empty diff + 'No changes' text", () => {
		const { diff, text } = buildPreviewDiff([]);
		expect(diff).toHaveLength(0);
		expect(text).toMatch(/no changes/i);
	});

	it("maps recommendations into from→to lines", () => {
		const m = healthy();
		m.redis.evictedKeysDelta = 500;
		const r = advisePerf(m, 8192, {});
		const { diff, text } = buildPreviewDiff(r.recommendations);
		expect(diff.length).toBe(r.recommendations.length);
		expect(diff[0]).toHaveProperty("key");
		expect(diff[0]).toHaveProperty("from");
		expect(diff[0]).toHaveProperty("to");
		expect(text).toMatch(/^- /m);
		expect(text).toMatch(/^\+ /m);
	});
});
