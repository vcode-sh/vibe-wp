import { describe, expect, it, vi } from "vitest";

vi.mock("@control-panel/env/server", () => ({
	env: { PANEL_HOST_DIR: "/opt/vibe-wp-src" },
}));

import type { JobDeps } from "./jobs";
import { startJob, streamJob } from "./jobs";
import type { DetectedSite } from "./sites";

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

interface FakeProc {
	exited: Promise<number>;
	kill: () => void;
	pid: number;
	resolveExit: (code: number) => void;
}

function makeProc(): FakeProc {
	let resolveExit!: (code: number) => void;
	const exited = new Promise<number>((resolve) => {
		resolveExit = resolve;
	});
	return { exited, kill: () => resolveExit(1), pid: 0, resolveExit };
}

async function* noLines(): AsyncGenerator<string> {}

const BASE_INPUT = {
	action: "backup",
	env: "prod" as const,
	kind: "backup",
	op: "backup" as const,
	siteId: "test-site",
	userId: "user-1",
};

describe("job stream terminal ordering", () => {
	it("emits terminal stream event only after job finish persistence resolves", async () => {
		const proc = makeProc();
		let releasePersist!: () => void;
		let persistStarted!: () => void;
		const persistStartedPromise = new Promise<void>((resolve) => {
			persistStarted = resolve;
		});
		const deps: JobDeps = {
			findSite: () => Promise.resolve(FAKE_SITE),
			persistJobFinish: async () => {
				persistStarted();
				await new Promise<void>((resolve) => {
					releasePersist = resolve;
				});
			},
			persistJobStart: () => Promise.resolve(),
			streamVibe: () => ({ proc, lines: noLines() }),
			writeAudit: () => Promise.resolve(),
		};
		const { jobId } = await startJob(BASE_INPUT, deps);
		const terminal = streamJob(jobId)[Symbol.asyncIterator]().next();
		let terminalResolved = false;
		terminal.then(() => {
			terminalResolved = true;
		});

		proc.resolveExit(0);
		await proc.exited;
		await persistStartedPromise;
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(terminalResolved).toBe(false);

		releasePersist();
		await expect(terminal).resolves.toMatchObject({
			value: { done: true, status: "succeeded" },
		});
	});
});
