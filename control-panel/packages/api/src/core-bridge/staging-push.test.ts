import { describe, expect, it, vi } from "vitest";

import { buildStagingPushStream } from "./staging-push";

function fakeStream(lines: string[], code: number) {
	return {
		proc: { exited: Promise.resolve(code), kill: () => undefined },
		// A genuine AsyncIterable<string> (StreamLike.lines) — the leading await
		// keeps it a real async generator (and satisfies biome's useAwait).
		lines: (async function* () {
			await Promise.resolve();
			for (const l of lines) {
				yield l;
			}
		})(),
	};
}

async function collect(gen: AsyncIterable<string>): Promise<string[]> {
	const out: string[] = [];
	for await (const l of gen) {
		out.push(l);
	}
	return out;
}

const DEPS = {
	siteUrl: "https://x",
	ttfbMs: 3000,
	r2: false,
} as const;

const DONE_SUCCEEDED = /\[done\].*succeeded/i;
const ABORT_NOTHING_CHANGED = /aborting \(nothing changed\)/i;
const SNAP_RE = /SNAP/;
const DONE_ROLLED_BACK = /\[done\].*rolled back/i;
const VERIFICATION_FAILED = /Verification failed/i;
const HOMEPAGE_FAIL = /Homepage .* ✗/;

describe("staging-push", () => {
	it("happy path: backup(prod) -> promote(stage) -> smoke ok -> NO restore", async () => {
		const envByOp: Record<string, string> = {};
		const streamVibe = vi.fn((_d, e, op) => {
			envByOp[op as string] = e as string;
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/20260624T0000Z"], 0);
			}
			return fakeStream(["Importing managed wp-content files"], 0);
		});
		const runVibe = vi.fn(async (_d, _e, op) =>
			op === "smoke"
				? { stdout: "ok", stderr: "", code: 0 }
				: { stdout: "", stderr: "", code: 0 }
		);
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildStagingPushStream(
			{ streamVibe, runVibe, fetchFn, ...DEPS },
			{ workDir: "/opt/s" }
		);
		const out = await collect(lines);
		expect(out.join("\n")).toMatch(DONE_SUCCEEDED);
		// The pre-promote snapshot MUST be taken on PROD (backups are per-env, the
		// rollback restores prod). The promotion itself runs on the stage env.
		expect(envByOp.backupLocal).toBe("prod");
		expect(envByOp.promoteFilesNoBackup).toBe("stage");
		// No restore on the happy path.
		expect(streamVibe.mock.calls.some((c) => c[2] === "restore")).toBe(false);
		// Promotion used the no-backup variant (the panel owns the one snapshot).
		expect(
			streamVibe.mock.calls.some((c) => c[2] === "promoteFilesNoBackup")
		).toBe(true);
		expect(streamVibe.mock.calls.some((c) => c[2] === "promote")).toBe(false);
	});

	it("aborts cleanly (no promote, no restore) when the snapshot cannot be taken", async () => {
		const calls: string[] = [];
		const streamVibe = vi.fn((_d, _e, op) => {
			calls.push(op as string);
			if (op === "backupLocal" || op === "backup") {
				// No "Backup written to" line + non-zero exit -> no snapshot.
				return fakeStream(["backup failed"], 1);
			}
			return fakeStream(["should not run"], 0);
		});
		const runVibe = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildStagingPushStream(
			{ streamVibe, runVibe, fetchFn, ...DEPS },
			{ workDir: "/opt/s" }
		);
		const out = await collect(lines);
		expect(out.join("\n")).toMatch(ABORT_NOTHING_CHANGED);
		expect(calls).not.toContain("promoteFilesNoBackup");
		expect(calls).not.toContain("restore");
	});

	it("promote fails -> auto-restore the captured prod snapshot", async () => {
		const calls: string[] = [];
		const restoreEnv: string[] = [];
		const streamVibe = vi.fn((_d, e, op) => {
			calls.push(op as string);
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/SNAP"], 0);
			}
			if (op === "restore") {
				restoreEnv.push(e as string);
				return fakeStream(["Restore complete from backups/prod/SNAP."], 0);
			}
			// promoteFilesNoBackup fails (prod files may be partially copied).
			return fakeStream(["promotion error"], 1);
		});
		const runVibe = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildStagingPushStream(
			{ streamVibe, runVibe, fetchFn, ...DEPS },
			{ workDir: "/opt/s" }
		);
		const out = await collect(lines);
		// Unlike safe-update's update-failed branch, a promote failure DOES roll back.
		expect(calls).toContain("restore");
		// Rollback restore targets PROD (matching the prod snapshot's env).
		expect(restoreEnv).toEqual(["prod"]);
		expect(out.join("\n")).toMatch(SNAP_RE);
		expect(out.join("\n")).toMatch(DONE_ROLLED_BACK);
	});

	it("smoke fails -> auto-restore the captured prod snapshot", async () => {
		const calls: string[] = [];
		const streamVibe = vi.fn((_d, _e, op) => {
			calls.push(op as string);
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/SNAP"], 0);
			}
			if (op === "restore") {
				return fakeStream(["Restore complete from backups/prod/SNAP."], 0);
			}
			return fakeStream(["Importing managed wp-content files"], 0);
		});
		let smokeCall = 0;
		const runVibe = vi.fn((_d, _e, op) => {
			if (op === "smoke") {
				smokeCall += 1;
				// First smoke (verify) fails; second (post-restore) passes.
				return Promise.resolve({
					stdout: "",
					stderr: "",
					code: smokeCall === 1 ? 1 : 0,
				});
			}
			return Promise.resolve({ stdout: "", stderr: "", code: 0 });
		});
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildStagingPushStream(
			{ streamVibe, runVibe, fetchFn, ...DEPS },
			{ workDir: "/opt/s" }
		);
		const out = await collect(lines);
		expect(calls).toContain("restore");
		expect(out.join("\n")).toMatch(VERIFICATION_FAILED);
		expect(out.join("\n")).toMatch(DONE_ROLLED_BACK);
	});

	it("TTFB over threshold -> auto-restore even when smoke passes", async () => {
		const calls: string[] = [];
		const streamVibe = vi.fn((_d, _e, op) => {
			calls.push(op as string);
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/SNAP"], 0);
			}
			if (op === "restore") {
				return fakeStream(["Restore complete."], 0);
			}
			return fakeStream(["Importing managed wp-content files"], 0);
		});
		const runVibe = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));
		// Homepage responds ok but slowly: advance the clock across the fetch so the
		// measured TTFB (Date.now after fetch - Date.now before) exceeds the 5ms
		// threshold. verifyStep reads Date.now() once before the fetch and once
		// after it resolves, so a monotonic +10000ms jump on the 2nd read suffices.
		const realNow = Date.now;
		let nowCall = 0;
		const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => {
			nowCall += 1;
			return nowCall === 1 ? 1000 : 1000 + 10_000;
		});
		const okFetch = vi.fn(async () => ({ ok: true })) as never;
		try {
			const { lines } = buildStagingPushStream(
				{
					streamVibe,
					runVibe,
					fetchFn: okFetch,
					siteUrl: "https://x",
					ttfbMs: 5,
					r2: false,
				},
				{ workDir: "/opt/s" }
			);
			const out = await collect(lines);
			expect(out.join("\n")).toMatch(HOMEPAGE_FAIL);
			expect(calls).toContain("restore");
			expect(out.join("\n")).toMatch(DONE_ROLLED_BACK);
		} finally {
			nowSpy.mockRestore();
			Date.now = realNow;
		}
	});
});
