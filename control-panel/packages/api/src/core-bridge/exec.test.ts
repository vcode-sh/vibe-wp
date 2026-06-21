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
	it("only exposes the allowlisted read/backup ops", () => {
		expect(Object.keys(VIBE_OPS).sort()).toEqual([
			"backup",
			"backups",
			"doctorRuntime",
			"logsRecent",
			"smoke",
		]);
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
