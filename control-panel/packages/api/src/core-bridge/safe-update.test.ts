import { describe, expect, it, vi } from "vitest";

import { buildSafeUpdateStream } from "./safe-update";

function fakeStream(lines: string[], code: number) {
	return {
		proc: { exited: Promise.resolve(code), kill: () => undefined },
		lines: (async function* () {
			await Promise.resolve();
			for (const l of lines) {
				yield l;
			}
		})(),
	};
}

const DONE_SUCCEEDED_RE = /\[done\].*succeeded/i;
const RESTORE_RE = /\[restore\]/;
const DONE_ROLLED_BACK_RE = /\[done\].*rolled back/i;
const NO_RESTORE_NEEDED_RE = /no restore needed/i;

async function collect(gen: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const l of gen) {
		out.push(l);
	}
	return out;
}

describe("safe-update", () => {
	it("happy path: backup -> update -> smoke ok -> no restore", async () => {
		const streamVibe = vi.fn((_d, _e, op) => {
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/20260624T0000Z"], 0);
			}
			return fakeStream(["Success: updated"], 0);
		});
		const runVibe = vi.fn(async (_d, _e, op) =>
			op === "smoke"
				? { stdout: "ok", stderr: "", code: 0 }
				: { stdout: "", stderr: "", code: 0 }
		);
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildSafeUpdateStream(
			{
				streamVibe,
				runVibe,
				fetchFn,
				siteUrl: "https://x",
				ttfbMs: 3000,
				r2: false,
			},
			{
				workDir: "/opt/s",
				env: "prod",
				target: { kind: "plugin", slug: "akismet" },
			}
		);
		const out = await collect(lines);
		expect(out.join("\n")).toMatch(DONE_SUCCEEDED_RE);
		const restoreStreamed = streamVibe.mock.calls.some(
			(c) => c[2] === "restore"
		);
		expect(restoreStreamed).toBe(false);
	});

	it("rollback: smoke fails -> restore the captured snapshot", async () => {
		const calls: string[] = [];
		const streamVibe = vi.fn((_d, _e, op) => {
			calls.push(op as string);
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/SNAP"], 0);
			}
			if (op === "restore") {
				return fakeStream(["Restore complete from backups/prod/SNAP."], 0);
			}
			return fakeStream(["updating…"], 0);
		});
		let smokeCall = 0;
		const runVibe = vi.fn(async (_d, _e, op) => {
			await Promise.resolve();
			if (op === "smoke") {
				smokeCall += 1;
				return { stdout: "", stderr: "", code: smokeCall === 1 ? 1 : 0 };
			}
			return { stdout: "", stderr: "", code: 0 };
		});
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildSafeUpdateStream(
			{
				streamVibe,
				runVibe,
				fetchFn,
				siteUrl: "https://x",
				ttfbMs: 3000,
				r2: false,
			},
			{ workDir: "/opt/s", env: "prod", target: { kind: "core" } }
		);
		const out = await collect(lines);
		expect(calls).toContain("restore");
		expect(out.join("\n")).toMatch(RESTORE_RE);
		expect(out.join("\n")).toMatch(DONE_ROLLED_BACK_RE);
	});

	it("aborts without restore when the update op fails", async () => {
		const calls: string[] = [];
		const streamVibe = vi.fn((_d, _e, op) => {
			calls.push(op as string);
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/SNAP"], 0);
			}
			return fakeStream(["fatal error"], 1); // update fails
		});
		const runVibe = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildSafeUpdateStream(
			{
				streamVibe,
				runVibe,
				fetchFn,
				siteUrl: "https://x",
				ttfbMs: 3000,
				r2: false,
			},
			{
				workDir: "/opt/s",
				env: "prod",
				target: { kind: "plugin", slug: "akismet" },
			}
		);
		const out = await collect(lines);
		expect(calls).not.toContain("restore"); // nothing changed -> no restore
		expect(out.join("\n")).toMatch(NO_RESTORE_NEEDED_RE);
	});
});
