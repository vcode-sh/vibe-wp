# Control Panel — Live Streaming Experience (design)

**Date:** 2026-06-22
**Branch:** `control-panel-backend-install`
**Status:** approved (brainstorm) — ready for implementation plan

## Problem

The panel's operation runner (backup/restore/etc.) streams real `bin/vibe` output over SSE, but the live experience is poor:

1. **Silent long steps freeze the UI.** During the R2 upload, `bin/backup`'s `rclone` runs with no per-line output, and `LineStream` only emits when a line is pushed — so nothing reaches the client for *minutes*. The dialog shows the last line + a static 50% bar with no sign of life. Users think it hung.
2. **Raw, developer-y rendering.** The runner shows raw log lines ("Dumping MariaDB…") and a flat bar — no per-step state, no elapsed time, no progress.
3. **Dialog is too narrow** (`max-w-lg`).
4. **No genuine progress** for the biggest silent step (the upload).
5. **Routing 404**: `/sites/$siteId` (bare) hits TanStack Router's default "Not Found" — there is no `$siteId/index.tsx`.

The user wants this "developed properly" and **reusable** for other live surfaces. Approved scope: **full real progress** (client liveness + server heartbeat + real `rclone --stats` progress), a **friendly step checklist** (raw log behind a disclosure), and **Logs as a live tail** built on the same primitive.

## Goal

A reusable live-streaming experience: one client primitive consumed by two surfaces (operations + logs), fed by a thin server stream that never goes silent. Friendly presentation and progress are derived **on the client** so the server stays thin and the primitive is reusable.

## Architecture

```
bin/vibe <op>  ──stdout+stderr──▶  streamVibe (merge+redact)  ──▶  LineStream (+heartbeat)
                                                                        │
                                              operationsStream / logsFollow (oRPC SSE)
                                                                        │
                                                   useLiveStream(sourceFactory)  ── client core
                                                            │                          │
                                                  <LiveOperation>              <LiveLogTail>
                                            (steps + progress + cancel)         (raw live tail)
```

### Units

**1. Stream protocol — heartbeat (server)**
- `packages/api/src/core-bridge/line-stream.ts`: while a job is **running and idle**, emit a **heartbeat tick** roughly every 4s; stop on `end()`. A tick is an event with `line: ""`, `done: false` (the client distinguishes it from log lines by the empty `line` and refreshes liveness without appending to the log). Restructure `subscribe()` so a wake with no new buffered lines and not-done yields one tick (today it silently re-waits). The heartbeat `setInterval` is created lazily and **cleared in `end()`** (no dangling timer).
- Value: real liveness (the client knows the server+process are alive, not just a local timer), and it keeps the SSE connection warm through proxies.
- `StreamEvent`/`streamEventSchema` are unchanged in shape (no breaking change); heartbeat reuses the existing fields. A `kind?: "tick"` discriminator is an optional refinement, not required.

**2. Merge stderr into the live stream (server)**
- `packages/api/src/core-bridge/exec.ts` `streamVibe`: read **both** `stdout` and `stderr`, redact each line, and yield them interleaved (best-effort order) into the single line stream. Today `streamVibe` reads only `stdout`, so `rclone`'s stats (written to **stderr**) would never reach the client. `runVibe` (reads) is unchanged. The timeout/`killTree` behavior is unchanged.

**3. Real progress (backend, per-op)**
- `bin/backup`: run the off-site `rclone copy` with `--stats 2s --stats-one-line --stats-log-level NOTICE` so it emits one newline-terminated progress line every 2s (`Transferred: 5.4 MiB / 9.3 MiB, 58%, 1.234 MiB/s, ETA 40s`). These reach the client via the stderr merge (unit 2).
- `bin/restore`: if it moves bytes from off-site (rclone), apply the same `--stats` flags so its long step also reports progress. If restore is local-only (no rclone), leave it — its steps are already short.
- These are the only shell changes; they require a VPS re-validate.

**4. Client core — `useLiveStream` (reusable)**
- `web/src/lib/live/use-live-stream.ts` (or `web/src/hooks/`): `useLiveStream(sourceFactory: () => AsyncIterable<StreamEvent>, opts?)`. Subscribes on mount/open, accumulates non-empty `line`s, and tracks `startedAt` + `lastEventAt` (heartbeats refresh `lastEventAt` only). Returns `{ lines, status, done, lastLine, elapsedMs, isIdle }` where `isIdle` = no log line for > N seconds (still receiving heartbeats). Cleans up the iterator on unmount/close. **Source-agnostic** — operations pass `() => client.operationsStream({ jobId })`; logs pass `() => client.logsFollow({ siteId, source })`.

**5. Client pure utils (unit-tested)**
- `web/src/lib/live/progress.ts`: `parseRcloneProgress(line) → { percent, transferred, total, eta } | null` — recognizes an rclone stats line, else null.
- `web/src/lib/live/steps.ts`: `deriveSteps(lines, stepDefs) → Step[]` where `Step = { label: string; state: "done" | "active" | "pending" }`. `stepDefs` is an ordered list of `{ match: RegExp; label: string }`; the latest matched step is `active`, earlier matched steps `done`, unmatched-later steps `pending`. Operation step defs (backup/restore) live in `web/src/lib/live/op-steps.ts`, keyed by op `kind`.

