import { describe, expect, it } from "vitest";

import type { JoinedAuditRow } from "./jobs-history-pure";
import { dedupeLaunchAudit } from "./jobs-history-pure";

// ---------------------------------------------------------------------------
// dedupeLaunchAudit — collapse the multi-audit left-join to one row per job.
//
// A canceled job has TWO audit rows against the same jobId: the launch row
// (written by launchJob before the job spawns) and a later "cancel" row
// (written by operationsCancel). The left-join in jobsHistory yields one
// JoinedAuditRow per audit row, so we must dedupe to one entry per job and keep
// the LAUNCH actor/action while preserving the job's current status.
// ---------------------------------------------------------------------------

function row(over: Partial<JoinedAuditRow>): JoinedAuditRow {
	return {
		id: "job-1",
		siteId: "acme",
		kind: "backup",
		status: "canceled",
		exitCode: null,
		startedAt: new Date("2026-06-22T10:00:00Z"),
		finishedAt: new Date("2026-06-22T10:01:00Z"),
		action: "backup",
		actorId: "user-launch",
		actorName: "Launcher",
		auditAt: new Date("2026-06-22T10:00:00Z"),
		...over,
	};
}

describe("dedupeLaunchAudit", () => {
	it("returns exactly one entry for a job with launch + cancel audit rows, keeping the launch actor", () => {
		const launch = row({
			action: "backup",
			actorId: "user-launch",
			actorName: "Launcher",
			auditAt: new Date("2026-06-22T10:00:00Z"),
		});
		const cancel = row({
			action: "cancel",
			actorId: "user-canceller",
			actorName: "Canceller",
			auditAt: new Date("2026-06-22T10:00:30Z"),
		});

		const out = dedupeLaunchAudit([launch, cancel]);

		expect(out).toHaveLength(1);
		expect(out[0]?.id).toBe("job-1");
		// Launch actor + action win, not the later cancel row.
		expect(out[0]?.action).toBe("backup");
		expect(out[0]?.actorId).toBe("user-launch");
		expect(out[0]?.actorName).toBe("Launcher");
		// Current status comes from the jobs row, so it stays canceled.
		expect(out[0]?.status).toBe("canceled");
	});

	it("keeps the launch row regardless of join row order (cancel arrives first)", () => {
		const cancel = row({
			action: "cancel",
			actorId: "user-canceller",
			actorName: "Canceller",
			auditAt: new Date("2026-06-22T10:00:30Z"),
		});
		const launch = row({
			action: "backup",
			actorId: "user-launch",
			actorName: "Launcher",
			auditAt: new Date("2026-06-22T10:00:00Z"),
		});

		const out = dedupeLaunchAudit([cancel, launch]);

		expect(out).toHaveLength(1);
		expect(out[0]?.action).toBe("backup");
		expect(out[0]?.actorId).toBe("user-launch");
	});

	it("passes through a job with a single audit row unchanged", () => {
		const only = row({ id: "job-2", action: "harden", auditAt: new Date() });
		const out = dedupeLaunchAudit([only]);
		expect(out).toHaveLength(1);
		expect(out[0]?.id).toBe("job-2");
		expect(out[0]?.action).toBe("harden");
	});

	it("keeps a job with no audit row (null actor)", () => {
		const orphan = row({
			id: "job-3",
			action: null,
			actorId: null,
			actorName: null,
			auditAt: null,
		});
		const out = dedupeLaunchAudit([orphan]);
		expect(out).toHaveLength(1);
		expect(out[0]?.id).toBe("job-3");
		expect(out[0]?.actorName).toBeNull();
	});

	it("a row that has an audit timestamp displaces a null-audit row for the same job", () => {
		const noAudit = row({
			id: "job-4",
			action: null,
			actorId: null,
			actorName: null,
			auditAt: null,
		});
		const withAudit = row({
			id: "job-4",
			action: "restore",
			actorId: "user-x",
			actorName: "X",
			auditAt: new Date("2026-06-22T11:00:00Z"),
		});
		const out = dedupeLaunchAudit([noAudit, withAudit]);
		expect(out).toHaveLength(1);
		expect(out[0]?.action).toBe("restore");
		expect(out[0]?.actorName).toBe("X");
	});

	it("dedupes across multiple distinct jobs and preserves first-seen order (newest-first)", () => {
		const jobA = row({ id: "a", startedAt: new Date("2026-06-22T12:00:00Z") });
		const jobBLaunch = row({
			id: "b",
			startedAt: new Date("2026-06-22T09:00:00Z"),
			action: "backup",
			auditAt: new Date("2026-06-22T09:00:00Z"),
		});
		const jobBCancel = row({
			id: "b",
			startedAt: new Date("2026-06-22T09:00:00Z"),
			action: "cancel",
			actorId: "user-c",
			actorName: "C",
			auditAt: new Date("2026-06-22T09:05:00Z"),
		});

		// Upstream order is newest job first; the cancel duplicate follows its launch.
		const out = dedupeLaunchAudit([jobA, jobBLaunch, jobBCancel]);

		expect(out.map((r) => r.id)).toEqual(["a", "b"]);
		expect(out.find((r) => r.id === "b")?.action).toBe("backup");
	});
});
