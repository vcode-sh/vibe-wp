import { describe, expect, it } from "vitest";
import type { Operation, OperationsState } from "./operations-provider";
import { operationsReducer } from "./operations-provider";

const opA: Operation = {
	jobId: "job-a",
	title: "Backing up",
	kind: "backup",
	siteId: "site-1",
	startedAt: 1000,
};
const opB: Operation = {
	jobId: "job-b",
	title: "Restoring",
	kind: "restore",
	siteId: "site-1",
	startedAt: 2000,
};

describe("operationsReducer", () => {
	it("start adds the op and sets expandedId", () => {
		const state = operationsReducer(
			{ ops: [], expandedId: null, finished: [] },
			{ type: "start", op: opA }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.ops[0]).toEqual(opA);
		expect(state.expandedId).toBe("job-a");
	});

	it("start does not duplicate an existing op", () => {
		const state = operationsReducer(
			{ ops: [opA], expandedId: null, finished: [] },
			{ type: "start", op: opA }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBe("job-a");
	});

	it("start re-targets expandedId when another op is already expanded", () => {
		const state = operationsReducer(
			{ ops: [opB], expandedId: "job-b", finished: [] },
			{ type: "start", op: opA }
		);
		expect(state.ops).toHaveLength(2);
		expect(state.expandedId).toBe("job-a");
	});

	it("minimize clears expandedId but keeps the op", () => {
		const state = operationsReducer(
			{ ops: [opA], expandedId: "job-a", finished: [] },
			{ type: "minimize" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBeNull();
	});

	it("expand sets expandedId", () => {
		const state = operationsReducer(
			{ ops: [opA, opB], expandedId: "job-a", finished: [] },
			{ type: "expand", jobId: "job-b" }
		);
		expect(state.expandedId).toBe("job-b");
		expect(state.ops).toHaveLength(2);
	});

	it("dismiss removes the op and clears expandedId if it was expanded", () => {
		const state = operationsReducer(
			{ ops: [opA, opB], expandedId: "job-a", finished: [] },
			{ type: "dismiss", jobId: "job-a" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.ops[0]).toEqual(opB);
		expect(state.expandedId).toBeNull();
	});

	it("dismiss does not clear expandedId when a different op is dismissed", () => {
		const state = operationsReducer(
			{ ops: [opA, opB], expandedId: "job-b", finished: [] },
			{ type: "dismiss", jobId: "job-a" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBe("job-b");
	});

	it("finish marks an op as finished", () => {
		const state = operationsReducer(
			{ ops: [opA], expandedId: null, finished: [] },
			{ type: "finish", jobId: "job-a" }
		);
		expect(state.finished).toContain("job-a");
		expect(state.ops).toHaveLength(1);
	});

	it("finish is idempotent", () => {
		const state = operationsReducer(
			{ ops: [opA], expandedId: null, finished: ["job-a"] },
			{ type: "finish", jobId: "job-a" }
		);
		expect(state.finished).toHaveLength(1);
	});

	it("dismiss also removes jobId from finished", () => {
		const state = operationsReducer(
			{ ops: [opA], expandedId: null, finished: ["job-a"] },
			{ type: "dismiss", jobId: "job-a" }
		);
		expect(state.ops).toHaveLength(0);
		expect(state.finished).not.toContain("job-a");
	});

	it("isRunning-style: op without siteId+kind match in finished is running", () => {
		const state: OperationsState = {
			ops: [opA, opB],
			expandedId: null,
			finished: ["job-b"],
		};
		const backupRunning = state.ops.some(
			(o) => o.siteId === "site-1" && o.kind === "backup" && !state.finished.includes(o.jobId)
		);
		const restoreRunning = state.ops.some(
			(o) => o.siteId === "site-1" && o.kind === "restore" && !state.finished.includes(o.jobId)
		);
		expect(backupRunning).toBe(true);
		expect(restoreRunning).toBe(false);
	});
});
