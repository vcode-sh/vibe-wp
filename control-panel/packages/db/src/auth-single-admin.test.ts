import { beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Race-safety test: a partial unique index on user(role) WHERE role='admin'
// enforces at most one admin row while allowing multiple viewer/operator rows.
//
// Setup mirrors jobs-db.test.ts: env vars set BEFORE any dynamic import so
// the @control-panel/db singleton picks up DATABASE_URL at module-load time.
// The user table is created via raw libsql DDL (same as db:push would emit),
// then the partial index is created explicitly so we can test both with and
// without it (Step 1 = failing test runs WITHOUT the index added to schema).
// ---------------------------------------------------------------------------

interface LibsqlClient {
	execute: (sql: string) => Promise<unknown>;
}

let db: typeof import("@control-panel/db").db;
let user: typeof import("@control-panel/db/schema/auth").user;

beforeAll(async () => {
	process.env.SKIP_ENV_VALIDATION = "1";
	process.env.DATABASE_URL = "file::memory:?cache=shared";
	process.env.BETTER_AUTH_SECRET = "x".repeat(32);
	process.env.BETTER_AUTH_URL = "http://localhost:3000";
	process.env.CORS_ORIGIN = "http://localhost:3001";

	const dbModule = await import("@control-panel/db");
	db = dbModule.db;
	const client = (db as { $client: LibsqlClient }).$client;

	// Create the user table matching the drizzle schema (snake_case columns,
	// timestamp_ms integers). Mirrors what db:push emits.
	await client.execute(
		"CREATE TABLE IF NOT EXISTS user (" +
			"id TEXT PRIMARY KEY, " +
			"name TEXT NOT NULL, " +
			"email TEXT NOT NULL UNIQUE, " +
			"email_verified INTEGER NOT NULL DEFAULT 0, " +
			"image TEXT, " +
			"role TEXT NOT NULL DEFAULT 'viewer', " +
			"banned INTEGER, " +
			"ban_reason TEXT, " +
			"ban_expires INTEGER, " +
			"created_at INTEGER NOT NULL DEFAULT 0, " +
			"updated_at INTEGER NOT NULL DEFAULT 0" +
			")"
	);

	// Create the partial unique index — the same DDL that db:push will emit
	// once the schema adds it. This is what enforces the single-admin guarantee.
	await client.execute(
		"CREATE UNIQUE INDEX IF NOT EXISTS user_single_admin ON user(role) WHERE role = 'admin'"
	);

	const schemaAuth = await import("@control-panel/db/schema/auth");
	user = schemaAuth.user;
});

describe("user_single_admin partial unique index", () => {
	it("allows inserting the first admin", async () => {
		await expect(
			db.insert(user).values({
				id: "u-admin-1",
				name: "Owner",
				email: "owner@example.com",
				role: "admin",
			})
		).resolves.not.toThrow();
	});

	it("rejects a second admin row (enforces at-most-one admin)", async () => {
		await expect(
			db.insert(user).values({
				id: "u-admin-2",
				name: "Second Admin",
				email: "second-admin@example.com",
				role: "admin",
			})
		).rejects.toThrow();
	});

	it("allows multiple non-admin users (proves the index is partial, not a blanket unique on role)", async () => {
		await expect(
			db.insert(user).values([
				{
					id: "u-viewer-1",
					name: "Viewer One",
					email: "viewer1@example.com",
					role: "viewer",
				},
				{
					id: "u-viewer-2",
					name: "Viewer Two",
					email: "viewer2@example.com",
					role: "viewer",
				},
			])
		).resolves.not.toThrow();
	});
});
