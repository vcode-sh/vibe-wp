import { beforeAll, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// DB-backed test for the public needsSetup procedure and the completeSetup
// security guard.
//
// Sets env vars and SKIP_ENV_VALIDATION BEFORE any dynamic import so the
// @control-panel/db singleton uses the in-memory libsql DB (same pattern as
// jobs-db.test.ts). Creates the minimal `user` table DDL, then asserts:
//   - needsSetup true  when zero admin rows exist
//   - needsSetup still true when only a non-admin (viewer) row exists
//   - needsSetup false once an admin row is inserted
//   - completeSetup REFUSES (FORBIDDEN) once an admin exists — the load-bearing
//     server-side guard. It re-runs the SAME admin-count query needsSetup uses,
//     so the guard branch is exercised directly without needing the full auth
//     stack (the happy path is covered by the auth first-user hook + VPS run).
// ---------------------------------------------------------------------------

interface LibsqlClient {
	execute: (sql: string) => Promise<unknown>;
}

let db: typeof import("@control-panel/db").db;
let user: typeof import("@control-panel/db/schema/auth").user;
let setupRouter: typeof import("./setup").setupRouter;

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	const dbModule = await import("@control-panel/db");
	db = dbModule.db;
	const client = (db as { $client: LibsqlClient }).$client;

	await client.execute(
		"CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, role TEXT NOT NULL DEFAULT 'viewer', banned INTEGER, ban_reason TEXT, ban_expires INTEGER, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)"
	);

	const schemaAuth = await import("@control-panel/db/schema/auth");
	user = schemaAuth.user;
	setupRouter = (await import("./setup")).setupRouter;
});

const ctx = {} as never;

it("needsSetup is true when there are no users at all", async () => {
	const r = await setupRouter.needsSetup["~orpc"].handler({
		context: ctx,
		input: undefined,
	});
	expect(r.needsSetup).toBe(true);
});

it("needsSetup is still true when only a non-admin (viewer) row exists", async () => {
	await db.insert(user).values({
		id: "viewer-1",
		name: "Viewer",
		email: "viewer@x.test",
		role: "viewer",
	});
	const r = await setupRouter.needsSetup["~orpc"].handler({
		context: ctx,
		input: undefined,
	});
	expect(r.needsSetup).toBe(true);
});

it("needsSetup is false once an admin row exists", async () => {
	await db.insert(user).values({
		id: "admin-1",
		name: "Owner",
		email: "owner@x.test",
		role: "admin",
	});
	const r = await setupRouter.needsSetup["~orpc"].handler({
		context: ctx,
		input: undefined,
	});
	expect(r.needsSetup).toBe(false);
});

it("completeSetup REFUSES once an admin already exists (the security guard)", async () => {
	// An admin row exists from the previous test, so needsSetup is false. The
	// guard must throw BEFORE ever calling better-auth — an attacker must never
	// be able to mint a second admin on an already-set-up panel.
	await expect(
		setupRouter.completeSetup["~orpc"].handler({
			context: ctx,
			input: {
				email: "attacker@x.test",
				password: "Sup3rStr0ngPass!",
				name: "Attacker",
			},
		})
	).rejects.toMatchObject({ code: "FORBIDDEN" });

	// And no extra user was created by the refused call.
	const [row] = await db.select().from(user);
	expect(row).toBeDefined();
	const all = await db.select().from(user);
	expect(all.some((u) => u.email === "attacker@x.test")).toBe(false);
});
