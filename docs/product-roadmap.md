# Vibe WP Product Vision

Status: archival vision, not a current implementation ledger.
Last reconciled: 2026-06-26.

For current shipped/proven/not-built status, use:

- `docs/superpowers/ROADMAP.md`
- `docs/installer.md`
- `docs/sync-contract.md`
- `todo/installer.md`
- live code

Do not use this file to justify a Tauri feature or to claim VPS validation.

## Vision

Make self-hosted, production-grade WordPress simple enough that a non-technical
owner can choose a small VPS plus Vibe WP instead of shared hosting, while a
developer can use the same stack for local development and production.

The durable product shape is one Docker-native WordPress stack, one headless
operations core, and multiple thin frontends:

- installer TUI/headless core
- web control panel
- future desktop app

## Architecture Principle

All real host logic belongs in reusable core surfaces:

- root `bin/vibe` and related scripts
- installer `src/core`
- panel API host-exec chokepoint

Frontends should orchestrate reviewed operations; they must not spawn arbitrary
host commands or duplicate privileged logic.

## Current Product Boundary

Current production surfaces:

- root WordPress Docker/Compose stack and operational scripts
- guided installer and headless installer core
- web control panel
- local sandbox and local blueprint workflow

Deferred surfaces:

- Tauri desktop UI and packaging
- local pull/push sync
- multi-server/fleet management
- single-binary distribution

## Non-Negotiables

- Every host-changing path has a plan/review step or explicit headless `--yes`.
- Host operations go through `bin/vibe`, installer headless core, or the panel
  wrapper/chokepoint.
- Secrets never appear in argv, logs, summaries, support bundles, browser
  output, or docs.
- VPS validation is claimed only for paths actually re-run on a disposable VPS.
