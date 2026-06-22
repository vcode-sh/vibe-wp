import { afterEach, describe, expect, it } from "vitest";

import type { JobDeps } from "./jobs";
import { cancelJob, getJob, startJob } from "./jobs";
import type { DetectedSite } from "./sites";

// ---------------------------------------------------------------------------
// Fake dependency builders
// ---------------------------------------------------------------------------

const FAKE_SITE: DetectedSite = {
	caddySlug: "test-site",
	domain: "test.local",
	hasStaging: false,
	id: "test-site",
	installDir: "/opt/test-site",
	prodPort: 18_000,
	slug: "test-site",
	stagePort: null,
	stagingDomain: null,
};

function noop(): Promise<void> {
	return Promise.resolve();
}

interface FakeProc {
	exited: Promise<number>;
	kill: () => void;
	pid: number;
	resolveExit: (code: number) => void;
}

function makeProc(): FakeProc {
	let resolveExit!: (code: number) => void;
	const exited = new Promise<number>((res) => {
		resolveExit = res;
	});
	// pid 0 is never a real process — ensures tests never accidentally call process.kill.
	return { exited, kill: () => resolveExit(1), pid: 0, resolveExit };
}

async function* noLines(): AsyncGenerator<string> {
	// yields nothing — proc exits immediately via resolveExit
}

function fakeDeps(
	proc: FakeProc,
	lines: AsyncGenerator<string> = noLines()
): JobDeps {
	return {
		findSite: () => Promise.resolve(FAKE_SITE),
		persistJobFinish: () => noop(),
		persistJobStart: () => noop(),
		streamVibe: () => ({ proc, lines }),
		writeAudit: () => noop(),
	};
}

const BASE_INPUT = {
	action: "backup",
	env: "prod" as const,
	kind: "backup",
	op: "backup" as const,
	siteId: "test-site",
	userId: "user-1",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("startJob / drain — natural exits", () => {
	it("status is 'succeeded' when the process exits 0", async () => {
		const proc = makeProc();
		const { jobId } = await startJob(BASE_INPUT, fakeDeps(proc));
		proc.resolveExit(0);
		await proc.exited;
		// Give the drain microtask a chance to settle.
		await new Promise((r) => setTimeout(r, 0));
		expect(getJob(jobId)?.status).toBe("succeeded");
		expect(getJob(jobId)?.exitCode).toBe(0);
	});

	it("status is 'failed' when the process exits non-zero", async () => {
		const proc = makeProc();
		const { jobId } = await startJob(BASE_INPUT, fakeDeps(proc));
		proc.resolveExit(1);
		await proc.exited;
		await new Promise((r) => setTimeout(r, 0));
		expect(getJob(jobId)?.status).toBe("failed");
		expect(getJob(jobId)?.exitCode).toBe(1);
	});
});

describe("cancelJob — in-flight cancel", () => {
	it("status stays 'canceled' even after the fake proc exits", async () => {
		const proc = makeProc();
		const { jobId } = await startJob(BASE_INPUT, fakeDeps(proc));
		// Cancel while the job is still running.
		const result = cancelJob(jobId);
		expect(result).toBe(true);
		expect(getJob(jobId)?.status).toBe("canceled");
		// Now the process exits (as if killed).
		proc.resolveExit(1);
		await proc.exited;
		await new Promise((r) => setTimeout(r, 0));
		// Status must remain canceled, not overwritten by the drain exit path.
		expect(getJob(jobId)?.status).toBe("canceled");
	});
});

describe("cancelJob — terminal-state guard", () => {
	it("returns false and does NOT change status when the job already finished", async () => {
		const proc = makeProc();
		const { jobId } = await startJob(BASE_INPUT, fakeDeps(proc));
		proc.resolveExit(0);
		await proc.exited;
		await new Promise((r) => setTimeout(r, 0));
		// Job is now "succeeded" — cancel must be a no-op.
		const result = cancelJob(jobId);
		expect(result).toBe(false);
		expect(getJob(jobId)?.status).toBe("succeeded");
	});
});

// Reset module-level state after each test so jobs don't leak between cases.
// Jobs are stored in a module-level Map; we must drain each one.
afterEach(async () => {
	await new Promise((r) => setTimeout(r, 10));
});
