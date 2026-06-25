import { describe, expect, it, vi } from "vitest";

vi.mock("../core-bridge/sites", () => ({ detectSites: vi.fn(async () => []) }));
vi.mock("../core-bridge/exec", () => ({
	hostExec: vi.fn(async () => ""),
	runVibe: vi.fn(async () => ({
		stdout: '{"firewall":true,"fail2ban":true,"autoUpdates":true}',
		stderr: "",
		code: 0,
	})),
	// Return a tiny fake gzip archive (the procedure base64-encodes it).
	runSupportBundle: vi.fn(async () => new Uint8Array([0x1f, 0x8b, 0x08, 0x00])),
	SUPPORT_BUNDLE_MAX_BYTES: 25 * 1024 * 1024,
}));
vi.mock("../core-bridge/jobs", () => ({
	startJob: vi.fn(async () => ({ jobId: "job1" })),
	launchPanelUpdateJob: vi.fn(async () => ({ jobId: "update-job" })),
}));
// jobs-db is mocked so the router's static writeAudit import does not pull in
// the real @control-panel/db (which needs a live DATABASE_URL to construct).
vi.mock("../core-bridge/jobs-db", () => ({
	writeAudit: vi.fn(async () => undefined),
}));
vi.mock("@control-panel/env/server", () => ({
	env: { PANEL_HOST_DIR: "/opt/vibe-wp-src", PANEL_VPS_LABEL: undefined },
}));

import { runSupportBundle, runVibe } from "../core-bridge/exec";
import { launchPanelUpdateJob, startJob } from "../core-bridge/jobs";
import { writeAudit } from "../core-bridge/jobs-db";
import { serverRouter } from "./server";

const fakeContext = { session: { user: { id: "user-1" } } } as never;

const BUNDLE_FILENAME_RE = /^vibe-wp-support-\d{8}-\d{4}\.tar\.gz$/;

describe("securityStatus", () => {
	it("runs against PANEL_HOST_DIR with zero sites (no throw)", async () => {
		const result = await serverRouter.securityStatus["~orpc"].handler({
			context: fakeContext,
			input: undefined,
		});
		expect(runVibe).toHaveBeenCalledWith(
			"/opt/vibe-wp-src",
			"prod",
			"securityStatus"
		);
		expect(result).toMatchObject({
			firewall: true,
			fail2ban: true,
			autoUpdates: true,
		});
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

describe("supportBundleDownload", () => {
	it("runs the collector, audits, and returns base64 + a timestamped filename", async () => {
		const result = await serverRouter.supportBundleDownload["~orpc"].handler({
			context: fakeContext,
			input: undefined,
		});
		expect(runSupportBundle).toHaveBeenCalled();
		// base64 of [0x1f,0x8b,0x08,0x00] is "H4sIAA==" — proves no redact on bytes.
		expect(result.base64).toBe(
			Buffer.from([0x1f, 0x8b, 0x08, 0x00]).toString("base64")
		);
		expect(result.filename).toMatch(BUNDLE_FILENAME_RE);
		expect(writeAudit).toHaveBeenCalledWith(
			"user-1",
			"support-bundle",
			"server",
			null
		);
	});
});

describe("serverUpdateStack", () => {
	it("launches the panel-update job and returns its jobId", async () => {
		const result = await serverRouter.serverUpdateStack["~orpc"].handler({
			context: fakeContext,
			input: undefined,
		});
		expect(launchPanelUpdateJob).toHaveBeenCalledWith({ userId: "user-1" });
		expect(result).toMatchObject({ jobId: "update-job" });
	});
});
