import { describe, expect, it } from "vitest";

import { LineStream } from "./line-stream";

describe("LineStream", () => {
	it("replays buffered lines to a late subscriber, then ends", async () => {
		const s = new LineStream();
		s.push("a");
		s.push("b");
		s.end("succeeded");
		const seen: string[] = [];
		let status = "";
		for await (const ev of s.subscribe()) {
			if (ev.line) {
				seen.push(ev.line);
			}
			status = ev.status;
		}
		expect(seen).toEqual(["a", "b"]);
		expect(status).toBe("succeeded");
	});

	it("delivers lines pushed after subscription", async () => {
		const s = new LineStream();
		const seen: string[] = [];
		const consume = (async () => {
			for await (const ev of s.subscribe()) {
				if (ev.line) {
					seen.push(ev.line);
				}
			}
		})();
		s.push("x");
		s.push("y");
		s.end("succeeded");
		await consume;
		expect(seen).toEqual(["x", "y"]);
	});
});
