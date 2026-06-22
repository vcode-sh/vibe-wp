# R2 "Test connection" probe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Test connection" button to the global R2 settings card that probes the configured R2 bucket with `rclone lsf` and toasts success/failure, so an admin can confirm credentials before enabling backups.

**Architecture:** A new `bin/backup-test` shell script probes the R2 bucket via rclone. A new `backupTestEnv()` helper in `backup-config.ts` builds the rclone env from the global credentials regardless of whether `enabled === 1` (so admins can test before toggling). A new `backupConfigTest` oRPC procedure in `settings.ts` picks the first detected site's `installDir`, injects the test env, runs the probe, and returns `{ ok, message }`. The React card calls the mutation and toasts the result.

**Tech Stack:** POSIX sh, Bun, TypeScript, oRPC (`@orpc/server`), `@tanstack/react-query`, `sonner`, shadcn/ui `Button`

## Global Constraints

- Shell scripts: POSIX sh (`set -eu`), tabs for indentation, `sh -n` must pass, 0755 mode, secrets must never be printed.
- TypeScript: no `any`, TS/TSX files ≤ 220 lines, tabs for indentation.
- Secrets travel as injected env (`opts.env`), never as argv.
- `runVibe` is the single host-exec chokepoint; do not spawn rclone directly from TypeScript.
- shadcn primitives + semantic tokens; no hardcoded colors.
- `bun run check-types`, `bun run check`, `bun run build` must all pass clean.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `bin/backup-test` | **Create** | POSIX sh probe: sources `lib/vibe.sh` + `lib/backup.sh`, exports rclone env, runs `rclone lsf --max-depth 1 "R2:<bucket>"`, exits 0 on success |
| `control-panel/packages/api/src/core-bridge/backup-config.ts` | **Modify** | Add `backupTestEnv(siteId)` — returns rclone env ignoring `enabled`, or `null` when creds are incomplete |
| `control-panel/packages/api/src/core-bridge/backup-config.test.ts` | **Modify** | Add unit tests for `backupTestEnv` behaviour (complete creds → env map; missing cred → null) |
| `control-panel/packages/api/src/routers/settings.ts` | **Modify** | Add `backupConfigTest` adminProcedure; remove stale "deferred Phase 2" comment |
| `control-panel/web/src/components/settings/r2-global-card.tsx` | **Modify** | Add "Test connection" outline button + `useMutation` wiring |

---

### Task 1: `bin/backup-test` shell probe

**Files:**
- Create: `bin/backup-test`

**Interfaces:**
- Consumes: `RCLONE_CONFIG_R2_*` env vars (injected by panel via `runVibe` `opts.env`), `VIBE_BACKUP_R2_BUCKET` from env file.
- Produces: stdout `"ok: connected to <bucket>"` + exit 0 on success; stderr error message + exit non-zero on failure.

- [ ] **Step 1: Write the script**

Create `/Users/tomrobak/_projects_/vibe-wp/bin/backup-test` with content:

```sh
#!/usr/bin/env sh
set -eu

VIBE_BIN_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "${VIBE_BIN_DIR}/lib/vibe.sh"
. "${VIBE_BIN_DIR}/lib/backup.sh"

# Fail fast when rclone is missing (backup_require_rclone prints a clear message).
backup_require_rclone

# Export RCLONE_CONFIG_R2_* from the env file so the child rclone process can
# read them. The panel injects the credentials as env vars before calling
# bin/vibe, so vibe_load_env picks them up from the running environment; the
# export loop in backup_export_rclone re-exports them explicitly for rclone.
backup_export_rclone

bucket="$(vibe_env_value VIBE_BACKUP_R2_BUCKET)"
if [ -z "${bucket}" ]; then
	echo "VIBE_BACKUP_R2_BUCKET is not set — configure a bucket first." >&2
	exit 1
fi

# Probe the bucket root (not the prefix, which may not exist yet).
# rclone lsf lists bucket contents; --max-depth 1 keeps it cheap.
# Stderr from rclone is safe to surface — it never contains the secret.
if rclone lsf --max-depth 1 "R2:${bucket}" >/dev/null 2>&1; then
	echo "ok: connected to ${bucket}"
	exit 0
else
	# Re-run without stdout suppression so the error reaches our stderr.
	rclone lsf --max-depth 1 "R2:${bucket}" 2>&1 || true
	echo "R2 probe failed for bucket '${bucket}'" >&2
	exit 1
fi
```

- [ ] **Step 2: Make it executable and verify syntax**

```sh
chmod 0755 /Users/tomrobak/_projects_/vibe-wp/bin/backup-test
sh -n /Users/tomrobak/_projects_/vibe-wp/bin/backup-test
```

