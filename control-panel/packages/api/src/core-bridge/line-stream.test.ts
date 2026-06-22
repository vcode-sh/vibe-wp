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

	it("emits an idle heartbeat (empty line, not done) while running", async () => {
		const s = new LineStream(15);
		const iterator = s.subscribe()[Symbol.asyncIterator]();
		s.push("hello");

		let ev = await iterator.next();
		while (!ev.done && ev.value.line === "") {
			ev = await iterator.next();
		}
		expect(ev.value).toMatchObject({ line: "hello", done: false });

		const tick = await iterator.next();
		expect(tick.value).toMatchObject({ line: "", done: false });

		s.end("succeeded");
		let last = await iterator.next();
		while (!last.done && last.value.done === false) {
			last = await iterator.next();
		}
		expect(last.value).toMatchObject({ status: "succeeded", done: true });
	});
});
