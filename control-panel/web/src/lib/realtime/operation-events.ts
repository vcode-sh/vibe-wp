import type { OperationLifecycleEvent } from "@/data/types";
import type { OperationInvalidationEvent } from "./invalidation-rules";

export interface OperationEventInvalidator {
	finish: (event: OperationInvalidationEvent) => void;
	start: (event: OperationInvalidationEvent) => void;
}

export function invalidateOperationLifecycleEvent(
	invalidator: OperationEventInvalidator,
	event: OperationLifecycleEvent
): void {
	if (event.phase === "start") {
		invalidator.start({
			jobId: event.jobId,
			phase: "start",
			siteId: event.siteId,
			uiKind: event.kind,
		});
		return;
	}
	invalidator.finish({
		jobId: event.jobId,
		phase: "finish",
		siteId: event.siteId,
		uiKind: event.kind,
	});
}
