import { useEffect, useReducer, useRef } from "react";

import type { StreamEvent } from "@/data/types";
import { initialLiveState, type LiveState, liveReducer } from "./live-reducer";
import {
	backoffDelay,
	isJobGoneError,
	MAX_RECONNECT_ATTEMPTS,
} from "./reconnect";

type Source = (
	signal: AbortSignal
) => AsyncIterable<StreamEvent> | Promise<AsyncIterable<StreamEvent>>;

type Dispatch = (action: Parameters<typeof liveReducer>[1]) => void;

// How a single subscription attempt resolved.
// - "done": a terminal `done` event arrived — stop for good.
// - "gone": the job is permanently gone (server NOT_FOUND) — stop, unrecoverable.
// - "dropped": the stream ended/errored transiently — eligible for reconnect.
// - "aborted": unmounted/deactivated mid-flight — stop quietly, no state change.
type AttemptOutcome = "done" | "gone" | "dropped" | "aborted";

interface Attempt {
	gotEvent: boolean;
	outcome: AttemptOutcome;
}

async function consume(
	iterable: AsyncIterable<StreamEvent>,
	isLive: () => boolean,
	dispatch: Dispatch
): Promise<Attempt> {
	let gotEvent = false;
	for await (const event of iterable) {
		if (!isLive()) {
			return { outcome: "aborted", gotEvent };
		}
		gotEvent = true;
		dispatch({ event, at: Date.now() });
		if (event.done) {
			return { outcome: "done", gotEvent };
		}
	}
	return { outcome: "dropped", gotEvent };
}

// Open one subscription, consume it, and classify how it ended. Errors are
// mapped to an outcome rather than thrown so the caller's loop stays a flat
// state machine: a gone job is unrecoverable, anything else is a transient drop.
async function attemptOnce(
	makeSource: (signal: AbortSignal) => ReturnType<Source>,
	signal: AbortSignal,
	isLive: () => boolean,
	dispatch: Dispatch
): Promise<Attempt> {
	try {
		const iterable = await makeSource(signal);
		return await consume(iterable, isLive, dispatch);
	} catch (error) {
		if (!isLive()) {
			return { outcome: "aborted", gotEvent: false };
		}
		return {
			outcome: isJobGoneError(error) ? "gone" : "dropped",
			gotEvent: false,
		};
	}
}

// Drives one (re)subscription session: keeps re-subscribing across transient
// drops with exponential backoff until a terminal `done`, a gone job, an abort,
// or the retry budget runs out. Lives at module scope (not inside the effect) so
// its branching doesn't inflate the hook's cognitive complexity.
async function runLoop(
	makeSource: (signal: AbortSignal) => ReturnType<Source>,
	signal: AbortSignal,
	isLive: () => boolean,
	dispatch: Dispatch,
	wait: (ms: number) => Promise<void>
): Promise<void> {
	// Consecutive failed attempts that produced no event. Reset whenever an
	// attempt delivers at least one event, so a stream that flaps but keeps
	// making progress is never starved by the retry budget.
	let failures = 0;
	let firstAttempt = true;
	while (isLive()) {
		// On reconnect the server replays its buffered lines from the start; clear
		// first so the replay rebuilds the list without duplicates. (First
		// subscription already starts empty; `logsFollow` streams fresh lines.)
		if (!firstAttempt) {
			dispatch({ clearLines: true, at: Date.now() });
		}
		firstAttempt = false;

		const attempt = await attemptOnce(makeSource, signal, isLive, dispatch);
		if (
			!isLive() ||
			attempt.outcome === "aborted" ||
			attempt.outcome === "done"
		) {
			return;
		}
		if (attempt.outcome === "gone") {
			// Job genuinely gone (evicted past TTL): retrying can't recover it.
			dispatch({ unrecoverable: true, at: Date.now() });
			return;
		}
		failures = attempt.gotEvent ? 0 : failures + 1;
		if (failures >= MAX_RECONNECT_ATTEMPTS) {
			// Retry budget exhausted: the stream looks truly dead. Surface a
			// terminal-ish "unrecoverable" rather than retry forever or fake a
			// success — the consumer can fall back to an authoritative fetch.
			dispatch({ unrecoverable: true, at: Date.now() });
			return;
		}
		dispatch({ reconnecting: true, at: Date.now() });
		await wait(backoffDelay(failures));
	}
}

/**
 * Subscribe to a live event stream, surviving transient drops by re-subscribing
 * with exponential backoff. Stops on a terminal `done`, on a genuinely-gone job
 * (server NOT_FOUND), or after the reconnect budget is exhausted — the last two
 * surface as `unrecoverable` (a non-`done` terminal-ish signal). Returns the
 * accumulated {@link LiveState}; callers treat `done` and `unrecoverable` as the
 * two ways the stream can finish.
 */
export function useLiveStream(source: Source, active: boolean): LiveState {
	const [state, dispatch] = useReducer(
		liveReducer,
		Date.now(),
		initialLiveState
	);
	// Hold the latest source in a ref so the subscription effect depends only on
	// `active` — the caller's source closure changes identity every render but we
	// must not re-subscribe on every render.
	const sourceRef = useRef(source);
	sourceRef.current = source;

	useEffect(() => {
		if (!active) {
			return;
		}
		// Reset state for a fresh (re)subscription so a reused, still-mounted
		// runner doesn't show the previous operation's lines.
		dispatch({ reset: true, at: Date.now() });

		let live = true;
		const ac = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const isLive = () => live;
		const makeSource = (signal: AbortSignal) => sourceRef.current(signal);
		const wait = (ms: number) =>
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, ms);
			});

		runLoop(makeSource, ac.signal, isLive, dispatch, wait).catch(
			() => undefined
		);

		return () => {
			live = false;
			if (timer) {
				clearTimeout(timer);
			}
			ac.abort();
		};
	}, [active]);

	return state;
}
