import { z } from "zod";

import type { PerfMeasurements } from "../contract";

/**
 * Strict zod envelope for `bin/perf-measure --json`. Mirrors parsePerfJson's
 * defensive pattern: on ANY parse failure (the script missing, the process
 * killed, partial/garbled stdout) we return an ALL-ZERO Measurements rather than
 * throw. An all-zero snapshot is the advisor's "nothing measurable / services
 * down" input, which deterministically yields zero recommendations — never a
 * dangerous one.
 */
const perfMeasureEnvelope = z.object({
	host: z.object({
		ramTotalMiB: z.number(),
		ramFreeMiB: z.number(),
		ramAvailableMiB: z.number(),
	}),
	fpm: z.object({
		active: z.number(),
		idle: z.number(),
		total: z.number(),
		maxChildren: z.number(),
		listenQueue: z.number(),
		maxActiveReached: z.number(),
		slowRequests: z.number(),
		avgRssMiB: z.number(),
	}),
	opcache: z.object({
		hitRatePercent: z.number(),
		usedMiB: z.number(),
		freeMiB: z.number(),
		wastedMiB: z.number(),
		oomRestarts: z.number(),
	}),
	redis: z.object({
		hitRatePercent: z.number(),
		evictedKeysDelta: z.number(),
		evictedKeysTotal: z.number(),
		usedMemoryMiB: z.number(),
		maxMemoryMiB: z.number(),
		fragmentationRatio: z.number(),
	}),
	innodb: z.object({
		bufferPoolReadRatioPercent: z.number(),
		bufferPoolSizeMiB: z.number(),
		bufferPoolFreePct: z.number(),
	}),
	fastcgi: z.object({ hitRatePercent: z.number() }),
	window: z.object({ sampleMs: z.number(), samples: z.number() }),
});

/** An all-zero measurement — the safe default on any parse failure. */
export function emptyMeasurements(): PerfMeasurements {
	return {
		host: { ramTotalMiB: 0, ramFreeMiB: 0, ramAvailableMiB: 0 },
		fpm: {
			active: 0,
			idle: 0,
			total: 0,
			maxChildren: 0,
			listenQueue: 0,
			maxActiveReached: 0,
			slowRequests: 0,
			avgRssMiB: 0,
		},
		opcache: {
			hitRatePercent: 0,
			usedMiB: 0,
			freeMiB: 0,
			wastedMiB: 0,
			oomRestarts: 0,
		},
		redis: {
			hitRatePercent: 0,
			evictedKeysDelta: 0,
			evictedKeysTotal: 0,
			usedMemoryMiB: 0,
			maxMemoryMiB: 0,
			fragmentationRatio: 0,
		},
		innodb: {
			bufferPoolReadRatioPercent: 0,
			bufferPoolSizeMiB: 0,
			bufferPoolFreePct: 0,
		},
		fastcgi: { hitRatePercent: 0 },
		window: { sampleMs: 0, samples: 0 },
	};
}

export function parsePerfMeasureJson(stdout: string): PerfMeasurements {
	try {
		return perfMeasureEnvelope.parse(JSON.parse(stdout.trim()));
	} catch {
		return emptyMeasurements();
	}
}
