import type { JobStatus, StreamEvent } from "@/data/types";

export interface LiveState {
	done: boolean;
	lastEventAt: number;
	lastLine: string;
	lastLineAt: number;
	lines: string[];
	// Additive: true while the stream is between subscriptions (backing off and
	// retrying after a transient drop). Never set once `done` is true.
	reconnecting: boolean;
	startedAt: number;
	status: JobStatus;
	// Additive: a non-`done` terminal-ish signal. Set when the job is genuinely
	// gone (server NOT_FOUND) or reconnect retries were exhausted. NEVER implies
	// success — consumers should treat it as "outcome unknown / stop waiting".
	unrecoverable: boolean;
}

export function initialLiveState(nowMs: number): LiveState {
	return {
		lines: [],
		status: "running",
		done: false,
		lastLine: "",
		lastEventAt: nowMs,
		lastLineAt: nowMs,
		startedAt: nowMs,
		reconnecting: false,
		unrecoverable: false,
	};
}

export type LiveAction =
	| { reset: true; at: number }
	// Clear accumulated lines before a reconnect attempt re-consumes the stream.
	// The server replays its line buffer from the start on every subscription, so
	// clearing first lets the replay rebuild the canonical list instead of
	// appending duplicates. Preserves `startedAt`/`status`/`done`.
	| { clearLines: true; at: number }
	// Backoff started: stream dropped without `done`, retrying after a delay.
	| { reconnecting: true; at: number }
	// Gave up: NOT_FOUND or retry budget exhausted. Terminal-ish, not `done`.
	| { unrecoverable: true; at: number }
	| { event: StreamEvent; at: number };

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
	if ("reset" in action) {
		return initialLiveState(action.at);
	}
	if ("clearLines" in action) {
		if (state.done) {
			return state;
		}
		return { ...state, lines: [], lastLine: "" };
	}
	if ("reconnecting" in action) {
		// A real `done` already won the race — never re-open a finished stream.
		if (state.done) {
			return state;
		}
		return { ...state, reconnecting: true, lastEventAt: action.at };
	}
	if ("unrecoverable" in action) {
		if (state.done) {
			return state;
		}
		return {
			...state,
			reconnecting: false,
			unrecoverable: true,
			lastEventAt: action.at,
		};
	}
	const { event, at } = action;
	// Any received event proves the connection is live again — clear reconnecting.
	const next: LiveState = {
		...state,
		lastEventAt: at,
		status: event.status,
		reconnecting: false,
	};
	if (event.done) {
		next.done = true;
		return next;
	}
	if (event.line.length > 0) {
		next.lines = [...state.lines, event.line].slice(-1000);
		next.lastLine = event.line;
		next.lastLineAt = at;
	}
	return next;
}