**6. `<LiveOperation>` (operations UI)**
- `web/src/components/patterns/live-operation.tsx`: consumes `useLiveStream(() => client.operationsStream({jobId}))` + the op's `stepDefs`. Renders: a **wider** dialog (`max-w-2xl`), the friendly **step checklist** (✓ done · spinner on active · muted pending), the active step's **progress bar** when `parseRcloneProgress(lastLine)` is non-null (else an indeterminate working animation), an **elapsed timer**, a "**still working…**" hint when `isIdle`, the honest **terminal status** (Done/Failed/Canceled — from `status`), a "**Show details**" disclosure containing the raw log (the current behavior), and the **Cancel** button (calls `client.operationsCancel`).
- `OperationRunner` becomes a thin wrapper that renders `<LiveOperation kind={…} jobId title open onOpenChange />`, OR is replaced by `<LiveOperation>` at the call sites — the plan picks whichever keeps call sites simplest. Call sites pass the op `kind` (e.g. `"backup"`, `"restore"`) so the right step list is chosen; an unknown kind falls back to a generic single-step "Working…" model.

**7. Logs live-tail (proves reuse)**
- `packages/api/src/routers/logs.ts`: add `logsFollow` (protected) — an oRPC **event-iterator** SSE procedure that tails container logs through the exec layer. It runs a streamed `docker compose … logs -f` (or the existing logs entrypoint with a follow flag) via the same `streamVibe`-style spawn + redaction, and yields `StreamEvent`s. It must be cancelable/cleaned up when the client disconnects (the generator's `return`/`finally` kills the child — reuse the `killTree` pattern). Bounded by a max-runtime safety timeout.
- `web/src/components/patterns/live-log-tail.tsx`: a `<LiveLogTail>` built on the **same** `useLiveStream` core (raw tail rendering — autoscroll, monospace, no step model). The Logs page renders it (with a source selector if one already exists) for a live view; the existing `logsRecent` one-shot remains the initial/non-follow view.

**8. Routing fix**
- `web/src/routes/_auth/sites/$siteId/index.tsx`: an index route whose `beforeLoad` issues `redirect({ to: "/sites/$siteId/overview", params })`. Fixes the bare-URL "Not Found". Pure SPA route — no Caddy change.

## Data flow

1. A mutation returns `{ jobId }`; `<LiveOperation>` opens and `useLiveStream` subscribes to `operationsStream(jobId)`.
2. The server drains `bin/vibe`'s merged stdout+stderr into `LineStream`; idle gaps emit heartbeat ticks.
3. The client accumulates lines, derives steps (`deriveSteps`), parses the active step's progress (`parseRcloneProgress`), and tracks elapsed/idle from event timing.
4. On `done`, the terminal `status` drives Done/Failed/Canceled. Cancel calls `operationsCancel` → `cancelJob` kills the op's process group (existing behavior).
5. Logs: `<LiveLogTail>` subscribes to `logsFollow(siteId)`; the same core renders a raw live tail; closing the page ends the stream and kills the follower.

## Error handling

- Stream/network error → the hook surfaces an error state; `<LiveOperation>` shows a failed/disconnected state (not a fake "Done"); a one-line `toast.error` for cancel failures (existing).
- `parseRcloneProgress` returns `null` on any non-matching line → the UI falls back to the indeterminate working animation (never throws).
- Unknown op `kind` → generic single-step model; never blocks rendering.
- `logsFollow` child is always killed on disconnect/finally and bounded by a max-runtime timeout (no orphaned `-f` tails); redaction applies to every line.

## Testing

- **Unit (pure):** `parseRcloneProgress` (valid stats line → parsed; garbage → null), `deriveSteps` (done/active/pending transitions; unknown lines ignored), and the hook's idle/elapsed logic where extractable. TABS, no `any`.
- **Gate per task:** `bun run check-types` && `bun run check` && `bun run test` (and `bun run build` for web-touching tasks).
- **VPS acceptance gate:** redeploy to `panel.vcode.sh`; run a real **backup** → the dialog shows the friendly step checklist with the active step + a **live R2 upload progress %** that advances (no frozen UI); confirm the **heartbeat** keeps it alive during the upload; open **Logs** → a **live tail** streams new lines; confirm Cancel still kills the tree; confirm `/sites/test2-vcode-sh` redirects to overview.

## Global constraints

- **TABS** in `control-panel` TS/TSX (ultracite); TS/TSX **≤220 lines** (split into focused modules — the client `live/` dir keeps hook/utils/components separate).
- **Exec layer is the only host-spawn site**; `logsFollow` spawns through the same allowlisted/redacted path, argv arrays, with a timeout + guaranteed child cleanup (`killTree`).
- **Never print secrets** — redaction applies to every streamed line (stdout AND stderr) and to `logsFollow`.
- **shadcn/ui primitives + semantic tokens only** — no hardcoded colors; reuse `text-success`/`text-destructive`/`text-muted-foreground`, `Progress`, `Dialog`, `ScrollArea`, `Collapsible`.
- English copy; friendly, consistent voice (matches the activity-timeline labels).

## Non-goals / follow-ups (out of this round)

- Per-step server-emitted progress (we derive on the client). 
- A general progress protocol beyond rclone stats (only rclone stats parsed now).
- Wiring live streaming into install/other surfaces beyond operations + logs (the primitive is built to plug in later).
- The pre-existing in-memory `registry`/`finalized` unbounded growth (tracked separately as a job-reaper follow-up).
