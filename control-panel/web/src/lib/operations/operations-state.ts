import type { JobStatus } from "@/data/types";

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
	statuses: Record<string, JobStatus>;
}

export type OperationsAction =
	| { type: "start"; op: Operation }
	| { type: "expand"; jobId: string }
	| { type: "minimize" }
	| { type: "dismiss"; jobId: string }
	| { type: "finish"; jobId: string; status: JobStatus }
	| {
			type: "rehydrate";
			state: Pick<OperationsState, "ops" | "finished" | "statuses">;
	  };

export const initialOperationsState: OperationsState = {
	ops: [],
	expandedId: null,
	finished: [],
	statuses: {},
};

export function operationsReducer(
	state: OperationsState,
	action: OperationsAction
): OperationsState {
	switch (action.type) {
		case "start": {
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
