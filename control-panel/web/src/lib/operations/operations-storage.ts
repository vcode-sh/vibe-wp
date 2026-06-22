import type { OperationsState } from "./operations-provider";

/** The slice of operations state we persist across reloads (no expandedId). */
export type PersistedState = Pick<
	OperationsState,
	"ops" | "finished" | "statuses"
>;

const STORAGE_KEY = "vibe:operations";

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
			return {
				ops: p.ops ?? [],
				finished: p.finished ?? [],
				// `statuses` was added later; tolerate older persisted shapes.
				statuses: p.statuses ?? {},
			};
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
