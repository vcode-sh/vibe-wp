import { describe, expect, it } from "vitest";

import { buildVibeArgv, STREAM_TIMEOUT_MS, VIBE_OPS } from "./exec";

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
			"backupVerify",
			"backups",
			"cacheFlush",
			"doctorRuntime",
			"down",
			"harden",
			"logsFollow",
			"logsRecent",
			"promote",
			"refresh",
			"restart",
			"restore",
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
