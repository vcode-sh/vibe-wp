import { describe, expect, it } from "vitest";

import { initialLiveState, liveReducer } from "./live-reducer";

describe("liveReducer", () => {
	it("appends non-empty lines and tracks lastEventAt; heartbeats refresh liveness only", () => {
		let s = initialLiveState(1000);
		s = liveReducer(s, {
			event: { line: "a", status: "running", done: false },
			at: 1100,
		});
		s = liveReducer(s, {
			event: { line: "", status: "running", done: false },
			at: 1200,
		});
		expect(s.lines).toEqual(["a"]);
		expect(s.lastLine).toBe("a");
		expect(s.lastEventAt).toBe(1200);
	});

	it("captures terminal status on done", () => {
		let s = initialLiveState(0);
		s = liveReducer(s, {
			event: { line: "", status: "failed", done: true },
			at: 5,
		});
		expect(s.done).toBe(true);
		expect(s.status).toBe("failed");
	});
});
