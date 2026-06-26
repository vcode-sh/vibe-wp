import { describe, expect, it } from "vitest";

import {
	publishOperationLifecycleEvent,
	subscribeOperationLifecycleEvents,
} from "./job-events";

describe("operation lifecycle events", () => {
	it("broadcasts job metadata to every active subscriber", async () => {
		const first = subscribeOperationLifecycleEvents()[Symbol.asyncIterator]();
		const second = subscribeOperationLifecycleEvents()[Symbol.asyncIterator]();
		const firstNext = first.next();
		const secondNext = second.next();

		publishOperationLifecycleEvent({
			jobId: "job-1",
			kind: "backup",
			phase: "finish",
			siteId: "site-a",
			status: "succeeded",
		});

		await expect(firstNext).resolves.toMatchObject({
			value: { jobId: "job-1", kind: "backup", phase: "finish" },
		});
		await expect(secondNext).resolves.toMatchObject({
			value: { jobId: "job-1", kind: "backup", phase: "finish" },
		});

		await first.return?.();
		await second.return?.();
	});
});
