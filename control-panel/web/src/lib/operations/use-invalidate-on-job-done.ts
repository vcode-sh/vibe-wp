import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { JobStatus } from "@/data/types";
import { useOperations } from "./operations-provider";

/**
 * Refresh a page's data when the background jobs it launched finish.
 *
 * Tray-driven jobs (plugin/theme/core updates, perf apply, staging publish,
 * lifecycle start/stop/restart) run in the operations tray and record a terminal
 * status, but the page that launched them does NOT re-read on its own — so the
 * UI goes stale and "lies" about the result (a deactivated plugin still shows
 * active, a stopped site still shows a green dot). This hook watches
 * isRunning(siteId, kind) for a true→false transition (the job finished) and
 * invalidates the given query keys, optionally calling onDone with the terminal
 * status so the caller can toast. Generalizes the bespoke verify-watcher in
 * backups.tsx so every action surface gets the same realtime behavior.
 */
export function useInvalidateOnJobDone(
	siteId: string,
	kinds: readonly string[],
	queryKeys: readonly (readonly unknown[])[],
	onDone?: (status: JobStatus, kind: string) => void
): void {
	const queryClient = useQueryClient();
	const { isRunning, getStatus } = useOperations();
	const wasRunning = useRef<Record<string, boolean>>({});
	// A signature that flips whenever any watched kind's running-state changes —
	// the only thing the effect needs to react to.
	const signature = kinds
		.map((k) => (isRunning(siteId, k) ? "1" : "0"))
		.join("");

	// biome-ignore lint/correctness/useExhaustiveDependencies: deliberately driven by the running-state signature; the kinds/keys/callbacks are read at edge time
	useEffect(() => {
		let finishedAny = false;
		for (const kind of kinds) {
			const now = isRunning(siteId, kind);
			const was = wasRunning.current[kind] ?? false;
			if (was && !now) {
				finishedAny = true;
				onDone?.(getStatus(siteId, kind) ?? "succeeded", kind);
			}
			wasRunning.current[kind] = now;
		}
		if (finishedAny) {
			for (const queryKey of queryKeys) {
				queryClient.invalidateQueries({ queryKey });
			}
		}
	}, [signature]);
}
