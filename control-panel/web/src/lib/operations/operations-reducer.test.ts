import { describe, expect, it } from "vitest";
import type { Operation } from "./operations-provider";
import { operationsReducer } from "./operations-provider";

const opA: Operation = { jobId: "job-a", title: "Backing up", kind: "backup" };
const opB: Operation = { jobId: "job-b", title: "Restoring", kind: "restore" };

describe("operationsReducer", () => {
	it("start adds the op and sets expandedId", () => {
		const state = operationsReducer(
			{ ops: [], expandedId: null },
			{ type: "start", op: opA }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.ops[0]).toEqual(opA);
		expect(state.expandedId).toBe("job-a");
	});

	it("start does not duplicate an existing op", () => {
		const state = operationsReducer(
			{ ops: [opA], expandedId: null },
			{ type: "start", op: opA }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBe("job-a");
	});

	it("minimize clears expandedId but keeps the op", () => {
		const state = operationsReducer(
			{ ops: [opA], expandedId: "job-a" },
			{ type: "minimize" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBeNull();
	});

	it("expand sets expandedId", () => {
		const state = operationsReducer(
			{ ops: [opA, opB], expandedId: "job-a" },
			{ type: "expand", jobId: "job-b" }
		);
		expect(state.expandedId).toBe("job-b");
		expect(state.ops).toHaveLength(2);
	});

	it("dismiss removes the op and clears expandedId if it was expanded", () => {
		const state = operationsReducer(
			{ ops: [opA, opB], expandedId: "job-a" },
			{ type: "dismiss", jobId: "job-a" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.ops[0]).toEqual(opB);
		expect(state.expandedId).toBeNull();
	});

	it("dismiss does not clear expandedId when a different op is dismissed", () => {
		const state = operationsReducer(
			{ ops: [opA, opB], expandedId: "job-b" },
			{ type: "dismiss", jobId: "job-a" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBe("job-b");
	});
});
