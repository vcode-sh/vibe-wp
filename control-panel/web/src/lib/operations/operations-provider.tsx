import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	useContext,
	useEffect,
	useMemo,
	useReducer,
} from "react";
import type { JobStatus } from "@/data/types";
import { client } from "@/lib/orpc/client";
import { invalidateOperationLifecycleEvent } from "@/lib/realtime/operation-events";
import {
	createOperationInvalidator,
	type QueryClientLike,
} from "@/lib/realtime/query-invalidation";
import {
	initialOperationsState,
	type Operation,
	operationsReducer,
} from "./operations-state";
import { loadFromStorage, saveToStorage } from "./operations-storage";

const FINISHED_OPERATION_AUTO_DISMISS_MS = 5000;
const OPERATION_EVENTS_RECONNECT_MS = 2000;

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
	// Authoritative terminal status for a specific job once it has finished;
	// null while still running or if the job is unknown. Lets the tray render a
	// finished op from persisted state instead of re-streaming an evicted job.
	statusOf: (jobId: string) => JobStatus | null;
}

const OperationsContext = createContext<OperationsContextValue | null>(null);

function wait(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = window.setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				window.clearTimeout(timer);
				resolve();
			},
			{ once: true }
		);
	});
}

export function OperationsProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [state, dispatch] = useReducer(
		operationsReducer,
		initialOperationsState
	);
	const queryClient = useQueryClient();
	const invalidator = useMemo(
		() => createOperationInvalidator(queryClient as unknown as QueryClientLike),
		[queryClient]
	);

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

	useEffect(() => {
		const visibleFinished = state.finished.filter(
			(jobId) =>
				jobId !== state.expandedId && state.ops.some((op) => op.jobId === jobId)
		);
		if (visibleFinished.length === 0) {
			return;
		}
		const timers = visibleFinished.map((jobId) =>
			window.setTimeout(
				() => dispatch({ type: "dismiss", jobId }),
				FINISHED_OPERATION_AUTO_DISMISS_MS
			)
		);
		return () => {
			for (const timer of timers) {
				window.clearTimeout(timer);
			}
		};
	}, [state.expandedId, state.finished, state.ops]);

	useEffect(() => {
		let live = true;
		const ac = new AbortController();
		async function run() {
			while (live) {
				try {
					const events = await client.operationsEvents(
						{},
						{ signal: ac.signal }
					);
					for await (const event of events) {
						if (!live) {
							return;
						}
						invalidateOperationLifecycleEvent(invalidator, event);
					}
				} catch {
					if (!live) {
						return;
					}
				}
				await wait(OPERATION_EVENTS_RECONNECT_MS, ac.signal);
			}
		}
		run().catch(() => undefined);
		return () => {
			live = false;
			ac.abort();
		};
	}, [invalidator]);

	const value: OperationsContextValue = {
		ops: state.ops,
		expandedId: state.expandedId,
		start: (op) => {
			const full = { ...op, startedAt: Date.now() };
			dispatch({ type: "start", op: full });
			invalidator.start({
				jobId: full.jobId,
				phase: "start",
				siteId: full.siteId,
				uiKind: full.kind,
			});
		},
		expand: (jobId) => dispatch({ type: "expand", jobId }),
		minimize: () => dispatch({ type: "minimize" }),
		dismiss: (jobId) => dispatch({ type: "dismiss", jobId }),
		finish: (jobId, status) => {
			const op = state.ops.find((candidate) => candidate.jobId === jobId);
			invalidator.finish({
				jobId,
				phase: "finish",
				siteId: op?.siteId ?? "server",
				uiKind: op?.kind ?? "unknown",
			});
			dispatch({ type: "finish", jobId, status });
		},
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
		statusOf: (jobId) =>
			state.finished.includes(jobId) ? (state.statuses[jobId] ?? null) : null,
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
