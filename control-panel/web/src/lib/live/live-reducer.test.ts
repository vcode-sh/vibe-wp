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
		// heartbeat refreshes liveness but NOT the last-output marker
		expect(s.lastLineAt).toBe(1100);
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

	it("marks reconnecting on a transient drop and clears it on the next event", () => {
		let s = initialLiveState(0);
		s = liveReducer(s, {
			event: { line: "a", status: "running", done: false },
			at: 10,
		});
		s = liveReducer(s, { reconnecting: true, at: 20 });
		expect(s.reconnecting).toBe(true);
		expect(s.unrecoverable).toBe(false);
		// A received event after reconnect proves the link is live again.
		s = liveReducer(s, {
			event: { line: "b", status: "running", done: false },
			at: 30,
		});
		expect(s.reconnecting).toBe(false);
	});

	it("clears lines before a reconnect replay without losing startedAt", () => {
		let s = initialLiveState(100);
		s = liveReducer(s, {
			event: { line: "x", status: "running", done: false },
			at: 110,
		});
		s = liveReducer(s, { clearLines: true, at: 120 });
		expect(s.lines).toEqual([]);
		expect(s.lastLine).toBe("");
		expect(s.startedAt).toBe(100);
		// Replay rebuilds the canonical list rather than appending duplicates.
		s = liveReducer(s, {
			event: { line: "x", status: "running", done: false },
			at: 130,
		});
		expect(s.lines).toEqual(["x"]);
	});

	it("surfaces unrecoverable as a non-done terminal-ish signal", () => {
		let s = initialLiveState(0);
		s = liveReducer(s, { unrecoverable: true, at: 5 });
		expect(s.unrecoverable).toBe(true);
		expect(s.done).toBe(false);
		expect(s.reconnecting).toBe(false);
	});

	it("never re-opens or mutates a finished stream", () => {
		let s = initialLiveState(0);
		s = liveReducer(s, {
			event: { line: "", status: "succeeded", done: true },
			at: 5,
		});
		const after = liveReducer(s, { reconnecting: true, at: 6 });
		expect(after).toBe(s);
		const after2 = liveReducer(s, { unrecoverable: true, at: 7 });
		expect(after2).toBe(s);
		const after3 = liveReducer(s, { clearLines: true, at: 8 });
		expect(after3).toBe(s);
	});
});
