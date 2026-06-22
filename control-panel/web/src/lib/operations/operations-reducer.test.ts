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

/** Build an OperationsState with sensible defaults for the fields under test. */
function makeState(partial: Partial<OperationsState>): OperationsState {
	return {
		ops: [],
		expandedId: null,
		finished: [],
		statuses: {},
		...partial,
	};
}

describe("operationsReducer", () => {
	it("start adds the op and sets expandedId", () => {
		const state = operationsReducer(makeState({}), {
			type: "start",
			op: opA,
		});
		expect(state.ops).toHaveLength(1);
		expect(state.ops[0]).toEqual(opA);
		expect(state.expandedId).toBe("job-a");
	});

	it("start does not duplicate an existing op", () => {
		const state = operationsReducer(makeState({ ops: [opA] }), {
			type: "start",
			op: opA,
		});
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBe("job-a");
	});

	it("start re-targets expandedId when another op is already expanded", () => {
		const state = operationsReducer(
			makeState({ ops: [opB], expandedId: "job-b" }),
			{ type: "start", op: opA }
		);
		expect(state.ops).toHaveLength(2);
		expect(state.expandedId).toBe("job-a");
	});

	it("minimize clears expandedId but keeps the op", () => {
		const state = operationsReducer(
			makeState({ ops: [opA], expandedId: "job-a" }),
			{ type: "minimize" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBeNull();
	});

	it("expand sets expandedId", () => {
		const state = operationsReducer(
			makeState({ ops: [opA, opB], expandedId: "job-a" }),
			{ type: "expand", jobId: "job-b" }
		);
		expect(state.expandedId).toBe("job-b");
		expect(state.ops).toHaveLength(2);
	});

	it("dismiss removes the op and clears expandedId if it was expanded", () => {
		const state = operationsReducer(
			makeState({ ops: [opA, opB], expandedId: "job-a" }),
			{ type: "dismiss", jobId: "job-a" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.ops[0]).toEqual(opB);
		expect(state.expandedId).toBeNull();
	});

	it("dismiss does not clear expandedId when a different op is dismissed", () => {
		const state = operationsReducer(
			makeState({ ops: [opA, opB], expandedId: "job-b" }),
			{ type: "dismiss", jobId: "job-a" }
		);
		expect(state.ops).toHaveLength(1);
		expect(state.expandedId).toBe("job-b");
	});

	it("finish marks an op as finished and records its terminal status", () => {
		const state = operationsReducer(makeState({ ops: [opA] }), {
			type: "finish",
			jobId: "job-a",
			status: "succeeded",
		});
		expect(state.finished).toContain("job-a");
		expect(state.statuses["job-a"]).toBe("succeeded");
		expect(state.ops).toHaveLength(1);
	});

	it("finish is idempotent for `finished` but updates the recorded status", () => {
		const state = operationsReducer(
			makeState({
				ops: [opA],
				finished: ["job-a"],
				statuses: { "job-a": "running" },
			}),
			{ type: "finish", jobId: "job-a", status: "failed" }
		);
		expect(state.finished).toHaveLength(1);
		expect(state.statuses["job-a"]).toBe("failed");
	});

	it("dismiss removes jobId from finished and drops its status", () => {
		const state = operationsReducer(
			makeState({
				ops: [opA],
				finished: ["job-a"],
				statuses: { "job-a": "succeeded" },
			}),
			{ type: "dismiss", jobId: "job-a" }
		);
		expect(state.ops).toHaveLength(0);
		expect(state.finished).not.toContain("job-a");
		expect(state.statuses["job-a"]).toBeUndefined();
	});

	it("rehydrate restores ops, finished and statuses", () => {
		const state = operationsReducer(makeState({}), {
			type: "rehydrate",
			state: {
				ops: [opA],
				finished: ["job-a"],
				statuses: { "job-a": "canceled" },
			},
		});
		expect(state.ops).toEqual([opA]);
		expect(state.finished).toEqual(["job-a"]);
		expect(state.statuses["job-a"]).toBe("canceled");
	});

	it("isRunning-style: op without siteId+kind match in finished is running", () => {
		const state = makeState({ ops: [opA, opB], finished: ["job-b"] });
		const backupRunning = state.ops.some(
			(o) =>
				o.siteId === "site-1" &&
				o.kind === "backup" &&
				!state.finished.includes(o.jobId)
		);
		const restoreRunning = state.ops.some(
			(o) =>
				o.siteId === "site-1" &&
				o.kind === "restore" &&
				!state.finished.includes(o.jobId)
		);
		expect(backupRunning).toBe(true);
		expect(restoreRunning).toBe(false);
	});
});