Expected: no output from `sh -n` (syntax OK).

- [ ] **Step 3: Commit**

```sh
git add /Users/tomrobak/_projects_/vibe-wp/bin/backup-test
git commit -m "feat: add bin/backup-test rclone connectivity probe"
```

---

### Task 2: `backupTestEnv` helper in `backup-config.ts`

**Files:**
- Modify: `control-panel/packages/api/src/core-bridge/backup-config.ts`
- Modify: `control-panel/packages/api/src/core-bridge/backup-config.test.ts`

**Interfaces:**
- Produces: `backupTestEnv(siteId: string): Promise<Record<string, string> | null>` — exported from `backup-config.ts`
  - Returns `null` when any of `provider`, `accessKeyId`, `secret`, `bucket` are missing from the resolved global config (the user hasn't finished configuring R2 yet).
  - Returns a `Record<string, string>` with keys `RCLONE_CONFIG_R2_TYPE`, `RCLONE_CONFIG_R2_PROVIDER`, `RCLONE_CONFIG_R2_ACCESS_KEY_ID`, `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY`, `RCLONE_CONFIG_R2_ENDPOINT` (when set), `VIBE_BACKUP_R2_BUCKET` — **regardless of `enabled`**.

Why `enabled` is ignored: `toEnv()` / `backupConfigEnv()` return `{ VIBE_BACKUP_R2_ENABLED: "0" }` when `enabled !== 1`. That is correct for live backups — but for a connectivity test the admin might be testing credentials **before** enabling backups. So `backupTestEnv` builds the rclone env directly from the credential fields, bypassing the `enabled` gate.

- [ ] **Step 1: Add `backupTestEnv` to `backup-config.ts`**

Open `/Users/tomrobak/_projects_/vibe-wp/control-panel/packages/api/src/core-bridge/backup-config.ts`.

Add after the `applyBackupConfigToSite` function (at the end of the file):

```ts
/**
 * Returns the rclone environment variables needed to probe R2 connectivity,
 * built from the **global** credentials regardless of whether `enabled === 1`.
 * This lets an admin test credentials before toggling the backup on.
 *
 * Returns `null` when required credential fields (provider, accessKeyId,
 * secret, bucket) are incomplete — the caller should surface a friendly error.
 */
export async function backupTestEnv(
	siteId: string
): Promise<Record<string, string> | null> {
	// Always resolve from the global row for a connectivity test — per-site
	// overrides (bucket, creds) are not yet a use-case for test-connection.
	const cfg = await resolveBackupConfig(siteId);

	if (!cfg.provider || !cfg.accessKeyId || !cfg.secret || !cfg.bucket) {
		return null;
	}

	const env: Record<string, string> = {
		RCLONE_CONFIG_R2_TYPE: "s3",
		RCLONE_CONFIG_R2_PROVIDER: cfg.provider,
		RCLONE_CONFIG_R2_ACCESS_KEY_ID: cfg.accessKeyId,
		RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: cfg.secret,
		VIBE_BACKUP_R2_BUCKET: cfg.bucket,
	};

	if (cfg.endpoint) {
		env.RCLONE_CONFIG_R2_ENDPOINT = cfg.endpoint;
	}

	return env;
}
```

- [ ] **Step 2: Add unit tests to `backup-config.test.ts`**

Note: `backup-config.test.ts` currently tests only pure functions (no DB). `backupTestEnv` calls `resolveBackupConfig` which needs the DB — so we test the logic of what the helper *would* return given a resolved config. The simplest approach is to add the test in the same file, testing the pure mapping inline (since `backupTestEnv`'s logic is a thin transformation of `EffectiveBackupConfig`). Add a `describe("backupTestEnv-logic")` block at the end of `/Users/tomrobak/_projects_/vibe-wp/control-panel/packages/api/src/core-bridge/backup-config.test.ts` that validates the field-completeness gate using `mergeConfig` to produce the input:

```ts
// ---------------------------------------------------------------------------
// backupTestEnv prerequisite — field completeness gate (pure logic)
// ---------------------------------------------------------------------------

describe("backupTestEnv completeness gate (via mergeConfig)", () => {
	const full = row({
		provider: "Cloudflare",
		accessKeyId: "AKID",
		secret: "SECRET",
		bucket: "my-bucket",
		endpoint: "https://r2.example.com",
		enabled: null, // deliberately not enabled — test should still work
	});

	it("complete global creds with enabled=null → non-null env map", () => {
		const cfg = mergeConfig(full, null, "__global__");
		// Simulate the backupTestEnv logic:
		expect(
			cfg.provider && cfg.accessKeyId && cfg.secret && cfg.bucket
		).toBeTruthy();
	});

	it("missing secret → null (user must save a complete config first)", () => {
		const incomplete = row({ ...full, secret: null });
		const cfg = mergeConfig(incomplete, null, "__global__");
		expect(
			cfg.provider && cfg.accessKeyId && cfg.secret && cfg.bucket
		).toBeFalsy();
	});

	it("missing bucket → null", () => {
		const incomplete = row({ ...full, bucket: null });
		const cfg = mergeConfig(incomplete, null, "__global__");
		expect(
			cfg.provider && cfg.accessKeyId && cfg.secret && cfg.bucket
		).toBeFalsy();
	});

	it("enabled=1 (backup on) → still returns env (not gated on enabled)", () => {
		const enabled = row({ ...full, enabled: 1 });
		const cfg = mergeConfig(enabled, null, "__global__");
		// The test-env helper ignores enabled — if creds are complete it proceeds.
		expect(
			cfg.provider && cfg.accessKeyId && cfg.secret && cfg.bucket
		).toBeTruthy();
	});
});
```

- [ ] **Step 3: Run tests**

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun test packages/api/src/core-bridge/backup-config.test.ts
```

Expected: all tests pass (including the 4 new ones).

- [ ] **Step 4: Run type-check**

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run check-types
```

Expected: no errors.

- [ ] **Step 5: Commit**

```sh
git add control-panel/packages/api/src/core-bridge/backup-config.ts
git add control-panel/packages/api/src/core-bridge/backup-config.test.ts
git commit -m "feat: add backupTestEnv helper — builds rclone probe env ignoring enabled flag"
```

---

### Task 3: `backupConfigTest` procedure in `settings.ts`

**Files:**
- Modify: `control-panel/packages/api/src/routers/settings.ts`

**Interfaces:**
- Consumes: `backupTestEnv` from `../core-bridge/backup-config`; `detectSites` from `../core-bridge/sites`; `runVibe` from `../core-bridge/exec`.
- Produces: `backupConfigTest` adminProcedure; input `{ siteId: string }`; output `{ ok: boolean; message: string }`.

Site resolution for a global test: the `backupConfigTest` procedure needs a real site's `installDir` to resolve `bin/vibe`. For the global R2 card the `siteId` will always be `"__global__"`. When `siteId === GLOBAL_SITE_ID` there is no specific site to look up, so fall back to `sites[0]` (the first detected site) — the same pattern used by `securityStatus` and `serverHarden` in `server.ts`. If no site is detected, return `{ ok: false, message: "No site found — deploy a site first." }`.

- [ ] **Step 1: Update the import block in `settings.ts`**

Open `/Users/tomrobak/_projects_/vibe-wp/control-panel/packages/api/src/routers/settings.ts`.

Add `backupTestEnv` to the `backup-config` import:

Replace:
```ts
import {
	applyBackupConfigToSite,
	getBackupConfig,
	listConfiguredSiteIds,
	setBackupConfig,
} from "../core-bridge/backup-config";
```

With:
```ts
import {
	applyBackupConfigToSite,
	backupTestEnv,
	getBackupConfig,
	listConfiguredSiteIds,
	setBackupConfig,
} from "../core-bridge/backup-config";
```

Add `detectSites` to the sites import:

Replace:
```ts
import { findSite } from "../core-bridge/sites";
```

With:
```ts
import { detectSites, findSite } from "../core-bridge/sites";
```

- [ ] **Step 2: Update the file-level comment to remove the stale "Phase 2" note**

Replace:
```ts
/**
 * Settings router — backup R2 config + monitor alert channels (get/set/test).
 *
 * NOTE: `backupConfigTest` (rclone lsd probe) is deferred to Phase 2 — it
 * requires an allowlisted rclone exec path that is not yet wired.
 */
```

With:
```ts
/**
 * Settings router — backup R2 config + monitor alert channels (get/set/test).
 */
```

- [ ] **Step 3: Add `backupConfigTest` procedure to `settingsRouter`**

Inside the `settingsRouter` object, after `notifyTest` (just before the closing `};`), add:

```ts
	backupConfigTest: adminProcedure
		.input(z.object({ siteId: z.string().min(1) }))
		.handler(async ({ input }) => {
			const testEnv = await backupTestEnv(input.siteId);
			if (!testEnv) {
				return {
					ok: false,
					message: "Configure R2 credentials (provider, key, secret, bucket) first.",
				};
			}

			// Pick the target site. For the global card siteId === GLOBAL_SITE_ID
			// so there is no site-specific row — fall back to the first detected site
			// (same pattern as securityStatus / serverHarden in server.ts).
			let site = input.siteId === GLOBAL_SITE_ID
				? null
				: await findSite(input.siteId);
			if (!site) {
				const sites = await detectSites();
				site = sites[0] ?? null;
			}
			if (!site) {
				return { ok: false, message: "No site found — deploy a site first." };
			}

			const result = await runVibe(site.installDir, "prod", "backupTest", {
				env: testEnv,
				timeoutMs: 30_000,
			});
			const message = (result.stdout || result.stderr).trim();
			return { ok: result.code === 0, message };
		}),
```

- [ ] **Step 4: Type-check**

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run check-types
```

Expected: no errors.

- [ ] **Step 5: Lint check**

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run check
```

Expected: no errors (auto-fix if needed with `bun run check -- --write`).

- [ ] **Step 6: Commit**

```sh
git add control-panel/packages/api/src/routers/settings.ts
git commit -m "feat: add backupConfigTest oRPC procedure — rclone R2 connectivity probe"
```

---

### Task 4: "Test connection" button in `r2-global-card.tsx`

**Files:**
- Modify: `control-panel/web/src/components/settings/r2-global-card.tsx`

**Interfaces:**
- Consumes: `orpc.backupConfigTest.mutationOptions()` (typed via `AppRouter`); `toast` from `sonner`.
- Pattern reference: `notify-card.tsx` — `handleTest` / `test.isPending` / outline variant button layout.

- [ ] **Step 1: Add the `test` mutation and `handleTest` to `R2GlobalForm`**

Open `/Users/tomrobak/_projects_/vibe-wp/control-panel/web/src/components/settings/r2-global-card.tsx`.

After the `save` mutation line:
```ts
const save = useMutation(orpc.backupConfigSet.mutationOptions());
```

Add:
```ts
const test = useMutation(orpc.backupConfigTest.mutationOptions());
```

After the `handleSave` function, add:

```ts
async function handleTest() {
	try {
		const result = await test.mutateAsync({ siteId: GLOBAL_SITE_ID });
		if (result.ok) {
			toast.success(result.message || "R2 connection OK.");
		} else {
			toast.error(result.message || "R2 connection failed.");
		}
	} catch {
		toast.error("Could not run the R2 connection test.");
	}
}
```

- [ ] **Step 2: Replace the single Save button with a two-button row**

Replace:
```tsx
			<Button
				className="justify-self-start"
				disabled={save.isPending}
				onClick={handleSave}
			>
				{save.isPending ? "Saving…" : "Save"}
			</Button>
```

With:
```tsx
			<div className="flex gap-2">
				<Button disabled={save.isPending} onClick={handleSave}>
					{save.isPending ? "Saving…" : "Save"}
				</Button>
				<Button
					disabled={test.isPending}
					onClick={handleTest}
					variant="outline"
				>
					{test.isPending ? "Testing…" : "Test connection"}
				</Button>
			</div>
```

- [ ] **Step 3: Type-check**

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run check-types
```

Expected: no errors.

- [ ] **Step 4: Lint**

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run check
```

Expected: no errors.

- [ ] **Step 5: Build**

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```sh
git add control-panel/web/src/components/settings/r2-global-card.tsx
git commit -m "feat: add Test connection button to R2 global settings card"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| `bin/backup-test` POSIX sh probe | Task 1 |
| `backup_require_rclone` + `backup_export_rclone` | Task 1 |
| Probe bucket (not prefix) with `rclone lsf` | Task 1 |
| `sh -n` syntax check | Task 1 Step 2 |
| Print `"ok: connected to <bucket>"` + exit 0 | Task 1 |
| Never print secret | Task 1 (no secret in any `echo`) |
| `backupTestEnv` ignoring `enabled` | Task 2 |
| `backupTestEnv` returns null when creds incomplete | Task 2 |
| `backupConfigTest` adminProcedure | Task 3 |
| Null env → friendly message | Task 3 Step 3 |
| Site resolution: findSite → detectSites[0] | Task 3 Step 3 |
| `runVibe` with injected env + 30s timeout | Task 3 Step 3 |
| Button in r2-global-card, outline variant | Task 4 |
| toast.success / toast.error | Task 4 |
| Pending state on button | Task 4 |
| Remove stale "Phase 2" comment | Task 3 Step 2 |
| Gates: check-types, check, build | Tasks 2/3/4 |

**Placeholder scan:** No TBD/TODO/placeholder entries. All code is complete.

**Type consistency:** `backupTestEnv` returns `Promise<Record<string, string> | null>` — consumed in `settings.ts` as `testEnv` which is null-checked before use. `backupConfigTest` returns `{ ok: boolean; message: string }` — consumed in the card via `result.ok` and `result.message`, matching `notifyTest`'s shape exactly.
