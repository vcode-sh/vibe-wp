import { describe, expect, it, vi } from "vitest";

import type { PerfRecommendation } from "../contract";
import { buildPerfApplyStream, perfRecsToEnv } from "./perf-apply";

function fakeStream(lines: string[], code: number) {
	return {
		proc: { exited: Promise.resolve(code), kill: () => undefined },
		lines: (async function* () {
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

const recs: PerfRecommendation[] = [
	{
		key: "REDIS_MAXMEMORY",
		label: "Redis max memory",
		current: "256M",
		suggested: "384M",
		unit: "MiB",
		plain: "object cache size",
		reason: "evictions",
		risk: "medium",
		category: "redis",
	},
];

describe("perfRecsToEnv", () => {
	it("builds VIBE_PERF_* env + VIBE_PERF_KEYS, dropping unknown keys", () => {
		const env = perfRecsToEnv([
			...recs,
			{
				key: "NOT_A_TUNABLE",
				label: "x",
				current: "1",
				suggested: "2",
				unit: "",
				plain: "",
				reason: "",
				risk: "low",
				category: "redis",
			},
		]);
		expect(env.VIBE_PERF_REDIS_MAXMEMORY).toBe("384M");
		expect(env.VIBE_PERF_KEYS).toBe("REDIS_MAXMEMORY");
		expect(env).not.toHaveProperty("VIBE_PERF_NOT_A_TUNABLE");
	});
});

describe("perf-apply stream", () => {
	it("no applicable recommendations → no-op success", async () => {
		const streamVibe = vi.fn(() => fakeStream([], 0));
		const runVibe = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));
		const { lines } = buildPerfApplyStream(
			{
				streamVibe,
				runVibe,
				fetchFn: vi.fn() as never,
				siteUrl: "https://x",
				ttfbMs: 3000,
				r2: false,
			},
			{ workDir: "/opt/s", env: "prod", recommendations: [] }
		);
		const out = await collect(lines);
		expect(out.join("\n")).toMatch(/nothing to apply/i);
		expect(streamVibe).not.toHaveBeenCalled();
	});

	it("happy path: backup → apply → recreate → smoke ok → no rollback", async () => {
		const streamVibe = vi.fn((_d, _e, op) => {
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/SNAP"], 0);
			}
			return fakeStream(["ok"], 0);
		});
		const runVibe = vi.fn(async (_d, _e, op) =>
			op === "smoke"
				? { stdout: "ok", stderr: "", code: 0 }
				: { stdout: "", stderr: "", code: 0 }
		);
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildPerfApplyStream(
			{
				streamVibe,
				runVibe,
				fetchFn,
				siteUrl: "https://x",
				ttfbMs: 3000,
				r2: false,
			},
			{ workDir: "/opt/s", env: "prod", recommendations: recs }
		);
		const out = await collect(lines);
		expect(out.join("\n")).toMatch(/\[done\].*applied/i);
		expect(
			streamVibe.mock.calls.some((c) => c[2] === "perfApplyRollback")
		).toBe(false);
		// VIBE_PERF env reached the apply op.
		const applyCall = streamVibe.mock.calls.find((c) => c[2] === "perfApply");
		expect(applyCall?.[3]?.env?.VIBE_PERF_REDIS_MAXMEMORY).toBe("384M");
	});

	it("verify fails → auto-rollback (perfApplyRollback + recreate + re-smoke)", async () => {
		const calls: string[] = [];
		const streamVibe = vi.fn((_d, _e, op) => {
			calls.push(op as string);
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/SNAP"], 0);
			}
			return fakeStream(["ok"], 0);
		});
		let smokeCall = 0;
		const runVibe = vi.fn(async (_d, _e, op) => {
			if (op === "smoke") {
				smokeCall += 1;
				return { stdout: "", stderr: "", code: smokeCall === 1 ? 1 : 0 };
			}
			return { stdout: "", stderr: "", code: 0 };
		});
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildPerfApplyStream(
			{
				streamVibe,
				runVibe,
				fetchFn,
				siteUrl: "https://x",
				ttfbMs: 3000,
				r2: false,
			},
			{ workDir: "/opt/s", env: "prod", recommendations: recs }
		);
		const out = await collect(lines);
		expect(calls).toContain("perfApplyRollback");
		expect(out.join("\n")).toMatch(/\[rollback\]/);
		expect(out.join("\n")).toMatch(/\[done\].*rolled back/i);
	});

	it("perf-apply refused (root cap/validation) → aborts, no recreate", async () => {
		const calls: string[] = [];
		const streamVibe = vi.fn((_d, _e, op) => {
			calls.push(op as string);
			if (op === "backupLocal" || op === "backup") {
				return fakeStream(["Backup written to backups/prod/SNAP"], 0);
			}
			if (op === "perfApply") {
				return fakeStream(["perf-apply: refusing to apply"], 2);
			}
			return fakeStream(["ok"], 0);
		});
		const runVibe = vi.fn(async () => ({ stdout: "", stderr: "", code: 0 }));
		const fetchFn = vi.fn(async () => ({ ok: true })) as never;
		const { lines } = buildPerfApplyStream(
			{
				streamVibe,
				runVibe,
				fetchFn,
				siteUrl: "https://x",
				ttfbMs: 3000,
				r2: false,
			},
			{ workDir: "/opt/s", env: "prod", recommendations: recs }
		);
		const out = await collect(lines);
		expect(calls).not.toContain("up"); // never recreated
		expect(out.join("\n")).toMatch(/refused/i);
	});
});
