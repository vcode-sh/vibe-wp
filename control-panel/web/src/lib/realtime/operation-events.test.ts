import { describe, expect, it, vi } from "vitest";

import { invalidateOperationLifecycleEvent } from "./operation-events";

describe("operation lifecycle event invalidation", () => {
	it("routes remote start and finish events through the central invalidator", () => {
		const invalidator = { finish: vi.fn(), start: vi.fn() };

		invalidateOperationLifecycleEvent(invalidator, {
			jobId: "job-1",
			kind: "backup",
			phase: "start",
			siteId: "site-a",
		});
		invalidateOperationLifecycleEvent(invalidator, {
			jobId: "job-1",
			kind: "backup",
			phase: "finish",
			siteId: "site-a",
			status: "succeeded",
		});

		expect(invalidator.start).toHaveBeenCalledWith({
			jobId: "job-1",
			phase: "start",
			siteId: "site-a",
			uiKind: "backup",
		});
		expect(invalidator.finish).toHaveBeenCalledWith({
			jobId: "job-1",
			phase: "finish",
			siteId: "site-a",
			uiKind: "backup",
		});
	});
});
