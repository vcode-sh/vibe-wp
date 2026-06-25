/**
 * Periodic monitor recorder. Runs the already-allowlisted `monitor` op for every
 * detected site on a fixed interval and persists a sample, so history accrues
 * WITHOUT a human opening the status view. This is the real "scheduled/poll
 * recording path" the monitoring feature promises: it reuses recordSiteSample
 * (the single record chokepoint) and adds NO new host capability.
 *
 * Safety properties:
 *   - One pass at a time: a `running` guard skips a tick if the previous pass is
 *     still in flight (a slow VPS must never stack overlapping monitor runs).
 *   - Best-effort per site: one site's monitor failure never aborts the pass or
 *     the loop; it just leaves that site's last persisted tile in place.
 *   - Bounded fan-out: sites are recorded with a small concurrency limit so a
 *     host with many sites doesn't spawn dozens of monitor processes at once.
 *   - Disable-able: interval 0 (or non-positive) means "do not record on a timer"
 *     — useful for tests, dev, and operators who only want on-demand snapshots.
 */

import { recordSiteSample } from "./monitor-history";
import { detectSites } from "./sites";

/** Bounds for the configured recorder interval, in minutes. */
const MIN_INTERVAL_MIN = 5;
const MAX_INTERVAL_MIN = 24 * 60;

/** Max sites recorded concurrently per pass (keeps host process count sane). */
const PASS_CONCURRENCY = 4;

/**
 * Resolve the recorder interval (ms) from a raw env string. Returns 0 ("off")
 * for unset/blank/"0"/"off"/non-numeric input; otherwise clamps the minutes into
 * [MIN_INTERVAL_MIN, MAX_INTERVAL_MIN] and converts to ms. PURE + unit-tested.
 */
export function resolveRecorderIntervalMs(raw: string | undefined): number {
	if (!raw) {
		return 0;
	}
	const trimmed = raw.trim().toLowerCase();
	if (trimmed === "" || trimmed === "0" || trimmed === "off") {
		return 0;
	}
	const minutes = Number(trimmed);
	if (!Number.isFinite(minutes) || minutes <= 0) {
		return 0;
	}
	const clamped = Math.min(
		Math.max(Math.trunc(minutes), MIN_INTERVAL_MIN),
		MAX_INTERVAL_MIN
	);
	return clamped * 60 * 1000;
}

/** A site shape the recorder needs (subset of DetectedSite). */
interface RecordTarget {
	id: string;
	installDir: string;
}

/**
 * Record one pass over the given sites with bounded concurrency. Each site is
 * best-effort: a thrown monitor error is swallowed so the pass always finishes.
 * Returns how many sites recorded successfully (useful for logging/tests).
 */
export async function recordPass(
	sites: RecordTarget[],
	record: (
		siteDir: string,
		siteId: string
	) => Promise<unknown> = recordSiteSample,
	concurrency = PASS_CONCURRENCY
): Promise<number> {
	let ok = 0;
	const queue = [...sites];
	const workers = Array.from(
		{ length: Math.max(1, Math.min(concurrency, queue.length || 1)) },
		async () => {
			for (let site = queue.shift(); site; site = queue.shift()) {
				try {
					await record(site.installDir, site.id);
					ok += 1;
				} catch {
					// Best-effort: keep the site's last persisted tile.
				}
			}
		}
	);
	await Promise.all(workers);
	return ok;
}

/** A handle to stop the recorder loop (clears the timer). */
export interface RecorderHandle {
	stop: () => void;
}

/**
 * Start the periodic recorder. With `intervalMs <= 0` this is a no-op and returns
 * a handle whose stop() does nothing — so callers can wire it unconditionally.
 * Otherwise it records an immediate first pass (so history starts accruing on
 * boot, not one interval later) and then every `intervalMs`. Overlapping passes
 * are prevented by an in-flight guard.
 */
export function startMonitorRecorder(opts: {
	intervalMs: number;
	listSites?: () => Promise<RecordTarget[]>;
	onError?: (err: unknown) => void;
}): RecorderHandle {
	if (opts.intervalMs <= 0) {
		return { stop: () => undefined };
	}
	const listSites = opts.listSites ?? detectSites;
	let running = false;

	// tick() never rejects (full try/catch/finally), so callers can fire-and-forget
	// it. The redundant .catch keeps a stray rejection from ever becoming an
	// unhandled-rejection crash and avoids a floating promise.
	const tick = (): Promise<void> => {
		if (running) {
			return Promise.resolve();
		}
		running = true;
		return listSites()
			.then((sites) => recordPass(sites).then(() => undefined))
			.catch((err) => {
				opts.onError?.(err);
			})
			.finally(() => {
				running = false;
			});
	};

	// Immediate first pass, then on the interval. Both go through the same guard.
	tick().catch(() => undefined);
	const timer = setInterval(() => {
		tick().catch(() => undefined);
	}, opts.intervalMs);
	// Don't keep the process alive solely for the recorder (Node/Bun timers).
	(timer as { unref?: () => void }).unref?.();
	return { stop: () => clearInterval(timer) };
}
