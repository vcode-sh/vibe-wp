import type { JobStatus, StreamEvent } from "@/data/types";

export interface LiveState {
	done: boolean;
	lastEventAt: number;
	lastLine: string;
	lines: string[];
	startedAt: number;
	status: JobStatus;
}

export function initialLiveState(nowMs: number): LiveState {
	return {
		lines: [],
		status: "running",
		done: false,
		lastLine: "",
		lastEventAt: nowMs,
		startedAt: nowMs,
	};
}

export type LiveAction =
	| { reset: true; at: number }
	| { event: StreamEvent; at: number };

export function liveReducer(state: LiveState, action: LiveAction): LiveState {
	if ("reset" in action) {
		return initialLiveState(action.at);
	}
	const { event, at } = action;
	const next: LiveState = { ...state, lastEventAt: at, status: event.status };
	if (event.done) {
		next.done = true;
		return next;
	}
	if (event.line.length > 0) {
		next.lines = [...state.lines, event.line];
		next.lastLine = event.line;
	}
	return next;
}
