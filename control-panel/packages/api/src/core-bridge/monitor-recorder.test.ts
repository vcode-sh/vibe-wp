import { beforeAll, describe, expect, it } from "vitest";

// monitor-recorder transitively imports @control-panel/db (via monitor-history),
// whose module load validates the server env. Set the env BEFORE importing, then
// pull the module in dynamically — same pattern as monitor-history.test.ts. The
// pure pieces under test (interval resolver, recordPass, recorder loop) take
// injected callbacks, so the DB is never actually touched here.
let mod: typeof import("./monitor-recorder");

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";
	mod = await import("./monitor-recorder");
});

const resolveRecorderIntervalMs = (raw: string | undefined) =>
	mod.resolveRecorderIntervalMs(raw);
const recordPass: typeof import("./monitor-recorder")["recordPass"] = (
	...args
) => mod.recordPass(...args);
const startMonitorRecorder: typeof import("./monitor-recorder")["startMonitorRecorder"] =
	(...args) => mod.startMonitorRecorder(...args);

describe("resolveRecorderIntervalMs", () => {
	it("returns 0 (off) for unset/blank/off/0/non-numeric", () => {
		expect(resolveRecorderIntervalMs(undefined)).toBe(0);
		expect(resolveRecorderIntervalMs("")).toBe(0);
		expect(resolveRecorderIntervalMs("  ")).toBe(0);
		expect(resolveRecorderIntervalMs("0")).toBe(0);
		expect(resolveRecorderIntervalMs("off")).toBe(0);
		expect(resolveRecorderIntervalMs("OFF")).toBe(0);
		expect(resolveRecorderIntervalMs("nope")).toBe(0);
		expect(resolveRecorderIntervalMs("-5")).toBe(0);
	});

	it("clamps the minutes into [5, 1440] and converts to ms", () => {
		expect(resolveRecorderIntervalMs("15")).toBe(15 * 60 * 1000);
		// Below the floor clamps up to 5 minutes.
		expect(resolveRecorderIntervalMs("1")).toBe(5 * 60 * 1000);
		expect(resolveRecorderIntervalMs("4")).toBe(5 * 60 * 1000);
		// Above the ceiling clamps down to 1440 minutes.
		expect(resolveRecorderIntervalMs("5000")).toBe(1440 * 60 * 1000);
		// Fractional minutes are truncated before clamping.
		expect(resolveRecorderIntervalMs("30.9")).toBe(30 * 60 * 1000);
	});
});

describe("recordPass", () => {
	it("records every site and counts successes", async () => {
		const seen: string[] = [];
		const ok = await recordPass(
			[
				{ id: "a", installDir: "/opt/a" },
				{ id: "b", installDir: "/opt/b" },
				{ id: "c", installDir: "/opt/c" },
			],
			(dir, id) => {
				seen.push(`${id}:${dir}`);
				return Promise.resolve();
			},
			2
		);
		expect(ok).toBe(3);
		expect(seen.sort()).toEqual(["a:/opt/a", "b:/opt/b", "c:/opt/c"]);
	});

	it("is best-effort: one site's failure does not abort the pass", async () => {
		const ok = await recordPass(
			[
				{ id: "a", installDir: "/opt/a" },
				{ id: "bad", installDir: "/opt/bad" },
				{ id: "c", installDir: "/opt/c" },
			],
			(_dir, id) =>
				id === "bad"
					? Promise.reject(new Error("monitor blew up"))
					: Promise.resolve(),
			1
		);
		// Two of three sites still recorded.
		expect(ok).toBe(2);
	});

	it("handles an empty site list", async () => {
		expect(await recordPass([], () => Promise.resolve())).toBe(0);
	});
});

describe("startMonitorRecorder", () => {
	it("is a no-op when intervalMs <= 0 (never lists sites)", async () => {
		let listed = false;
		const handle = startMonitorRecorder({
			intervalMs: 0,
			listSites: () => {
				listed = true;
				return Promise.resolve([]);
			},
		});
		await new Promise((r) => setTimeout(r, 5));
		expect(listed).toBe(false);
		// stop() is safe to call even though nothing was scheduled.
		expect(() => handle.stop()).not.toThrow();
	});

	it("runs an immediate first pass when enabled", async () => {
		let passes = 0;
		const handle = startMonitorRecorder({
			intervalMs: 60_000,
			listSites: () => {
				passes += 1;
				return Promise.resolve([]);
			},
		});
		// Let the immediate tick's microtasks settle.
		await new Promise((r) => setTimeout(r, 20));
		handle.stop();
		expect(passes).toBe(1);
	});

	it("forwards a listing error to onError without throwing", async () => {
		let captured: unknown = null;
		const handle = startMonitorRecorder({
			intervalMs: 60_000,
			listSites: () => Promise.reject(new Error("detect failed")),
			onError: (err) => {
				captured = err;
			},
		});
		await new Promise((r) => setTimeout(r, 20));
		handle.stop();
		expect(captured).toBeInstanceOf(Error);
	});
});
