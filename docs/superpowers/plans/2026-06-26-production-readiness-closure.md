# Production Readiness Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining pre-Tauri production gaps that were still listed after the first hardening pass.

**Architecture:** Keep host-changing work behind `bin/panel`, `bin/vibe`, installer core, and the existing panel host-exec chokepoint. Add small, testable contracts: updater health/version guardrails in the shell script, richer read-only sync plans in API pure code, and installer post-run summary/failure guidance in installer core/UI without growing monolithic screens.

**Tech Stack:** POSIX shell, Bun, TypeScript, React, OpenTUI, oRPC, Vitest, Biome/Ultracite.

---

### Task 1: Panel Update Health And Version Guardrails

**Files:**
- Modify: `bin/panel`
- Modify: `control-panel/packages/api/src/core-bridge/panel-update-script.test.ts`
- Modify: `control-panel/web/src/components/settings/server-maintenance-card.tsx`

- [ ] **Step 1: Write failing updater contract tests**

Add assertions that `bin/panel` has a `panel_update_healthcheck` function, calls it after `deploy_panel`, restores the snapshot when healthcheck fails, and supports a pinned update ref.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd control-panel && bun test packages/api/src/core-bridge/panel-update-script.test.ts`

Expected: fail because the healthcheck and ref contract are not implemented yet.

- [ ] **Step 3: Implement minimal updater hardening**

Add `--ref <git-ref>` parsing for `update`, `VIBE_PANEL_UPDATE_REF` fallback, safe ref validation, fetch/checkout when pinned, existing `git pull --ff-only` when not pinned, and a post-deploy healthcheck that verifies systemd is active plus local HTTP responds. If healthcheck fails after deploy, restore the snapshot and return non-zero.

- [ ] **Step 4: Improve update confirmation copy**

Adjust the GUI update confirmation so it says a snapshot is taken first and the previous panel is restored if the deploy or health check fails.

- [ ] **Step 5: Verify focused tests pass**

Run: `cd control-panel && bun test packages/api/src/core-bridge/panel-update-script.test.ts`

Expected: pass.

### Task 2: Sync Plan Durability, Freshness, And Rewrite Preview

**Files:**
- Modify: `control-panel/packages/api/src/core-bridge/sync-plan.ts`
- Modify: `control-panel/packages/api/src/core-bridge/sync-plan.test.ts`
- Modify: `control-panel/packages/api/src/routers/staging.ts`
- Modify: `control-panel/packages/api/src/routers/staging.test.ts`
- Modify: `docs/sync-contract.md`

- [ ] **Step 1: Write failing sync plan tests**

Add tests that every plan includes a deterministic `planId`, `createdAt`, `expiresAt`, `freshness`, and `urlRewrite.preview` for refresh plans, without exposing secrets.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `cd control-panel && bun test packages/api/src/core-bridge/sync-plan.test.ts packages/api/src/routers/staging.test.ts`

Expected: fail because those fields are absent.

- [ ] **Step 3: Implement pure plan enrichment**

Add an injectable clock, deterministic hash over non-secret plan identity, freshness window metadata, and URL rewrite preview text/count placeholder using only known URLs. Keep apply read-only and do not create a destructive apply route.

- [ ] **Step 4: Thread plan metadata through the router**

Pass the current clock from `stagingSyncPlan`; keep `runVibe env` calls as the only host reads.

- [ ] **Step 5: Verify focused tests pass**

Run: `cd control-panel && bun test packages/api/src/core-bridge/sync-plan.test.ts packages/api/src/routers/staging.test.ts`

Expected: pass.

### Task 3: Installer Summary And Failure Recovery UX

**Files:**
- Create: `installer/src/core/install-summary.ts`
- Create: `installer/src/core/install-summary.test.ts`
- Modify: `installer/src/screens/execute-screen.tsx`
- Modify: `installer/src/core/types.ts` if a narrow type export is needed
- Modify: `todo/installer.md`
- Modify: `docs/installer.md`

- [ ] **Step 1: Write failing summary tests**

Test that a successful plan produces copyable next steps, support bundle path guidance, resume command, panel/site URLs, and no secrets; test that failed results produce a failure recovery summary with the failed task id and exact retry/support commands.

- [ ] **Step 2: Run focused installer tests and verify failure**

Run: `cd installer && bun test src/core/install-summary.test.ts`

Expected: fail because the summary module is missing.

- [ ] **Step 3: Implement the summary helper**

Create a pure helper that accepts a plan and task results and returns short English lines. Do not include generated passwords or env values.

- [ ] **Step 4: Show summary/recovery guidance in Execute screen**

After `runPlan`, append the summary lines into the existing latest log area and ensure failed runs show support bundle and resume guidance.

- [ ] **Step 5: Verify focused installer tests pass**

Run: `cd installer && bun test src/core/install-summary.test.ts`

Expected: pass.

### Task 4: Targeted UX And Performance Polish

**Files:**
- Modify: `control-panel/web/src/components/settings/server-maintenance-card.tsx`
- Modify: `control-panel/web/src/routes/_auth/sites/$siteId/staging.tsx`
- Modify: `control-panel/web/src/lib/realtime/invalidation-rules.ts`
- Modify or add focused web tests only if behavior changes require it

- [ ] **Step 1: Make risky action copy explicit and compact**

Ensure staging publish and panel update describe snapshot, rollback, and where progress appears without adding marketing text.

- [ ] **Step 2: Verify realtime invalidation covers enriched sync/staging outputs**

Keep staging push invalidation scoped to staging, backups, runtime health/perf, and server summary.

- [ ] **Step 3: Re-run focused UI/unit tests**

Run: `cd control-panel && bun test web/src/lib/realtime/invalidation-rules.test.ts web/src/lib/live/op-steps.test.ts`

Expected: pass.

### Task 5: Docs Reconciliation And Full Verification

**Files:**
- Modify: `docs/superpowers/ROADMAP.md`
- Modify: `todo/installer.md`
- Modify: `docs/installer.md`
- Modify: `docs/sync-contract.md`
- Modify: `control-panel/README.md`

- [ ] **Step 1: Update docs after code truth is known**

Separate shipped locally, GUI-proven, and VPS-validated. Do not claim new VPS proof unless run.

- [ ] **Step 2: Run full verification**

Run:

```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run check && bun run check-types && bun run test
```

Run:

```sh
cd /Users/tomrobak/_projects_/vibe-wp/installer
bun run quality
```

Expected: both pass.

- [ ] **Step 3: Browser/VPS spot proof if GUI-affecting code changed**

Use the existing test VPS and authenticated browser path only if the staged GUI flow or updater flow changed in a way unit tests cannot prove.

---

Self-review: This plan covers every remaining gap called out in the current reconciliation docs: update health/version guardrails, sync plan ids/freshness/rewrite preview, installer final summary/failure recovery, targeted UX/performance copy, docs reconciliation, and full gates. It intentionally does not build Tauri features or bypass the host-exec chokepoint.
