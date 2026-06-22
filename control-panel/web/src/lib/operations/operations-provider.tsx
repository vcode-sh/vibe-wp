import { createContext, useContext, useEffect, useReducer } from "react";
import type { JobStatus } from "@/data/types";
import { loadFromStorage, saveToStorage } from "./operations-storage";

export interface Operation {
	jobId: string;
	kind: string;
	siteId: string;
	startedAt: number;
	title: string;
}

export interface OperationsState {
	expandedId: string | null;
	finished: string[];
	ops: Operation[];
	// Terminal status keyed by jobId, recorded when an op finishes. Lets callers
	// distinguish a successful completion from a failure/cancel after the fact.
	statuses: Record<string, JobStatus>;
}

type OperationsAction =
	| { type: "start"; op: Operation }
	| { type: "expand"; jobId: string }
	| { type: "minimize" }
	| { type: "dismiss"; jobId: string }
	| { type: "finish"; jobId: string; status: JobStatus }
	| {
			type: "rehydrate";
			state: Pick<OperationsState, "ops" | "finished" | "statuses">;
	  };

export function operationsReducer(
	state: OperationsState,
	action: OperationsAction
): OperationsState {
	switch (action.type) {
		case "start": {
			// Dedup by jobId; op metadata (title/kind/startedAt) is immutable once
			// registered. Re-surface the existing op by setting expandedId.
			const exists = state.ops.some((o) => o.jobId === action.op.jobId);
			return {
				...state,
				ops: exists ? state.ops : [...state.ops, action.op],
				expandedId: action.op.jobId,
			};
		}
		case "expand": {
			return { ...state, expandedId: action.jobId };
		}
		case "minimize": {
			return { ...state, expandedId: null };
		}
		case "dismiss": {
			const statuses = Object.fromEntries(
				Object.entries(state.statuses).filter(([id]) => id !== action.jobId)
			);
			return {
				ops: state.ops.filter((o) => o.jobId !== action.jobId),
				finished: state.finished.filter((id) => id !== action.jobId),
				expandedId: state.expandedId === action.jobId ? null : state.expandedId,
				statuses,
			};
		}
		case "finish": {
			// Record the terminal status even when the job was already marked
			// finished (e.g. tray + expanded dialog both fire) — last write wins.
			const statuses = { ...state.statuses, [action.jobId]: action.status };
			if (state.finished.includes(action.jobId)) {
				return { ...state, statuses };
			}
			return {
				...state,
				finished: [...state.finished, action.jobId],
				statuses,
			};
		}
		case "rehydrate": {
			return {
				...state,
				ops: action.state.ops,
				finished: action.state.finished,
				statuses: action.state.statuses,
			};
		}
		default: {
			return state;
		}
	}
}

const initialState: OperationsState = {
	ops: [],
	expandedId: null,
	finished: [],
	statuses: {},
};

interface OperationsContextValue {
	dismiss: (jobId: string) => void;
	expand: (jobId: string) => void;
	expandedId: string | null;
	finish: (jobId: string, status: JobStatus) => void;
	// Terminal status of the most recently started op for (siteId, kind), once it
	// has finished; null while still running or if no such op exists.
	getStatus: (siteId: string, kind: string) => JobStatus | null;
	isRunning: (siteId: string, kind: string) => boolean;
	minimize: () => void;
	ops: Operation[];
	start: (op: Omit<Operation, "startedAt">) => void;
}

const OperationsContext = createContext<OperationsContextValue | null>(null);

export function OperationsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [state, dispatch] = useReducer(operationsReducer, initialState);

	// Rehydrate from localStorage on mount (client-only).
	useEffect(() => {
		const saved = loadFromStorage();
		if (saved) {
			dispatch({ type: "rehydrate", state: saved });
		}
	}, []);

	// Persist ops + finished + statuses on change (skip expandedId — reopen collapsed).
	useEffect(() => {
		saveToStorage({
			ops: state.ops,
			finished: state.finished,
			statuses: state.statuses,
		});
	}, [state.ops, state.finished, state.statuses]);

	const value: OperationsContextValue = {
		ops: state.ops,
		expandedId: state.expandedId,
		start: (op) =>
			dispatch({ type: "start", op: { ...op, startedAt: Date.now() } }),
		expand: (jobId) => dispatch({ type: "expand", jobId }),
		minimize: () => dispatch({ type: "minimize" }),
		dismiss: (jobId) => dispatch({ type: "dismiss", jobId }),
		finish: (jobId, status) => dispatch({ type: "finish", jobId, status }),
		getStatus: (siteId, kind) => {
			// The newest matching op (ops are appended in start order).
			const op = [...state.ops]
				.reverse()
				.find((o) => o.siteId === siteId && o.kind === kind);
			if (!(op && state.finished.includes(op.jobId))) {
				return null;
			}
			return state.statuses[op.jobId] ?? null;
		},
		isRunning: (siteId, kind) =>
			state.ops.some(
				(o) =>
					o.siteId === siteId &&
					o.kind === kind &&
					!state.finished.includes(o.jobId)
			),
	};

	return (
		<OperationsContext.Provider value={value}>
			{children}
		</OperationsContext.Provider>
	);
}

export function useOperations(): OperationsContextValue {
	const ctx = useContext(OperationsContext);
	if (!ctx) {
		throw new Error("useOperations must be used within OperationsProvider");
	}
	return ctx;
}
