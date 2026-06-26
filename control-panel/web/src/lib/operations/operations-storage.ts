import type { OperationsState } from "./operations-state";

/** The slice of operations state we persist across reloads (no expandedId). */
export type PersistedState = Pick<
	OperationsState,
	"ops" | "finished" | "statuses"
>;

const STORAGE_KEY = "vibe:operations";

// Finished ops older than this are dropped on load so the tray doesn't try to
// re-stream long-gone jobs whose server-side records were already evicted.
const FINISHED_TTL_MS = 24 * 60 * 60 * 1000; // 24h
// Hard cap on the total number of stored ops so storage can't grow unbounded;
// when exceeded we drop the oldest finished ops first (running ops are kept).
const MAX_STORED_OPS = 50;

/**
 * Drop finished ops past the TTL and cap the total count, keeping running ops
 * and the most recent finished ops. The persisted terminal `statuses` map stays
 * authoritative for whatever finished ops survive.
 */
function pruneState(state: PersistedState, nowMs: number): PersistedState {
	const finishedSet = new Set(state.finished);
	// Keep every still-running op; keep finished ops only while within the TTL.
	let kept = state.ops.filter((op) => {
		if (!finishedSet.has(op.jobId)) {
			return true;
		}
		return nowMs - op.startedAt < FINISHED_TTL_MS;
	});

	if (kept.length > MAX_STORED_OPS) {
		const running = kept.filter((op) => !finishedSet.has(op.jobId));
		const finished = kept
			.filter((op) => finishedSet.has(op.jobId))
			.sort((a, b) => b.startedAt - a.startedAt);
		// Running ops are always retained; trim the oldest finished to fit the cap.
		const finishedBudget = Math.max(0, MAX_STORED_OPS - running.length);
		const keptFinished = finished.slice(0, finishedBudget);
		const keptIds = new Set(
			[...running, ...keptFinished].map((op) => op.jobId)
		);
		kept = kept.filter((op) => keptIds.has(op.jobId));
	}

	const keptIds = new Set(kept.map((op) => op.jobId));
	return {
		ops: kept,
		finished: state.finished.filter((id) => keptIds.has(id)),
		statuses: Object.fromEntries(
			Object.entries(state.statuses).filter(([id]) => keptIds.has(id))
		),
	};
}

export function loadFromStorage(): PersistedState | null {
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
			const p = parsed as Partial<PersistedState>;
			return pruneState(
				{
					ops: p.ops ?? [],
					finished: p.finished ?? [],
					// `statuses` was added later; tolerate older persisted shapes.
					statuses: p.statuses ?? {},
				},
				Date.now()
			);
		}
		return null;
	} catch {
		return null;
	}
}

export function saveToStorage(state: PersistedState): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Storage quota exceeded or private-mode restriction — ignore.
	}
}
