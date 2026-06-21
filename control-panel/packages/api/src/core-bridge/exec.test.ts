import { describe, expect, it } from "vitest";

import { buildVibeArgv, VIBE_OPS } from "./exec";

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
	it("only exposes read/backup ops in the MVP allowlist", () => {
		expect(Object.keys(VIBE_OPS).sort()).toEqual([
			"backup",
			"backups",
			"smoke",
		]);
	});
});
