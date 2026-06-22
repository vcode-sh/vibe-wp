// Reconnect/backoff policy for the live SSE stream (`useLiveStream`).
//
// The oRPC event-iterator stream can drop without a terminal `done` event for
// benign reasons: a reverse-proxy idle timeout, a connection reset, or the tab
// being backgrounded. When that happens for a still-active operation we
// re-subscribe with exponential backoff instead of silently ending the stream.
//
// A genuinely gone job is different: the server throws ORPCError NOT_FOUND once
// the registry entry is evicted past its TTL. Retrying then is pointless, so we
// stop and surface a terminal-ish "unrecoverable" signal.

// Base delay for the first reconnect attempt.
const BASE_DELAY_MS = 1000;
// Upper bound for a single backoff wait (delays double until they hit this).
const MAX_DELAY_MS = 15_000;
// Consecutive failed reconnects (no event received in between) before giving
// up. With the schedule below this is well over a minute of retrying.
export const MAX_RECONNECT_ATTEMPTS = 8;

/**
 * Backoff delay for the Nth consecutive reconnect attempt (1-indexed):
 * ~1s, 2s, 4s, 8s, 15s (capped), each with up to +25% jitter so a fleet of
 * panels doesn't reconnect in lockstep after a shared proxy blip.
 */
export function backoffDelay(attempt: number): number {
	const exponent = Math.max(0, attempt - 1);
	const capped = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** exponent);
	const jitter = capped * 0.25 * Math.random();
	return Math.round(capped + jitter);
}

/**
 * True when the stream ended because the job is genuinely gone (evicted past
 * its TTL): the server throws ORPCError NOT_FOUND and the oRPC client rehydrates
 * it into an error carrying `code: "NOT_FOUND"`. Reconnecting cannot recover
 * this, so the caller stops and reports it as unrecoverable.
 *
 * Detection is duck-typed on `code` rather than `instanceof ORPCError`: the
 * error crosses an async-iterator/serialization boundary, so identity checks are
 * brittle. Any other thrown value (network/fetch error, abort, generic Error) is
 * treated as transient and retried.
 */
export function isJobGoneError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) {
		return false;
	}
	const code = (error as { code?: unknown }).code;
	return code === "NOT_FOUND";
}
