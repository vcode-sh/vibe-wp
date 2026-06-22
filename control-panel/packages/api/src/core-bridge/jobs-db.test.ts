import { beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// DB-backed regression test for the jobsHistory two-query rewrite (jobs-db.ts).
//
// jobsHistory now (1) selects the most-recent N DISTINCT job ids, then (2)
// inArray-joins their audit rows with NO row limit, then (3) collapses them via
// dedupeLaunchAudit. The earlier single-LIMIT-on-the-join version had a bug: a
// job whose LAUNCH audit row falls OUTSIDE the limit window while its later
// CANCEL row falls inside would be under-reported (the row-multiplied join eats
// the cap) and/or mislabeled with the cancel actor instead of the launcher.
// The pure dedupe is already unit-tested in jobs-history-pure.test.ts; this file
// exercises the DB orchestration the dedupe can't reach.
//
// ── Setup notes ────────────────────────────────────────────────────────────
// Importing jobs-db.ts pulls in @control-panel/db, whose `db` singleton is
// built from env.DATABASE_URL at module-load and whose env validation runs on
// first import. So this test sets the required env vars (and SKIP_ENV_VALIDATION
// as a belt-and-braces guard) BEFORE any dynamic import, points DATABASE_URL at
// a shared in-memory libsql DB, then dynamically imports the db package, creates
// the three tables it needs (user, jobs, audit_log) via the raw libsql client,
// and finally imports jobsHistory. The api package's vitest run has no .env in
// packages/api, so dotenv/config won't clobber these process.env values.
// ---------------------------------------------------------------------------

interface LibsqlClient {
	execute: (sql: string) => Promise<unknown>;
}

let db: typeof import("@control-panel/db").db;
let jobs: typeof import("@control-panel/db/schema/jobs").jobs;
let auditLog: typeof import("@control-panel/db/schema/jobs").auditLog;
let user: typeof import("@control-panel/db/schema/auth").user;
let jobsHistory: typeof import("./jobs-db").jobsHistory;

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	const dbModule = await import("@control-panel/db");
	db = dbModule.db;
	const client = (db as { $client: LibsqlClient }).$client;

	// Create just the tables jobsHistory touches. Columns mirror the drizzle
	// schema (snake_case columns, timestamp_ms integers). Created once here so
	// every test shares one in-memory DB; rows use distinct ids per test.
	await client.execute(
		"CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, role TEXT NOT NULL DEFAULT 'viewer', banned INTEGER, ban_reason TEXT, ban_expires INTEGER, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)"
	);
	await client.execute(
		"CREATE TABLE jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, site_id TEXT NOT NULL, status TEXT NOT NULL, exit_code INTEGER, started_at INTEGER NOT NULL DEFAULT 0, finished_at INTEGER)"
	);
	await client.execute(
		"CREATE TABLE audit_log (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL, site_id TEXT, job_id TEXT, at INTEGER NOT NULL DEFAULT 0)"
	);

	const schemaAuth = await import("@control-panel/db/schema/auth");
	const schemaJobs = await import("@control-panel/db/schema/jobs");
	user = schemaAuth.user;
	jobs = schemaJobs.jobs;
	auditLog = schemaJobs.auditLog;
	jobsHistory = (await import("./jobs-db")).jobsHistory;

	await db.insert(user).values([
		{ email: "launcher@x.test", id: "u-launch", name: "Launcher" },
		{ email: "canceller@x.test", id: "u-cancel", name: "Canceller" },
	]);
});

const SITE = "acme";

/** Insert a job + its LAUNCH audit row in one go. */
async function seedJob(opts: {
	action: string;
	id: string;
	startedAt: Date;
	status: string;
}): Promise<void> {
	await db.insert(jobs).values({
		id: opts.id,
		kind: opts.action,
		siteId: SITE,
		startedAt: opts.startedAt,
		status: opts.status,
	});
	await db.insert(auditLog).values({
		action: opts.action,
		at: opts.startedAt,
		id: `launch-${opts.id}`,
		jobId: opts.id,
		siteId: SITE,
		userId: "u-launch",
	});
}

describe("jobsHistory — two-query DISTINCT-job rewrite (DB-backed)", () => {
	it("keeps a job whose LAUNCH row is older than `limit` newer jobs, attributing the launcher (not the canceller)", async () => {
		// One OLD job, launched before the newer jobs, later CANCELED. Its launch
		// audit row (early) and a separate cancel audit row (late) both target it.
		await seedJob({
			action: "backup",
			id: "old",
			startedAt: new Date("2026-06-01T10:00:00Z"),
			status: "canceled",
		});
		// A later CANCEL audit row for the SAME job, by a DIFFERENT actor.
		await db.insert(auditLog).values({
			action: "cancel",
			at: new Date("2026-06-10T10:00:00Z"),
			id: "cancel-old",
			jobId: "old",
			siteId: SITE,
			userId: "u-cancel",
		});
		// Two NEWER jobs so the old job's launch row sits outside a limit=2 window.
		await seedJob({
			action: "smoke",
			id: "new-1",
			startedAt: new Date("2026-06-05T10:00:00Z"),
			status: "succeeded",
		});
		await seedJob({
			action: "smoke",
			id: "new-2",
			startedAt: new Date("2026-06-06T10:00:00Z"),
			status: "succeeded",
		});

		const rows = await jobsHistory({ siteId: SITE });

		// The old job appears exactly once despite its 2 audit rows.
		const oldRows = rows.filter((r) => r.id === "old");
		expect(oldRows).toHaveLength(1);
		const old = oldRows[0];
		// Actor + action reflect the LAUNCH, never the later cancel.
		expect(old?.action).toBe("backup");
		expect(old?.actorId).toBe("u-launch");
		expect(old?.actorName).toBe("Launcher");
		// Current status still comes from the jobs row.
		expect(old?.status).toBe("canceled");
		// Newest-first ordering across all three jobs.
		expect(rows.map((r) => r.id)).toEqual(["new-2", "new-1", "old"]);
	});

	it("caps DISTINCT jobs (not row-multiplied join rows) at `limit`", async () => {
		// `old` has TWO audit rows, so a naive LIMIT on the multiplied join would
		// miscount. With limit=2 we must still get 2 DISTINCT jobs — the two newest.
		const rows = await jobsHistory({ limit: 2, siteId: SITE });
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.id)).toEqual(["new-2", "new-1"]);
		// Each returned job is distinct (no duplicate ids leaking from the join).
		expect(new Set(rows.map((r) => r.id)).size).toBe(2);
	});
});
