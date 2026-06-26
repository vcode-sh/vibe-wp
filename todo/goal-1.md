Goal: close pre-Tauri product gap in `/Users/tomrobak/_projects_/vibe-wp`.

Rules:
- All code, docs, tests, branches, and commits in English.
- Run `git status --short`.
- Other agents may be working here. Do not edit unrelated files or revert others' work.
- Truth surfaces: `AGENTS.md`, `docs/superpowers/ROADMAP.md`, `todo/installer.md`, and live code. `docs/product-roadmap.md` is older vision only.
- Do not build Tauri features. Tauri stays scaffold-only until web panel, distribution/update, sync, and local workflow are ready.
- Host ops must go through `bin/vibe`, installer headless core, or the panel host-exec chokepoint. Never spawn host commands directly from routes or UI.
- Preserve allowlists, argv arrays, timeouts, jobs, audit logs, redaction. Never print secrets.

Objective: close web panel proof, install/update hardening, safe sync contract, local workflow foundation, and docs reconciliation before Tauri.

Execution:
Act as coordinator first. Use parallel agents only for read-only audits or isolated implementation in separate branches/worktrees or non-overlapping files. Keep moving until blocked by a real external dependency.

Phase 0:
Read `docs/superpowers/ROADMAP.md`, `todo/installer.md`, `docs/product-roadmap.md`, `bin/panel`, `bin/vibe`, `bin/vibe-panel-run`, and panel package files. Map shipped/verified, built needing GUI/VPS proof, stale docs, and genuinely not built.

Phase 1: read-only audits
- Web Panel: audit GUI/API, RBAC, realtime, tests, failures, support bundle, panel update, VPS proof.
- Distribution/Update: audit `bin/panel`, `bin/vibe-panel-run`, bootstrap, update/reinstall/uninstall, secrets, migrations, rollback, support bundle.
- Sync: audit `refresh-from-prod`, `promote-files-to-prod`, staging ops, UI/API, backup, dry-run/diff, URL rewrite, conflicts, confirmations. Return safe contract.
- Local Workflow: audit local create/list/delete/reset, ports/domains, blueprints, diagnostics, pull/push. Return minimal workflow/files.
- Docs: audit roadmap/todo/product contradictions.

Phase 2:
Merge audits into an implementation plan split by the five objectives.

Phase 3:
Implement safest order. Parallelize only when scopes are isolated.
- Web Panel: add/fix tests, RBAC, realtime invalidation, failure states, operations tray, support/update UX.
- Install/Update: harden `bin/panel install/update/reinstall/uninstall`; preserve secrets; handle DB migrations; backup before update; improve recovery/status. No host-changing commands except approved VPS.
- Sync: add/harden dry-run/plan, include/exclude sets, backup-before-change, URL rewrite safety, conflict checks, structured output. Do not sync secrets or weaken confirmations.
- Local Workflow: build CLI/headless local inventory/create/reset/delete and blueprint shape. No desktop UI. No unsafe writes outside local scope.
- Docs: update after code truth is known. Separate shipped, built locally, GUI-proven, VPS-validated. Do not claim VPS proof unless run.

Verification:
```sh
cd /Users/tomrobak/_projects_/vibe-wp/control-panel
bun run check && bun run check-types && bun run test
```
```sh
cd /Users/tomrobak/_projects_/vibe-wp/installer
bun run quality
```

Done: critical web panel flows tested, install/update safer and documented, sync has dry-run/plan plus backup-before-change, local workflow foundation exists, docs reconciled, Tauri scaffold-only, checks pass, no secrets leaked.

Final report: tracks, files, commands/results, VPS validation, risks, next Tauri step.
