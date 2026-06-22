import { describe, expect, it } from "vitest";

import { mergeLineStreams } from "./stream-merge";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const c of chunks) {
				controller.enqueue(enc.encode(c));
			}
			controller.close();
		},
	});
}

/** A stream that enqueues one chunk then parks forever (never closes). */
function neverClosingStream(chunk: string): ReadableStream<Uint8Array> {
	const enc = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			controller.enqueue(enc.encode(chunk));
			// deliberately never calls close() or error()
		},
	});
}

describe("mergeLineStreams", () => {
	it("yields newline-split lines from both streams, transformed", async () => {
		const out = streamOf("a\nb\n");
		const err = streamOf("e1\ne2\n");
		const got: string[] = [];
		for await (const line of mergeLineStreams([out, err], (l) =>
			l.toUpperCase()
		)) {
			got.push(line);
		}
		expect(got.sort()).toEqual(["A", "B", "E1", "E2"]);
	});

	it("flushes a trailing unterminated line", async () => {
		const got: string[] = [];
		for await (const line of mergeLineStreams([streamOf("tail")], (l) => l)) {
			got.push(line);
		}
		expect(got).toEqual(["tail"]);
	});

	it("resolves promptly when the consumer calls iterator.return() on a never-closing stream", async () => {
		// Regression: generator's finally block must cancel readers before awaiting
		// pumps, otherwise a pump parked on reader.read() keeps the Promise.allSettled
		// blocked even after iterator.return() is called.
		const iter = mergeLineStreams([neverClosingStream("line1\n")], (l) => l)[
			Symbol.asyncIterator
		]();

		// Read the one line that arrives so the pump is blocked on the next read().
		await iter.next();

		const timeout = new Promise<"timeout">((resolve) =>
			setTimeout(() => resolve("timeout"), 500)
		);
		const result = await Promise.race([iter.return?.(), timeout]);
		expect(result).not.toBe("timeout");
	});
});
