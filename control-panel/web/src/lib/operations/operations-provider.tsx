import { createContext, useContext, useEffect, useReducer } from "react";

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
}

type OperationsAction =
	| { type: "start"; op: Operation }
	| { type: "expand"; jobId: string }
	| { type: "minimize" }
	| { type: "dismiss"; jobId: string }
	| { type: "finish"; jobId: string }
	| { type: "rehydrate"; state: Pick<OperationsState, "ops" | "finished"> };

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
			return {
				ops: state.ops.filter((o) => o.jobId !== action.jobId),
				finished: state.finished.filter((id) => id !== action.jobId),
				expandedId: state.expandedId === action.jobId ? null : state.expandedId,
			};
		}
		case "finish": {
			if (state.finished.includes(action.jobId)) {
				return state;
			}
			return { ...state, finished: [...state.finished, action.jobId] };
		}
		case "rehydrate": {
			return {
				...state,
				ops: action.state.ops,
				finished: action.state.finished,
			};
		}
		default: {
			return state;
		}
	}
}

const STORAGE_KEY = "vibe:operations";

function loadFromStorage(): Pick<OperationsState, "ops" | "finished"> | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as unknown;
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			"ops" in parsed &&
			"finished" in parsed &&
			Array.isArray((parsed as { ops: unknown }).ops) &&
			Array.isArray((parsed as { finished: unknown }).finished)
		) {
			return parsed as Pick<OperationsState, "ops" | "finished">;
		}
		return null;
	} catch {
		return null;
	}
}

const initialState: OperationsState = {
	ops: [],
	expandedId: null,
	finished: [],
};

interface OperationsContextValue {
	dismiss: (jobId: string) => void;
	expand: (jobId: string) => void;
	expandedId: string | null;
	finish: (jobId: string) => void;
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

	// Persist ops + finished whenever they change (skip expandedId — reopen collapsed).
	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ ops: state.ops, finished: state.finished })
			);
		} catch {
			// Storage quota exceeded or private-mode restriction — ignore.
		}
	}, [state.ops, state.finished]);

	const value: OperationsContextValue = {
		ops: state.ops,
		expandedId: state.expandedId,
		start: (op) =>
			dispatch({ type: "start", op: { ...op, startedAt: Date.now() } }),
		expand: (jobId) => dispatch({ type: "expand", jobId }),
		minimize: () => dispatch({ type: "minimize" }),
		dismiss: (jobId) => dispatch({ type: "dismiss", jobId }),
		finish: (jobId) => dispatch({ type: "finish", jobId }),
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
