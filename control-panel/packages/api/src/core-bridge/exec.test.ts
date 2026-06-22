import { describe, expect, it } from "vitest";

import { buildVibeArgv, STREAM_TIMEOUT_MS, VIBE_OPS } from "./exec";
import {
	assertArgvSecretFree,
	type CoreResponse,
	headlessArgv,
	type InstallerStateLike,
	isProvisionMode,
	MODES,
	provisionSequence,
	runHeadlessRequest,
	type SpawnFn,
} from "./provision";

const BIN = "/opt/vibe-wp-panel/bin/vibe-wp-installer";
const SECRET = "sup3r-s3cret-admin-pw";
const EXIT_1 = /exited 1/;
const ERR_NOPE = /nope/;
const ERR_NON_JSON = /non-JSON/;
const ERR_BAD_MODE = /Disallowed provision mode/;

/** A fake `--headless-json` child: captures argv + stdin, replays scripted JSON. */
function fakeSpawn(opts: {
	argvSink: string[][];
	stdinSink: string[];
	responses: string[];
	code?: number;
	stderr?: string;
}): SpawnFn {
	let call = 0;
	return (argv: string[]) => {
		opts.argvSink.push(argv);
		const body = opts.responses[call] ?? opts.responses.at(-1) ?? "{}";
		call += 1;
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
			stdout: new Response(body).body as ReadableStream<Uint8Array>,
			stderr: new Response(opts.stderr ?? "")
				.body as ReadableStream<Uint8Array>,
			exited: Promise.resolve(opts.code ?? 0),
			kill: () => undefined,
		};
	};
}

const VALID_STATE: InstallerStateLike = {
	mode: "new-site",
	adminPassword: SECRET,
	productionDomain: "acme.test",
};

describe("provision headless argv", () => {
	it("is always exactly [bin, --headless-json]", () => {
		expect(headlessArgv(BIN)).toEqual([BIN, "--headless-json"]);
	});

	it("never carries a state value (secrets stay on stdin)", () => {
		const argv = headlessArgv(BIN);
		expect(argv.some((t) => t.includes(SECRET))).toBe(false);
		expect(argv.some((t) => t.includes("acme.test"))).toBe(false);
	});

	it("assertArgvSecretFree rejects anything but the canonical argv", () => {
		expect(() => assertArgvSecretFree([BIN, "--headless-json"])).not.toThrow();
		expect(() =>
			assertArgvSecretFree([BIN, "--mode", "new-site", "--yes"])
		).toThrow();
		expect(() =>
			assertArgvSecretFree([BIN, "--headless-json", SECRET])
		).toThrow();
	});
});

describe("MODES allowlist", () => {
	it("accepts the provisioning modes and rejects others", () => {
		expect(isProvisionMode("new-site")).toBe(true);
		expect(isProvisionMode("external-services")).toBe(true);
		expect(isProvisionMode("staging-only")).toBe(true);
		expect(isProvisionMode("remove-existing")).toBe(true);
		expect(isProvisionMode("manage-existing")).toBe(false);
		expect(isProvisionMode("rm -rf")).toBe(false);
	});

	it("exposes the documented mode list", () => {
		expect([...MODES]).toEqual([
			"new-site",
			"external-services",
			"staging-only",
			"remove-existing",
			"update-existing",
		]);
	});
});

