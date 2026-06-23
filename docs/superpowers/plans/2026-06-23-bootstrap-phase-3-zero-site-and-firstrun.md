# One-Command Bootstrap — Phase 3: Panel Zero-Site Ops + First-Admin Race + First-Run/Empty-State — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the panel work cleanly on a fresh install with **zero sites**, make first-admin creation **race-safe**, and land the operator on a guarded "Create owner account" first-run + a "Create your first site" empty state.

> **Correction (post-implementation):** `PANEL_HOST_DIR` defaults to **`/opt/vibe-wp-src`**, not `/opt/vibe-wp` (the latter is the installer's site default and collided with a live site on the test VPS). Read `/opt/vibe-wp` below as `/opt/vibe-wp-src` for the panel checkout; the shipped code + tests use `/opt/vibe-wp-src`.

**Architecture:** Host-level server ops (`securityStatus`/`serverHarden`) run against a canonical `PANEL_HOST_DIR=/opt/vibe-wp-src` checkout **through the existing root-owned `vibe-panel-run` wrapper** (no wrapper change — `/opt/vibe-wp-src` is under `/opt` and `security-status`/`harden` are already allowlisted). `serverDoctor` returns a typed "no sites yet" result. A DB partial-unique-index guarantees at most one `admin` row, closing the read-then-write race without breaking the sign-up-based owner bootstrap. A public `needsSetup` oRPC procedure drives a guarded owner first-run screen.

**Tech Stack:** oRPC (`@orpc/server`), better-auth, drizzle-orm + libsql (SQLite), React/TanStack Router (web), vitest.

## Global Constraints

- **Preserve the off-root privilege boundary**: every host op goes through `runVibe`/`streamVibe` → `wrapVibeArgv` → `sudo -n <runner> vibe <siteDir> …`. Never use `hostExec` for state-changing ops; never bypass the wrapper.
- **Keep three allowlists in lockstep** if (and only if) a new host op is added: `VIBE_OPS` (`core-bridge/exec.ts:52`), the `exec.test.ts` `Object.keys(VIBE_OPS).sort()` snapshot, and the wrapper `OP_ALLOWLIST` (`bin/vibe-panel-run:155`). This phase adds **no** new op (`security-status` + `harden` already exist), so no lockstep change is needed.
- **Do NOT set `disableSignUp: true`**: the owner bootstrap creates the first admin via `/api/auth/sign-up/email` (`bin/panel:313-317`); disabling sign-up breaks it. Closed registration is already enforced by the `create.before` hook (`packages/auth/src/index.ts:48-60`).
- Roles are `viewer | operator | admin` (`packages/auth/src/access.ts` `PANEL_ROLES`); `role` is `input:false` (cannot be set from the signup payload).
- Test patterns: pure logic → `exec.test.ts` (env save/restore in try/finally); DB-backed → `jobs-db.test.ts` (`SKIP_ENV_VALIDATION=1` + 4 env vars set **before** dynamic `import("@control-panel/db")`, `DATABASE_URL="file::memory:?cache=shared"`).

---

### Task 1: Add `PANEL_HOST_DIR` to the server env schema

**Files:**
- Modify: `control-panel/packages/env/src/server.ts` (`:14-22` env block)

**Interfaces:**
- Produces: `env.PANEL_HOST_DIR: string` (default `"/opt/vibe-wp"`).

- [ ] **Step 1: Add the var**

In `control-panel/packages/env/src/server.ts`, alongside `PANEL_SITES_ROOTS` (`:14`), add:
```ts
    PANEL_HOST_DIR: z.string().default("/opt/vibe-wp"),
```

- [ ] **Step 2: Typecheck**

Run: `cd control-panel && bun run check-types`
Expected: clean (the var is now part of the typed env).

- [ ] **Step 3: Commit**

```bash
git add control-panel/packages/env/src/server.ts
git commit -m "panel(env): add PANEL_HOST_DIR (default /opt/vibe-wp) for zero-site host ops"
```

---

### Task 2: Zero-site `securityStatus` + `serverHarden` via `PANEL_HOST_DIR`

**Files:**
- Modify: `control-panel/packages/api/src/routers/server.ts` (`securityStatus` `:52-67`, `serverHarden` `:69-83`)
- Test: `control-panel/packages/api/src/routers/server.test.ts` (create)

**Interfaces:**
- Consumes: `env.PANEL_HOST_DIR` (Task 1), `runVibe`, `startJob`.
- Produces: `securityStatus`/`serverHarden` no longer throw `NOT_FOUND` with zero sites; both run host-level via the wrapper against `/opt/vibe-wp`.

- [ ] **Step 1: Write the failing test**

`control-panel/packages/api/src/routers/server.test.ts` — mock the exec layer + sites, assert no throw + correct dir. Mirror vitest mocking:
```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../core-bridge/sites", () => ({ detectSites: vi.fn(async () => []) }));
vi.mock("../core-bridge/exec", () => ({
  hostExec: vi.fn(async () => ""),
  runVibe: vi.fn(async () => ({ stdout: "firewall: on", stderr: "", code: 0 })),
}));
vi.mock("../core-bridge/jobs", () => ({ startJob: vi.fn(async () => ({ id: "job1" })) }));
vi.mock("@control-panel/env/server", () => ({ env: { PANEL_HOST_DIR: "/opt/vibe-wp" } }));

import { runVibe } from "../core-bridge/exec";
import { serverRouter } from "./server";

it("securityStatus runs against PANEL_HOST_DIR with zero sites", async () => {
  await serverRouter.securityStatus["~orpc"].handler({ context: {} as never, input: undefined });
  expect(runVibe).toHaveBeenCalledWith("/opt/vibe-wp", "prod", "securityStatus");
});
```
(The exact way to invoke an oRPC procedure handler in tests may differ — read an existing router test if present, else call the underlying handler function. If oRPC has no test-invoke helper, refactor each handler's body into an exported pure `async function securityStatusImpl(deps)` and test that. Prefer the smallest change that lets you assert `runVibe`'s args.)

- [ ] **Step 2: Run — verify it fails**

Run: `cd control-panel && bun run test --filter @control-panel/api -- server.test.ts` (or `cd control-panel/packages/api && bunx vitest run src/routers/server.test.ts`)
Expected: FAIL (still selects `sites[0]`, throws on `[]`).

- [ ] **Step 3: Switch `securityStatus` to `PANEL_HOST_DIR`**

In `server.ts` `securityStatus` (`:52-67`), replace the `detectSites()`/`sites[0]`/`NOT_FOUND` body with:
```ts
  securityStatus: protectedProcedure.handler(
    async (): Promise<SecurityStatus> => {
      const { stdout } = await runVibe(env.PANEL_HOST_DIR, "prod", "securityStatus");
      return parseSecurityStatus(stdout);
    }
  ),
```
(Drop the now-unused `detectSites` import if no other handler in the file needs it — `serverInfo` still uses it, so keep it.)

- [ ] **Step 4: Switch `serverHarden` to `PANEL_HOST_DIR`**

In `server.ts` `serverHarden` (`:69-83`), replace with:
```ts
  serverHarden: adminProcedure.handler(async ({ context }) => {
    return startJob({
      op: "harden",
      siteId: "server",
      env: "prod",
      kind: "harden",
      userId: context.session.user.id,
      action: "harden",
    });
  }),
```
**Gotcha:** `startJob` must run `harden` against `PANEL_HOST_DIR`. Read `core-bridge/jobs.ts` `startJob`: it resolves a `siteDir` from `siteId` via `findSite`. With `siteId:"server"` there is no such site → it must be taught to map `siteId:"server"` → `env.PANEL_HOST_DIR`. Add that mapping in `startJob` (or its dir-resolution helper): when `siteId === "server"`, use `env.PANEL_HOST_DIR` as the working dir. Cover it in the same test (assert the job's resolved dir is `/opt/vibe-wp`).

- [ ] **Step 5: Run — verify it passes**

Run: `cd control-panel/packages/api && bunx vitest run src/routers/server.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add control-panel/packages/api/src/routers/server.ts control-panel/packages/api/src/routers/server.test.ts control-panel/packages/api/src/core-bridge/jobs.ts
git commit -m "panel(server): securityStatus + harden run host-level via PANEL_HOST_DIR (zero-site safe)"
```

---

### Task 3: `serverDoctor` returns a typed "no sites yet" result

**Files:**
- Modify: `control-panel/packages/api/src/routers/server.ts` (`serverDoctor` `:41-50`)
- Modify: `control-panel/packages/api/src/routers/server.test.ts`

**Interfaces:**
- Consumes: `detectSites`, `runVibe`, `parseSmoke`.
- Produces: `serverDoctor` returns `parseSmoke`'s result type with an empty check set when there are no sites (no throw). `doctorRuntime` is site-dependent (it checks a *running* WP/DB/Redis), so with zero sites the correct answer is "nothing running yet," not an error.

- [ ] **Step 1: Read the `parseSmoke` return type**

Read `control-panel/packages/api/src/core-bridge/parse.ts` `parseSmoke` — note its exact return type (e.g. `{ passed: boolean; checks: Array<{...}> }`). The empty result below must match it exactly.

- [ ] **Step 2: Write the failing test**

Add to `server.test.ts`:
```ts
it("serverDoctor returns an empty result with zero sites (no throw)", async () => {
  const r = await serverRouter.serverDoctor["~orpc"].handler({ context: {} as never, input: undefined });
  expect(r.checks).toEqual([]);
});
```

- [ ] **Step 3: Run — verify it fails**

Run: `cd control-panel/packages/api && bunx vitest run src/routers/server.test.ts -t serverDoctor`
Expected: FAIL (throws `NOT_FOUND`).

- [ ] **Step 4: Implement the zero-site branch**

In `server.ts` `serverDoctor` (`:41-50`):
```ts
  serverDoctor: protectedProcedure.handler(async () => {
    const sites = await detectSites();
    const site = sites[0];
    if (!site) {
      return parseSmoke("");
    }
    return parseSmoke(
      (await runVibe(site.installDir, "prod", "doctorRuntime")).stdout
    );
  }),
```
(If `parseSmoke("")` does not yield an empty-`checks` result of the right shape, construct the empty literal explicitly per the type read in Step 1.)

- [ ] **Step 5: Run — verify it passes + commit**

Run: `cd control-panel/packages/api && bunx vitest run src/routers/server.test.ts`
Expected: PASS.
```bash
git add control-panel/packages/api/src/routers/server.ts control-panel/packages/api/src/routers/server.test.ts
git commit -m "panel(server): serverDoctor returns empty result with zero sites"
```

---

### Task 4: Race-safe single admin (DB partial-unique-index)

**Files:**
- Modify: `control-panel/packages/db/src/schema/auth.ts` (`user` table `:4-23`)
- Test: `control-panel/packages/db/src/schema/auth.race.test.ts` (create) — or co-locate with an existing db test

**Interfaces:**
- Produces: a partial unique index so at most one `user` row may have `role = 'admin'`. Under the read-then-write race, the second concurrent admin insert violates the index and fails; that user retries and the hook (now seeing ≥1 user) assigns `viewer`. Outcome: exactly one admin, always.
- Consumes: nothing new. The `create.before` hook stays as-is.

- [ ] **Step 1: Write the failing test**

`control-panel/packages/db/src/schema/auth.race.test.ts` (mirror `jobs-db.test.ts` setup):
```ts
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
  process.env.DATABASE_URL = "file::memory:?cache=shared";
  process.env.BETTER_AUTH_SECRET = "x".repeat(32);
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  process.env.CORS_ORIGIN = "http://localhost:3001";
});

it("permits only one admin row", async () => {
  const { db } = await import("@control-panel/db");
  const { user } = await import("@control-panel/db/schema/auth");
  const client = (db as { $client: { execute: (s: string) => Promise<unknown> } }).$client;
  // Apply the same DDL db:push would (read the generated schema; create table + the partial unique index).
  // ... create the `user` table, then the index:
  await client.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS user_single_admin ON user(role) WHERE role = 'admin'"
  );
  await db.insert(user).values({ id: "1", name: "a", email: "a@x", role: "admin" });
  await expect(
    db.insert(user).values({ id: "2", name: "b", email: "b@x", role: "admin" })
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd control-panel/packages/db && bunx vitest run src/schema/auth.race.test.ts`
Expected: FAIL (without the index, the second admin insert succeeds).

- [ ] **Step 3: Add the partial unique index to the drizzle schema**

In `control-panel/packages/db/src/schema/auth.ts`, add a partial unique index on the `user` table. drizzle SQLite supports this via the table's extra-config callback:
```ts
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
// ...
export const user = sqliteTable(
  "user",
  { /* existing columns unchanged */ },
  (t) => ({
    singleAdmin: uniqueIndex("user_single_admin").on(t.role).where(sql`${t.role} = 'admin'`),
  })
);
```
(Verify `uniqueIndex(...).where(...)` is supported in the installed drizzle-orm `0.45.2` SQLite core; if `.where()` on the index builder is unavailable, add the index via a raw `sql` statement in a migration / a `db:push` companion step. The `bin/panel` deploy runs `db:push`, so the index must be expressible in the schema for push to create it.)

- [ ] **Step 4: Run — verify it passes**

Run: `cd control-panel/packages/db && bunx vitest run src/schema/auth.race.test.ts`
Expected: PASS.

- [ ] **Step 5: Sanity-check the hook still allows the first admin**

Read `packages/auth/src/index.ts:36-64` — the hook is unchanged; the index only *backstops* the race. Confirm no code sets two admins in normal flow. No code change.

- [ ] **Step 6: Commit**

```bash
git add control-panel/packages/db/src/schema/auth.ts control-panel/packages/db/src/schema/auth.race.test.ts
git commit -m "panel(db): partial unique index enforces a single admin (closes first-admin race)"
```

---

### Task 5: Public `needsSetup` oRPC procedure

**Files:**
- Create: `control-panel/packages/api/src/routers/setup.ts`
- Modify: `control-panel/packages/api/src/routers/index.ts` (mount into `appRouter`)
- Modify: `control-panel/web/src/data/queries.ts` (add `needsSetupQuery`)
- Test: `control-panel/packages/api/src/routers/setup.test.ts` (create)

**Interfaces:**
- Produces: `setup.needsSetup` — a **public** (unauthenticated) query returning `{ needsSetup: boolean }` (true when zero admins exist). `needsSetupQuery()` on the web side.
- Consumes: `publicProcedure` (`procedures.ts`), `db`, `user`, `count`, `eq`.

- [ ] **Step 1: Write the failing test**

`control-panel/packages/api/src/routers/setup.test.ts` (mirror `jobs-db.test.ts` env setup; seed zero then one admin):
```ts
it("reports needsSetup=true with no admin, false once an admin exists", async () => {
  // env setup as in jobs-db.test.ts; create the user table; import setupRouter
  const { setupRouter } = await import("./setup");
  let r = await setupRouter.needsSetup["~orpc"].handler({ context: {} as never, input: undefined });
  expect(r.needsSetup).toBe(true);
  // insert an admin, re-query
  // ... db.insert(user).values({ ..., role: "admin" })
  r = await setupRouter.needsSetup["~orpc"].handler({ context: {} as never, input: undefined });
  expect(r.needsSetup).toBe(false);
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd control-panel/packages/api && bunx vitest run src/routers/setup.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the router**

`control-panel/packages/api/src/routers/setup.ts`:
```ts
import { db } from "@control-panel/db";
import { user } from "@control-panel/db/schema/auth";
import { count, eq } from "drizzle-orm";
import { publicProcedure } from "../procedures";

export const setupRouter = {
  needsSetup: publicProcedure.handler(async (): Promise<{ needsSetup: boolean }> => {
    const [row] = await db
      .select({ c: count() })
      .from(user)
      .where(eq(user.role, "admin"));
    return { needsSetup: (row?.c ?? 0) === 0 };
  }),
};
```
(Confirm `publicProcedure` is exported from `procedures.ts`; the dossier confirms `publicProcedure = o` exists.)

- [ ] **Step 4: Mount it**

`control-panel/packages/api/src/routers/index.ts` — spread `setupRouter` into `appRouter` alongside the others (e.g. `...setupRouter` or `setup: setupRouter`, matching the existing composition style — read the file and follow the pattern exactly).

- [ ] **Step 5: Add the web query**

`control-panel/web/src/data/queries.ts` — add (matching the existing `queryOptions`/`orpc.*` pattern):
```ts
export const needsSetupQuery = () => orpc.setup.needsSetup.queryOptions();
```
(Use the exact accessor that matches how `setupRouter` was mounted in Step 4.)

- [ ] **Step 6: Run — verify it passes + typecheck + commit**

Run: `cd control-panel/packages/api && bunx vitest run src/routers/setup.test.ts && cd ../.. && bun run check-types`
Expected: PASS + clean.
```bash
git add control-panel/packages/api/src/routers/setup.ts control-panel/packages/api/src/routers/setup.test.ts control-panel/packages/api/src/routers/index.ts control-panel/web/src/data/queries.ts
git commit -m "panel: public needsSetup procedure (zero-admin probe)"
```

---

### Task 6: Guarded "Create owner account" first-run + honest sign-in

**Files:**
- Modify: `control-panel/web/src/features/auth/login-page.tsx` (`:1-18`)
- Modify: `control-panel/web/src/components/sign-up-form.tsx` (copy `:64-69`)
- Modify: `control-panel/web/src/components/sign-in-form.tsx` (gate the switch CTA `:140-148`)
- Test: `control-panel/web/src/features/auth/login-page.test.tsx` (create; mirror `users/add-user-dialog.test.tsx`)

**Interfaces:**
- Consumes: `needsSetupQuery` (Task 5), `useQuery`.
- Produces: when `needsSetup` → a dedicated "Create owner account" screen (the sign-up form, retitled, no toggle to sign-in); otherwise the sign-in form with the "Need an account? Create one" CTA **hidden** (registration is closed).

- [ ] **Step 1: Write the failing test**

`login-page.test.tsx` (mock the query both ways; mirror the Testing-Library pattern in `users/add-user-dialog.test.tsx`):
```ts
it("shows the owner-creation screen when setup is needed", async () => {
  // mock needsSetupQuery → { needsSetup: true }
  // render <LoginPage/>; expect "Create owner account" present, no "Sign in" toggle
});
it("shows sign-in without a create-account toggle when an admin exists", async () => {
  // mock needsSetupQuery → { needsSetup: false }
  // render; expect the sign-in form; expect NO "Need an account? Create one" button
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd control-panel/web && bunx vitest run src/features/auth/login-page.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Gate the login page on `needsSetup`**

`login-page.tsx`:
```tsx
import { useQuery } from "@tanstack/react-query";
import { needsSetupQuery } from "@/data/queries";
// ...
export function LoginPage() {
  const { data, isLoading } = useQuery(needsSetupQuery());
  const [showSignIn, setShowSignIn] = useState(true);
  if (isLoading) return <Loader />;
  if (data?.needsSetup) {
    return <SignUpForm ownerSetup />;     // owner-creation mode: no toggle back to sign-in
  }
  return showSignIn ? (
    <SignInForm />                          // registration closed: no "create one" toggle
  ) : (
    <SignUpForm onSwitchToSignIn={() => setShowSignIn(true)} />
  );
}
```

- [ ] **Step 4: Owner-setup copy + drop the toggle in that mode**

`sign-up-form.tsx`: accept an optional `ownerSetup?: boolean` prop; when set, retitle to "Create owner account" / "This is the first account — it becomes the panel owner." and render no `onSwitchToSignIn` link. `sign-in-form.tsx`: remove (or make conditional on a prop) the `<Button … onSwitchToSignUp>Need an account? Create one</Button>` at `:140-148` so a closed-registration panel doesn't advertise sign-up.

- [ ] **Step 5: Run — verify it passes + commit**

Run: `cd control-panel/web && bunx vitest run src/features/auth/login-page.test.tsx`
Expected: PASS.
```bash
git add control-panel/web/src/features/auth/login-page.tsx control-panel/web/src/components/sign-up-form.tsx control-panel/web/src/components/sign-in-form.tsx control-panel/web/src/features/auth/login-page.test.tsx
git commit -m "panel(web): guarded owner first-run screen + honest closed sign-in"
```

---

### Task 7: "Create your first site" empty state + zero-site `/server` verification

**Files:**
- Modify: `control-panel/web/src/routes/_auth/sites/index.tsx` (empty state `:109-121`)

**Interfaces:**
- Consumes: existing `onCreate`/`goNew`. No new data.

- [ ] **Step 1: Elevate the empty-state copy**

In `routes/_auth/sites/index.tsx` (`:109-121`), change the empty-state heading/body to first-run framing:
```tsx
<p className="font-medium">Create your first site</p>
<p className="mt-1 text-muted-foreground text-sm">
  Your server is ready. Launch your first WordPress site to get started.
</p>
<Button className="mt-4" onClick={onCreate}><Plus /> Create your first site</Button>
```

- [ ] **Step 2: Verify `/server` renders with zero sites**

With Tasks 2–3 landed, `serverInfo` (already zero-site safe), `securityStatus`, and `serverHarden` all resolve without a site. Manually (or via the existing web test setup) confirm `routes/_auth/server.tsx` renders: the security card shows host posture (not an error), the "Secure the server" action is available, and no `NOT_FOUND` surfaces.

- [ ] **Step 3: Commit**

```bash
git add control-panel/web/src/routes/_auth/sites/index.tsx
git commit -m "panel(web): first-run 'Create your first site' empty state"
```

---

### Task 8: Full suite + zero-site integration check

**Files:** none.

- [ ] **Step 1: Run the whole control-panel suite**

Run: `cd control-panel && bun run test && bun run check-types`
Expected: all green (api + web + db, including the new server/setup/auth-race/login tests).

- [ ] **Step 2: Zero-site integration on the test VPS (acceptance gate)**

On a panel installed with zero sites (the Phase 2 bare-server bootstrap output): sign in as owner → `/server` renders host info + security posture + a working "Secure the server" action; `/sites` shows "Create your first site"; the login page on a fresh DB shows "Create owner account" and hides sign-up once the owner exists.

- [ ] **Step 3: Record the validated commit.**

---

## Self-Review

**Spec coverage (`2026-06-23-…-one-command-bootstrap-design.md`):**
- §7 zero-site server ops (`serverInfo` already safe; `securityStatus`/`serverHarden`/`serverDoctor`) → Tasks 1–3. ✓
- §6 race-safe first-admin → Task 4. (Deliberate deviation: **`disableSignUp` is NOT set** — it would break the sign-up-based owner bootstrap; the hook already closes registration. Noted in Global Constraints.) ✓
- §6 guarded browser owner first-run → Tasks 5–6. ✓
- §8 "create your first site" empty state → Task 7. ✓
- §10 preserve the off-root boundary (host ops through the wrapper; no new op; `/opt/vibe-wp` already under `/opt`) → Task 2 + Global Constraints. ✓

**Placeholder scan:** the two "verify the exact shape" notes (Task 3 Step 1 `parseSmoke` type; Task 4 Step 3 drizzle `.where()` support) each name the exact file/API to confirm rather than leaving a blank, with a concrete fallback. No "TODO/handle edge cases."

**Type/name consistency:** `env.PANEL_HOST_DIR` defined (Task 1) and consumed (Tasks 2–3); `siteId: "server"` mapping added in `startJob` (Task 2 Step 4) matches the frontend's existing `siteId:"server"` convention; `needsSetup`/`setupRouter`/`needsSetupQuery` defined in Task 5 and consumed in Task 6; the `ownerSetup` prop defined in Task 6 Step 4 and used in Step 3. The partial-unique-index name `user_single_admin` is consistent between the test (Task 4 Step 1) and the schema (Step 3). ✓

**Cross-phase note:** Tasks 2–3 make `/server` zero-site-safe, which Phase 2's Task 8 Step 3 depends on; land this phase before declaring the bare-server bootstrap's `/server` page validated.
