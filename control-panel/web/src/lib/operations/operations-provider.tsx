import { createContext, useContext, useReducer } from "react";

export interface Operation {
	jobId: string;
	kind: string;
	startedAt: number;
	title: string;
}

interface OperationsState {
	expandedId: string | null;
	ops: Operation[];
}

type OperationsAction =
	| { type: "start"; op: Operation }
	| { type: "expand"; jobId: string }
	| { type: "minimize" }
	| { type: "dismiss"; jobId: string };

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
				expandedId: state.expandedId === action.jobId ? null : state.expandedId,
			};
		}
		default: {
			return state;
		}
	}
}

const initialState: OperationsState = { ops: [], expandedId: null };

interface OperationsContextValue {
	dismiss: (jobId: string) => void;
	expand: (jobId: string) => void;
	expandedId: string | null;
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

	const value: OperationsContextValue = {
		ops: state.ops,
		expandedId: state.expandedId,
		start: (op) =>
			dispatch({ type: "start", op: { ...op, startedAt: Date.now() } }),
		expand: (jobId) => dispatch({ type: "expand", jobId }),
		minimize: () => dispatch({ type: "minimize" }),
		dismiss: (jobId) => dispatch({ type: "dismiss", jobId }),
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