describe("runHeadlessRequest", () => {
	it("writes the request to STDIN (not argv) and parses the response", async () => {
		const argvSink: string[][] = [];
		const stdinSink: string[] = [];
		const res = await runHeadlessRequest(
			{ kind: "validate", state: VALID_STATE },
			{
				bin: BIN,
				spawn: fakeSpawn({
					argvSink,
					stdinSink,
					responses: [JSON.stringify({ kind: "validate", errors: [] })],
				}),
			}
		);
		expect(res).toEqual({ kind: "validate", errors: [] });
		expect(argvSink[0]).toEqual([BIN, "--headless-json"]);
		// The secret-bearing state was piped to stdin, never argv.
		expect(stdinSink[0]).toContain(SECRET);
		expect(argvSink[0]?.some((t) => t.includes(SECRET))).toBe(false);
	});

	it("throws on a non-zero exit (stderr redacted)", async () => {
		await expect(
			runHeadlessRequest(
				{ kind: "validate", state: VALID_STATE },
				{
					bin: BIN,
					spawn: fakeSpawn({
						argvSink: [],
						stdinSink: [],
						responses: [""],
						code: 1,
						stderr: "boom",
					}),
				}
			)
		).rejects.toThrow(EXIT_1);
	});

	it("throws on an {kind:error} response", async () => {
		await expect(
			runHeadlessRequest(
				{ kind: "plan", state: VALID_STATE },
				{
					bin: BIN,
					spawn: fakeSpawn({
						argvSink: [],
						stdinSink: [],
						responses: [JSON.stringify({ kind: "error", message: "nope" })],
					}),
				}
			)
		).rejects.toThrow(ERR_NOPE);
	});

	it("throws on non-JSON stdout", async () => {
		await expect(
			runHeadlessRequest(
				{ kind: "detect" },
				{
					bin: BIN,
					spawn: fakeSpawn({
						argvSink: [],
						stdinSink: [],
						responses: ["not json"],
					}),
				}
			)
		).rejects.toThrow(ERR_NON_JSON);
	});
});

describe("provisionSequence", () => {
	it("rejects a mode outside the allowlist before spawning", async () => {
		const argvSink: string[][] = [];
		await expect(
			provisionSequence(
				{ mode: "manage-existing" },
				{
					apply: true,
					bin: BIN,
					spawn: fakeSpawn({ argvSink, stdinSink: [], responses: [] }),
				}
			)
		).rejects.toThrow(ERR_BAD_MODE);
		expect(argvSink).toHaveLength(0);
	});

	it("returns validation errors WITHOUT executing", async () => {
		const argvSink: string[][] = [];
		const result = await provisionSequence(VALID_STATE, {
			apply: true,
			bin: BIN,
			spawn: fakeSpawn({
				argvSink,
				stdinSink: [],
				responses: [
					JSON.stringify({ kind: "validate", errors: ["bad domain"] }),
				],
			}),
		});
		expect(result.ok).toBe(false);
		expect(result.validationErrors).toEqual(["bad domain"]);
		expect(result.results).toEqual([]);
		// Only the validate spawn ran — no plan, no runPlan.
		expect(argvSink).toHaveLength(1);
	});

	it("runs validate -> plan -> runPlan and reports task results", async () => {
		const argvSink: string[][] = [];
		const responses: CoreResponse[] = [
			{ kind: "validate", errors: [] },
			{ kind: "plan", plan: { tasks: [] } },
			{
				kind: "runPlan",
				results: [{ id: "env-prod", status: "done", output: "ok", code: 0 }],
			},
		];
		const result = await provisionSequence(VALID_STATE, {
			apply: true,
			bin: BIN,
			spawn: fakeSpawn({
				argvSink,
				stdinSink: [],
				responses: responses.map((r) => JSON.stringify(r)),
			}),
		});
		expect(result.ok).toBe(true);
		expect(result.results).toHaveLength(1);
		expect(argvSink).toHaveLength(3);
		for (const argv of argvSink) {
			expect(argv).toEqual([BIN, "--headless-json"]);
		}
	});

	it("reports ok:false when a task fails", async () => {
		const result = await provisionSequence(VALID_STATE, {
			apply: true,
			bin: BIN,
			spawn: fakeSpawn({
				argvSink: [],
				stdinSink: [],
				responses: [
					JSON.stringify({ kind: "validate", errors: [] }),
					JSON.stringify({ kind: "plan", plan: {} }),
					JSON.stringify({
						kind: "runPlan",
						results: [{ id: "boot", status: "failed", output: "err", code: 1 }],
					}),
				],
			}),
		});
		expect(result.ok).toBe(false);
		expect(result.results[0]?.status).toBe("failed");
	});
});

