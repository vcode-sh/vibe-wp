import { describe, expect, it, vi } from "vitest";

vi.mock("../core-bridge/sites", () => ({ detectSites: vi.fn(async () => []) }));
vi.mock("../core-bridge/exec", () => ({
	hostExec: vi.fn(async () => ""),
	runVibe: vi.fn(async () => ({
		stdout: '{"firewall":true,"fail2ban":true,"autoUpdates":true}',
		stderr: "",
		code: 0,
	})),
}));
vi.mock("../core-bridge/jobs", () => ({
	startJob: vi.fn(async () => ({ jobId: "job1" })),
}));
vi.mock("@control-panel/env/server", () => ({
	env: { PANEL_HOST_DIR: "/opt/vibe-wp", PANEL_VPS_LABEL: undefined },
}));

import { runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { serverRouter } from "./server";

const fakeContext = { session: { user: { id: "user-1" } } } as never;

describe("securityStatus", () => {
	it("runs against PANEL_HOST_DIR with zero sites (no throw)", async () => {
		const result = await serverRouter.securityStatus["~orpc"].handler({
			context: fakeContext,
			input: undefined,
		});
		expect(runVibe).toHaveBeenCalledWith("/opt/vibe-wp", "prod", "securityStatus");
		expect(result).toMatchObject({ firewall: true, fail2ban: true, autoUpdates: true });
	});
});

describe("serverHarden", () => {
	it("starts a harden job with siteId 'server' (no throw, zero sites)", async () => {
		const result = await serverRouter.serverHarden["~orpc"].handler({
			context: fakeContext,
			input: undefined,
		});
		expect(startJob).toHaveBeenCalledWith(
			expect.objectContaining({ op: "harden", siteId: "server" })
		);
		expect(result).toMatchObject({ jobId: "job1" });
	});
});

describe("serverDoctor", () => {
	it("returns an empty-checks result with zero sites (no throw)", async () => {
		const result = await serverRouter.serverDoctor["~orpc"].handler({
			context: fakeContext,
			input: undefined,
		});
		expect(result.checks).toEqual([]);
	});
});
