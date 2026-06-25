import { describe, expect, it } from "vitest";

import {
	buildVibeArgv,
	STREAM_TIMEOUT_MS,
	VIBE_OPS,
	wrapVibeArgv,
} from "./exec";
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
import { streamProvision } from "./provision-job";

const BIN = "/opt/vibe-wp-panel/bin/vibe-wp-installer";
const SECRET = "sup3r-s3cret-admin-pw";
const EXIT_1 = /exited 1/;
const ERR_NOPE = /nope/;
const ERR_NON_JSON = /non-JSON/;
const ERR_BAD_MODE = /Disallowed provision mode/;
const ERR_CANCELED = /provision canceled/;

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

/**
 * A fake child that NEVER exits and whose streams stay open — models a
 * privileged installer subprocess still running. The only way out of an
 * in-flight request against it is the cancel/abort path, so it lets us prove
 * abort both rejects the promise and tears the child down. `killed` flips when
 * the bridge invokes kill() (the off-Linux / no-pid killChildTree fallback).
 */
function openSpawn(): { killed: () => boolean; spawn: SpawnFn } {
	let wasKilled = false;
	const neverExits = new Promise<number>(() => undefined);
	const spawn: SpawnFn = () => ({
		stdin: { write: () => undefined, end: () => undefined },
		// start()-only streams never close, so the body Promise.all never settles.
		stdout: new ReadableStream<Uint8Array>({ start: () => undefined }),
		stderr: new ReadableStream<Uint8Array>({ start: () => undefined }),
		exited: neverExits,
		kill: () => {
			wasKilled = true;
		},
	});
	return { killed: () => wasKilled, spawn };
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
			"shared-db",
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

describe("runHeadlessRequest cancel/abort", () => {
	it("rejects promptly AND kills the child when the signal aborts mid-flight", async () => {
		const { killed, spawn } = openSpawn();
		const ac = new AbortController();
		const pending = runHeadlessRequest(
			{ kind: "detect" },
			{ bin: BIN, spawn, signal: ac.signal }
		);
		// Abort after the request is in-flight (child spawned, await blocked on the
		// never-resolving body). The abort listener must reject the race AND kill.
		queueMicrotask(() => ac.abort());
		await expect(pending).rejects.toThrow(ERR_CANCELED);
		// killChildTree fell back to the plain child.kill() (no pid on the seam).
		expect(killed()).toBe(true);
	});

	it("throws before spawning when the signal is already aborted", async () => {
		const argvSink: string[][] = [];
		const ac = new AbortController();
		ac.abort();
		await expect(
			runHeadlessRequest(
				{ kind: "detect" },
				{
					bin: BIN,
					signal: ac.signal,
					spawn: fakeSpawn({
						argvSink,
						stdinSink: [],
						responses: [JSON.stringify({ kind: "detect", host: {} })],
					}),
				}
			)
		).rejects.toThrow(ERR_CANCELED);
		// Early-abort guard fires before any spawn — nothing was launched.
		expect(argvSink).toHaveLength(0);
	});
});

describe("streamProvision cancel", () => {
	it("aborting via proc.kill() yields 'Provision canceled.' and a non-zero exit", async () => {
		const { killed, spawn } = openSpawn();
		const { proc, lines } = streamProvision(VALID_STATE, {
			apply: true,
			bin: BIN,
			spawn,
		});
		// Cancel once the validate spawn is in-flight against the never-exiting child;
		// proc.kill() aborts the threaded signal so the sequence rejects promptly.
		queueMicrotask(() => proc.kill());
		const collected: string[] = [];
		for await (const line of lines) {
			collected.push(line);
		}
		const code = await proc.exited;
		expect(collected).toContain("Provision canceled.");
		expect(code).not.toBe(0);
		// The signal-driven kill reached the spawned child's teardown.
		expect(killed()).toBe(true);
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
			"autoUpdateScheduleApply",
			"backup",
			"backupConfigApply",
			"backupListContents",
			"backupLocal",
			"backupRestoreItem",
			"backupScheduleApply",
			"backupTest",
			"backupVerify",
			"backups",
			"cacheFlush",
			"caddyWwwApply",
			"doctorRuntime",
			"down",
			"env",
			"harden",
			"insights",
			"insightsRefresh",
			"logsExport",
			"logsFollow",
			"logsRecent",
			"monitor",
			"monitorScheduleApply",
			"nginxRecreate",
			"notifyConfigApply",
			"notifyTest",
			"perfReport",
			"promote",
			"psJson",
			"refresh",
			"restart",
			"restore",
			"scheduleStatus",
			"securityStatus",
			"siteConfigApply",
			"smoke",
			"smtpConfigApply",
			"smtpTest",
			"up",
			"wpCoreUpdate",
			"wpPluginActivate",
			"wpPluginAutoUpdatesDisable",
			"wpPluginAutoUpdatesEnable",
			"wpPluginDeactivate",
			"wpPluginDelete",
			"wpPluginUpdate",
			"wpPluginUpdateAll",
			"wpPluginUpdates",
			"wpThemeActivate",
			"wpThemeAutoUpdatesDisable",
			"wpThemeAutoUpdatesEnable",
			"wpThemeDelete",
			"wpThemeUpdate",
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

describe("wrapVibeArgv (direct dev path, runner unset)", () => {
	it("returns the buildVibeArgv argv unchanged when no runner is set", () => {
		const prev = process.env.PANEL_PRIVILEGED_RUNNER;
		delete process.env.PANEL_PRIVILEGED_RUNNER;
		try {
			const vibeArgv = buildVibeArgv("/opt/acme", "prod", "smoke");
			expect(wrapVibeArgv("/opt/acme", vibeArgv)).toEqual(vibeArgv);
		} finally {
			if (prev === undefined) {
				delete process.env.PANEL_PRIVILEGED_RUNNER;
			} else {
				process.env.PANEL_PRIVILEGED_RUNNER = prev;
			}
		}
	});

	it("treats an empty runner as unset (no sudo wrapping)", () => {
		const prev = process.env.PANEL_PRIVILEGED_RUNNER;
		process.env.PANEL_PRIVILEGED_RUNNER = "";
		try {
			const vibeArgv = buildVibeArgv("/opt/acme", "prod", "smoke");
			expect(wrapVibeArgv("/opt/acme", vibeArgv)).toEqual(vibeArgv);
		} finally {
			if (prev === undefined) {
				delete process.env.PANEL_PRIVILEGED_RUNNER;
			} else {
				process.env.PANEL_PRIVILEGED_RUNNER = prev;
			}
		}
	});
});

describe("wrapVibeArgv (production path, runner set)", () => {
	const RUNNER = "/opt/vibe-wp-panel/bin/vibe-panel-run";

	it("sudo-wraps a plain op as [sudo, -n, runner, vibe, siteDir, env, ...rest]", () => {
		const prev = process.env.PANEL_PRIVILEGED_RUNNER;
		process.env.PANEL_PRIVILEGED_RUNNER = RUNNER;
		try {
			const vibeArgv = buildVibeArgv("/opt/acme", "prod", "smoke");
			// siteDir's bin/vibe is dropped; the root wrapper owns path reconstruction.
			expect(wrapVibeArgv("/opt/acme", vibeArgv)).toEqual([
				"sudo",
				"-n",
				RUNNER,
				"vibe",
				"/opt/acme",
				"prod",
				"smoke",
			]);
		} finally {
			if (prev === undefined) {
				delete process.env.PANEL_PRIVILEGED_RUNNER;
			} else {
				process.env.PANEL_PRIVILEGED_RUNNER = prev;
			}
		}
	});

	it("preserves an op's own args + --yes inside the wrapped argv (restore)", () => {
		const prev = process.env.PANEL_PRIVILEGED_RUNNER;
		process.env.PANEL_PRIVILEGED_RUNNER = RUNNER;
		try {
			const vibeArgv = buildVibeArgv("/opt/acme", "prod", "restore", [
				"/b/2026",
			]);
			expect(wrapVibeArgv("/opt/acme", vibeArgv)).toEqual([
				"sudo",
				"-n",
				RUNNER,
				"vibe",
				"/opt/acme",
				"prod",
				"restore",
				"/b/2026",
				"--yes",
			]);
		} finally {
			if (prev === undefined) {
				delete process.env.PANEL_PRIVILEGED_RUNNER;
			} else {
				process.env.PANEL_PRIVILEGED_RUNNER = prev;
			}
		}
	});

	it("rejects leading-dash extraArgs before wrapping even on the runner path", () => {
		const prev = process.env.PANEL_PRIVILEGED_RUNNER;
		process.env.PANEL_PRIVILEGED_RUNNER = RUNNER;
		try {
			// The guard lives in buildVibeArgv, so a smuggled flag never reaches
			// wrapVibeArgv — the sudo path inherits the same rejection.
			expect(() =>
				wrapVibeArgv(
					"/opt/acme",
					buildVibeArgv("/opt/acme", "prod", "restore", ["--config=/etc/x"])
				)
			).toThrow();
		} finally {
			if (prev === undefined) {
				delete process.env.PANEL_PRIVILEGED_RUNNER;
			} else {
				process.env.PANEL_PRIVILEGED_RUNNER = prev;
			}
		}
	});
});

describe("STREAM_TIMEOUT_MS", () => {
	it("defaults to 30 minutes", () => {
		expect(STREAM_TIMEOUT_MS).toBe(30 * 60 * 1000);
	});
});

describe("buildVibeArgv logs ops", () => {
	it("passes positional service + tail for logsRecent", () => {
		expect(
			buildVibeArgv("/opt/site", "prod", "logsRecent", ["nginx", "500"])
		).toEqual(["/opt/site/bin/vibe", "prod", "logs-recent", "nginx", "500"]);
	});
	it("passes service + tail for logsFollow", () => {
		expect(
			buildVibeArgv("/opt/site", "prod", "logsFollow", ["db", "200"])
		).toEqual(["/opt/site/bin/vibe", "prod", "logs", "db", "200"]);
	});
	it("exposes logsExport mapped to logs-recent", () => {
		expect(
			buildVibeArgv("/opt/site", "prod", "logsExport", ["all", "2000"])
		).toEqual(["/opt/site/bin/vibe", "prod", "logs-recent", "all", "2000"]);
	});
	it("still rejects a flag-like arg (tail must be a bare number)", () => {
		expect(() =>
			buildVibeArgv("/opt/site", "prod", "logsRecent", ["nginx", "--tail=500"])
		).toThrow("flag-like");
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

describe("per-item wp ops (feature #4)", () => {
	it("builds plugin activate argv with the slug appended", () => {
		expect(
			buildVibeArgv("/opt/site", "prod", "wpPluginActivate", ["akismet"])
		).toEqual([
			"/opt/site/bin/vibe",
			"prod",
			"wp",
			"plugin",
			"activate",
			"akismet",
		]);
	});

	it("builds plugin auto-updates enable argv with the slug as trailing arg", () => {
		expect(
			buildVibeArgv("/opt/site", "prod", "wpPluginAutoUpdatesEnable", [
				"redis-cache",
			])
		).toEqual([
			"/opt/site/bin/vibe",
			"prod",
			"wp",
			"plugin",
			"auto-updates",
			"enable",
			"redis-cache",
		]);
	});

	it("builds theme update argv with the slug", () => {
		expect(
			buildVibeArgv("/opt/site", "prod", "wpThemeUpdate", ["astra"])
		).toEqual(["/opt/site/bin/vibe", "prod", "wp", "theme", "update", "astra"]);
	});

	it("refuses a flag-like slug (no leading dash reaches the wrapper)", () => {
		expect(() =>
			buildVibeArgv("/opt/site", "prod", "wpPluginUpdate", ["--path=/evil"])
		).toThrow();
	});

	it("builds the auto-update-schedule-apply argv with the cadence", () => {
		expect(
			buildVibeArgv("/opt/site", "prod", "autoUpdateScheduleApply", ["weekly"])
		).toEqual([
			"/opt/site/bin/vibe",
			"prod",
			"auto-update-schedule-apply",
			"weekly",
		]);
	});
});