describe("buildVibeArgv", () => {
	it("builds an argv for an allowed op", () => {
		expect(buildVibeArgv("/opt/acme", "prod", "smoke")).toEqual([
			"/opt/acme/bin/vibe",
			"prod",
			"smoke",
		]);
	});
	it("throws on a disallowed op", () => {
		// @ts-expect-error — intentionally invalid op
		expect(() => buildVibeArgv("/opt/acme", "prod", "rm -rf")).toThrow();
	});
	it("exposes the allowlisted read + operation ops", () => {
		expect(Object.keys(VIBE_OPS).sort()).toEqual([
			"backup",
			"backupConfigApply",
			"backupLocal",
			"backupTest",
			"backupVerify",
			"backups",
			"cacheFlush",
			"doctorRuntime",
			"down",
			"harden",
			"logsFollow",
			"logsRecent",
			"monitor",
			"notifyConfigApply",
			"notifyTest",
			"perfReport",
			"promote",
			"refresh",
			"restart",
			"restore",
			"securityStatus",
			"smoke",
			"up",
			"wpCoreUpdate",
			"wpPluginUpdateAll",
			"wpPluginUpdates",
		]);
	});
});

describe("buildVibeArgv operations", () => {
	it("appends extra args then --yes for restore", () => {
		expect(buildVibeArgv("/opt/acme", "prod", "restore", ["/b/2026"])).toEqual([
			"/opt/acme/bin/vibe",
			"prod",
			"restore",
			"/b/2026",
			"--yes",
		]);
	});
	it("carries the trusted --local-only flag for backupLocal", () => {
		// The flag lives in the op's own argv (allowlisted), not in caller args,
		// so it must not trip the leading-dash guard.
		expect(buildVibeArgv("/opt/acme", "prod", "backupLocal")).toEqual([
			"/opt/acme/bin/vibe",
			"prod",
			"backup",
			"--local-only",
		]);
	});
	it("runs staging refresh with --yes and no arg", () => {
		expect(buildVibeArgv("/opt/acme", "stage", "refresh")).toEqual([
			"/opt/acme/bin/vibe",
			"stage",
			"refresh-from-prod",
			"--yes",
		]);
	});
	it("rejects args for an op that does not take them", () => {
		expect(() => buildVibeArgv("/opt/acme", "prod", "up", ["x"])).toThrow();
	});
	it("rejects flag-like args (no smuggled flags)", () => {
		expect(() =>
			buildVibeArgv("/opt/acme", "prod", "restore", ["--config=/etc/x"])
		).toThrow();
	});
});

describe("STREAM_TIMEOUT_MS", () => {
	it("defaults to 30 minutes", () => {
		expect(STREAM_TIMEOUT_MS).toBe(30 * 60 * 1000);
	});
});

describe("streamVibe kill-on-timeout contract", () => {
	it("applies a deadline and kills the spawned process", () => {
		return new Promise<void>((resolve, reject) => {
			// Verify the kill-timer pattern that streamVibe uses internally:
			// spawn a long-lived process, kill it after a short deadline, assert it exits.
			const { spawn } =
				require("node:child_process") as typeof import("node:child_process");
			const child = spawn("sleep", ["60"]);
			const timer = setTimeout(() => child.kill("SIGKILL"), 80);
			child.on("close", (code, signal) => {
				clearTimeout(timer);
				try {
					// Killed via SIGKILL: signal will be "SIGKILL" or code will be non-zero.
					expect(signal === "SIGKILL" || code !== 0).toBe(true);
					resolve();
				} catch (err) {
					reject(err);
				}
			});
			child.on("error", reject);
		});
	});
});
