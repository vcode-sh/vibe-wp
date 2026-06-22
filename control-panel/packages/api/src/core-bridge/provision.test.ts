import { describe, expect, it } from "vitest";

import {
	type ProgressEvent,
	runHeadlessRunPlanStream,
	type SpawnFn,
} from "./provision";

const BIN = "/opt/vibe-wp-panel/bin/vibe-wp-installer";
const ERR_CANCELED = /canceled/;

/**
 * A fake `--headless-json` runPlan child: replays a scripted STDOUT body (NDJSON
 * progress lines, then the terminal response) and captures the stdin request +
 * argv. Mirrors exec.test.ts's fakeSpawn but allows multi-line bodies so we can
 * exercise the incremental line reader (mergeLineStreams) used by the stream.
 */
function scriptedSpawn(opts: {
	argvSink: string[][];
	stdinSink: string[];
	stdout: string;
	stderr?: string;
	code?: number;
}): SpawnFn {
	return (argv: string[]) => {
		opts.argvSink.push(argv);
		let written = "";
		return {
			stdin: {
				write: (d: string) => {
					written += d;
				},
				end: () => {
					opts.stdinSink.push(written);
				},
			},
			stdout: new Response(opts.stdout).body as ReadableStream<Uint8Array>,
			stderr: new Response(opts.stderr ?? "")
				.body as ReadableStream<Uint8Array>,
			exited: Promise.resolve(opts.code ?? 0),
			kill: () => undefined,
		};
	};
}

/** A child whose stdout never closes — only abort/kill can end the stream. */
function openSpawn(): { killed: () => boolean; spawn: SpawnFn } {
	let wasKilled = false;
	const spawn: SpawnFn = () => ({
		stdin: { write: () => undefined, end: () => undefined },
		stdout: new ReadableStream<Uint8Array>({ start: () => undefined }),
		stderr: new ReadableStream<Uint8Array>({ start: () => undefined }),
		exited: new Promise<number>(() => undefined),
		kill: () => {
			wasKilled = true;
		},
	});
	return { killed: () => wasKilled, spawn };
}

function progress(
	phase: "start" | "result",
	taskId: string,
	index: number,
	extra: Partial<ProgressEvent> = {}
): string {
	return JSON.stringify({
		kind: "progress",
		phase,
		taskId,
		name: taskId,
		index,
		total: 1,
		...extra,
	} satisfies ProgressEvent);
}

const PLAN = { tasks: [{ id: "a" }] };

describe("runHeadlessRunPlanStream", () => {
	it("yields progress events incrementally and resolves the terminal response", async () => {
		const argvSink: string[][] = [];
		const stdinSink: string[] = [];
		const stdout = [
			progress("start", "a", 0),
			progress("result", "a", 0, { status: "done", output: "ok" }),
			JSON.stringify({
				kind: "runPlan",
				results: [{ id: "a", status: "done", output: "ok", code: 0 }],
			}),
		].join("\n");
		const { events, result } = runHeadlessRunPlanStream(PLAN, true, {
			bin: BIN,
			spawn: scriptedSpawn({ argvSink, stdinSink, stdout }),
		});

		const seen: ProgressEvent[] = [];
		for await (const event of events) {
			seen.push(event);
		}
		expect(seen.map((e) => [e.phase, e.taskId])).toEqual([
			["start", "a"],
			["result", "a"],
		]);
		expect(seen[1]?.status).toBe("done");

		const final = await result;
		expect(final.kind).toBe("runPlan");
		if (final.kind === "runPlan") {
			expect(final.results).toHaveLength(1);
			expect(final.results[0]?.status).toBe("done");
		}
		// Argv stays the canonical secret-free pair; the plan rides STDIN only.
		expect(argvSink).toEqual([[BIN, "--headless-json"]]);
		expect(stdinSink[0]).toContain('"kind":"runPlan"');
		expect(argvSink[0]?.some((t) => t.includes("tasks"))).toBe(false);
	});

	it("ignores unparseable lines and still resolves the terminal response", async () => {
		const stdout = [
			"warning: noise from a child process",
			progress("start", "a", 0),
			"   ",
			"not json either",
			JSON.stringify({ kind: "runPlan", results: [] }),
		].join("\n");
		const { events, result } = runHeadlessRunPlanStream(PLAN, true, {
			bin: BIN,
			spawn: scriptedSpawn({ argvSink: [], stdinSink: [], stdout }),
		});
		const seen: ProgressEvent[] = [];
		for await (const event of events) {
			seen.push(event);
		}
		// Only the single parseable progress line surfaced; garbage was dropped.
		expect(seen).toHaveLength(1);
		expect((await result).kind).toBe("runPlan");
	});

	it("surfaces a terminal {kind:error} as the resolved response", async () => {
		const stdout = JSON.stringify({ kind: "error", message: "boom" });
		const { events, result } = runHeadlessRunPlanStream(PLAN, true, {
			bin: BIN,
			spawn: scriptedSpawn({ argvSink: [], stdinSink: [], stdout }),
		});
		for await (const _event of events) {
			// drain (no progress events expected)
		}
		const final = await result;
		expect(final.kind).toBe("error");
	});

	it("aborting kills the child tree and rejects the result promptly", async () => {
		const { killed, spawn } = openSpawn();
		const ac = new AbortController();
		const { events, result } = runHeadlessRunPlanStream(PLAN, true, {
			bin: BIN,
			spawn,
			signal: ac.signal,
		});
		// Abort once iteration is parked on the never-closing stdout stream.
		queueMicrotask(() => ac.abort());
		const seen: ProgressEvent[] = [];
		for await (const event of events) {
			seen.push(event);
		}
		expect(seen).toHaveLength(0);
		await expect(result).rejects.toThrow(ERR_CANCELED);
		expect(killed()).toBe(true);
	});

	it("throws and rejects when the signal is already aborted (no spawn)", async () => {
		const argvSink: string[][] = [];
		const ac = new AbortController();
		ac.abort();
		const { events, result } = runHeadlessRunPlanStream(PLAN, true, {
			bin: BIN,
			signal: ac.signal,
			spawn: scriptedSpawn({ argvSink, stdinSink: [], stdout: "{}" }),
		});
		await expect(
			(async () => {
				for await (const _e of events) {
					// should throw before yielding anything
				}
			})()
		).rejects.toThrow(ERR_CANCELED);
		await expect(result).rejects.toThrow(ERR_CANCELED);
		// Early-abort guard fires before spawning anything.
		expect(argvSink).toHaveLength(0);
	});
});
