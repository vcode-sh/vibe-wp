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
});
