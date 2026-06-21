# Vibe WP Control Panel — Shell, Visual System & Dashboard Redesign

Status: Approved design (brainstorm). Date: 2026-06-21.
Scope owner: `control-panel/` web app.

## 1. Context

`control-panel/` is a Turborepo (Bun) scaffold from the Better-T-Stack starter: a Vite +
React 19 + TanStack Router web app, a Hono/oRPC server, and shared packages
(`ui` = full shadcn primitive set, `api`, `auth`, `db`, `env`, `config`). The plumbing and
the architecture (a thin frontend over the headless core + `bin/vibe`) are good. The **UI is
the untouched starter demo**:

- `web/src/routes/__root.tsx` is a bare `grid-rows-[auto_1fr]` (top `Header` + `Outlet`) — no
  app shell, no sidebar, even though `packages/ui` already vendors the shadcn `sidebar`.
- `index.tsx` (a public "Overview") and `_auth/dashboard.tsx` ("Operations") are placeholder
  cards rendering hardcoded `controlOverview` capabilities; screens hand-roll
  `<section className="border …">` instead of using the vendored `Card`/`Badge`/`Table`/etc.
- The product surface uses ~5% of the installed design system.

The roadmap (`docs/product-roadmap.md`) places the web control panel as **Phase 4 (not
started)**; the TUI installer already proved the site-centric IA and the real per-site
operations (13 ops across Check / Maintain / Staging / Danger in `installer/src/core/manage-operations.ts`).

This spec covers the **frontend redesign**: a distinctive, friendly app shell + visual system
+ all screens, built against **mock data**. It is the visual/IA layer of Phase 4.

## 2. Goals / Non-goals

**Goals**
- Replace the starter shell with a production-grade **persistent-sidebar app shell** (Option A).
- A **distinctive, calm, plain-spoken dashboard** that solves the well-documented failures of
  classic dashboards (see §5) — not another cPanel icon-wall or 30-tile SaaS board.
- Build entirely on the **existing `globals.css` tokens** (indigo `--primary`, full light/dark,
  sidebar tokens, `--radius`, Inter). No invented brand colors; **semantic tokens only, never
  hardcoded hex**.
- Use the **vendored shadcn primitives** instead of hand-rolled boxes.
- All screens render against a **typed mock-data layer** whose shapes match the future oRPC
  contract, so wiring to the core later is a swap, not a rewrite.

**Non-goals (explicit — separate follow-up specs)**
- Backend wiring: `server` → `runHeadless` / `bin/vibe`, real status/operation data.
- The **auth/transport story** for remote operations (roadmap flags this as unsolved).
- Real streaming task execution, multi-server, team access (RBAC), Tauri desktop packaging.
- Changing the stack/runtime, the headless core, or `bin/vibe`.

## 3. Brand & visual system

**Personality: "Calm Operator."** Restrained, premium, dense, legible — trust-first chrome
that a non-technical owner and a developer both feel safe in. One confident accent (the
existing indigo `--primary`), neutral surfaces, generous-but-disciplined spacing.

- **Tokens:** consume `@control-panel/ui` `globals.css` as-is via semantic Tailwind classes
  (`bg-background`, `bg-card`, `bg-sidebar`, `text-primary`, `text-muted-foreground`,
  `border-border`, `ring`). Light and dark are both first-class; default theme stays `dark`
  (`ThemeProvider` in `__root.tsx`), toggle via the existing `ModeToggle`/`next-themes`.
- **Radius:** use `--radius` (0.625rem) consistently. Kill the current sharp/flat hand-rolled
  sections — adopt the `Card` radius language everywhere.
- **Type:** Inter Variable (already configured). Tight tracking on headings; comfortable line
  height on body/microcopy.
- **Status colors (approved additive token set).** `globals.css` defines `--destructive` but
  **no success/warning**. Verdicts (Healthy/Watch/Act) and status dots need them. **Decision:
  add** `--success` / `--success-foreground` and `--warning` / `--warning-foreground` to
  **both** `:root` and `.dark`, following the same oklch convention, and register them in
  `@theme inline`. This is additive (functional status colors), not a change to the brand
  palette. Both must meet WCAG-AA against their backgrounds in each theme.

## 4. Shell & layout (Option A — persistent sidebar)

A collapsible left rail + top bar + content area, built on the shadcn `sidebar`
(`SidebarProvider` / `Sidebar` / `SidebarInset`).

**Sidebar anatomy (top → bottom):**
- **Brand** (logo mark + "Vibe WP").
- **Site switcher** — current site name + domain; opens a `DropdownMenu` (or `Command` for
  search at scale) listing all sites + **All sites** (→ portfolio) + **+ New site**.
- **"This site"** group: Overview · Health · Backups · Logs · Staging (contextual to the
  selected site).
- **"Server"** group: Server & security · Settings (host/account level, shared).
- **User footer**: avatar + name/role, account menu (reuses `UserMenu`).
- Collapsible to icon-rail; on mobile it becomes a `Sheet` (shadcn sidebar supports this).

**Top bar:** breadcrumb (`Site / Page`), spacer, then global actions — notifications
(`Popover`), `ModeToggle`, `UserMenu`.

**Routing (TanStack Router, file-based — restructure):**
```
/login
/_auth                         (guard; redirect to /login when no session)
  /_auth/sites                 index → portfolio
  /_auth/sites/$siteId/overview
  /_auth/sites/$siteId/health
  /_auth/sites/$siteId/backups
  /_auth/sites/$siteId/logs
  /_auth/sites/$siteId/staging
  /_auth/server                (Server & security)
  /_auth/settings
/  → redirect to /_auth/sites
```
The current public `index.tsx` Overview is removed; the whole app lives behind `_auth`. The
`$siteId` param drives the "This site" group and the switcher.

## 5. The dashboard concept — "status, not statistics"

Research (NN/g-adjacent dashboard UX literature, hosting-panel critiques, deployment-anxiety
writing) shows classic dashboards fail by: **(1)** data dump/overload (>6 components ≈ 22%
slower task completion), **(2)** no visual hierarchy, **(3)** no next action, **(4)** numbers
without meaning, **(5)** wrong for mixed audiences (cPanel icon-wall overwhelms; Plesk wins by
grouping + plain language), **(6)** jargon, **(7)** production anxiety (the antidote is
reversibility). Sources in §12.

The Overview answers each structurally:

| Problem | Solution in the design |
|---|---|
| Overload (1), hierarchy (2), meaning (4) | **Status hero** — one plain sentence: *"acme-blog is healthy."* |
| Overload (1), hierarchy (2), next action (3), anxiety (7) | **"Needs you" lane** — surfaces *only* what needs action, fix inline; calm empty state *"Nothing needs you"* is the default |
| Meaning (4), jargon (6) | **Verdict tiles** — a word (*Fast/Warm/Plenty*), number secondary, `Tooltip` "what's good" |
| Next action (3), clicks (7) | **Action lives with status** — buttons on the thing, no hunting |
| Jargon (6) | **Plain voice** reused from the TUI manage-operations labels |
| Anxiety (7) | **Safety net** panel + **reversible-by-default** confirms ("we back up first" + consequence + reversible/irreversible badge) |
| Mixed audience (5) | **Two depths** — calm summary + collapsed **"Details for developers"** (containers, raw perf, logs, env) |
| No storytelling | **Activity timeline** — the site's recent story in plain language |

**Overview anatomy:** Status hero → Needs-you lane (conditional) → two-column [Verdict tiles |
Safety net] → Activity timeline → Developer-details expander.

## 6. Pattern library (mapped to vendored shadcn primitives)

Reusable blocks. App-specific blocks live in `web/src/components/`; truly shared primitives stay
in `packages/ui`.

- **AppShell** — `SidebarProvider` + `Sidebar` + `SidebarInset` + top bar.
- **SiteSwitcher** — `DropdownMenu` / `Command`.
- **StatusHero** — `Card`; status ring; live `pulse`; one-line verdict sentence.
- **NeedsYouLane** — `Card` + item rows (icon + plain text + inline `Button`s); **empty state**
  is a first-class, reassuring component.
- **VerdictTile** — `Card` + `Tooltip` (the "?" → "what good looks like").
- **SafetyNet** — `Card` + list (backups, security) + primary action + restore link.
- **ActivityTimeline** — custom list; status dots.
- **ActionCard / OperationButton** — pairs a status with its action.
- **SafetyConfirmDialog** — `AlertDialog`: plain consequence + "we back up first" + a
  reversible/irreversible `Badge`; "Enter to confirm, Esc to cancel" (mirrors the TUI).
- **OperationRunner** — `Dialog`/`Drawer` + `Progress` + `ScrollArea` streaming log
  (redacted); stubbed with a fake stream now, real stream later.
- **DeveloperDetails** — `Collapsible`, collapsed by default.
- **DataTable** — `Table` for backup list / logs.
- **States** — `Skeleton` loading, reassuring empty states, friendly error states; toasts via
  the existing `Sonner` in `__root.tsx`.

## 7. Voice & microcopy

Plain, calm, reassuring — reuse the TUI's validated labels (`manage-operations.ts`):
"Back up now", "Clear the cache", "Copy live to staging", "Publish staging to live",
"Secure the server", "Check it's healthy". Examples:

- Healthy hero: *"acme-blog is healthy. Nothing needs you."*
- Update item: *"WordPress 7.0.1 is available — a small security update. ~20 seconds, and we
  take a fresh backup first. Fully reversible."*
- Destructive confirm: *"This replaces the live database with the backup from 2h ago. We'll
  back up the current state first. This is reversible."*

Avoid raw jargon as primary text; keep it as the secondary/verdict detail.

## 8. Mock-data layer (swap seam)

- A typed `web/src/data/` module exposes fixtures (`sites`, `site overview`, `health`,
  `backups`, `logs`, `staging`, `server`) **shaped like the future oRPC procedure returns**.
- Components consume them through hooks (`useSites()`, `useSiteOverview(siteId)`, …) that return
  fixtures today and will swap to `orpc.*.queryOptions()` later — **one seam, no UI rewrite**.
- Keep the existing `orpc` client + react-query wiring; extend the `@control-panel/api` router
  *types* (the contract shape) even while handlers stay placeholder, so the fixtures and the
  eventual server agree on shape.

## 9. Accessibility & motion

- Keyboard-navigable shell; visible focus via `ring`; optional `Command` palette (⌘K) to switch
  sites / jump to pages.
- WCAG-AA contrast in both themes; verify the added status colors meet AA.
- Motion is subtle and **`prefers-reduced-motion`-aware**: the live pulse, gentle fades on state
  change, no gratuitous animation.
- Responsive: sidebar collapses to icon-rail, then to a `Sheet` on mobile; content reflows
  (two-column → single column).

## 10. File / module structure & conventions

- App-specific components in `web/src/components/`; shared primitives stay in `packages/ui`
  (add any missing shadcn primitive via the CLI into `packages/ui`).
- Follow `control-panel` Biome config; keep components small and focused (one purpose each).
- English everywhere (repo convention). No secrets in UI/logs — reuse the redaction principle for
  any log surface.

## 11. Build order (each phase is shippable / clickable)

0. **Tokens + shell skeleton** — status-color decision; `AppShell` (sidebar + top bar), route
   restructure under `_auth`, light/dark verified. Replaces the current `Header` layout.
1. **Sites + Overview** — portfolio page, `SiteSwitcher`, and the full Overview concept
   (StatusHero, NeedsYouLane + empty state, VerdictTile, SafetyNet, ActivityTimeline,
   DeveloperDetails) against fixtures.
2. **Per-site pages** — Health, Backups (incl. `SafetyConfirmDialog` + `OperationRunner`), Logs,
   Staging.
3. **Shared pages** — Server & security, Settings.
4. **Polish** — empty/loading/error states, motion, `Command` palette, mobile/`Sheet`, a11y pass.

## 12. Success criteria

- A clickable, beautiful panel: every screen renders in **light and dark** against fixtures.
- **Zero hardcoded colors** — semantic tokens only; uses the vendored shadcn kit, not hand-rolled
  boxes.
- The Overview embodies the calm / attention-first / verdict / safety principles.
- Biome clean, TypeScript typechecks, `bun run check` passes.
- Mock-data hooks present a clean swap seam for the future backend wiring.

## 13. Sources (dashboard research)

- UXPin — Dashboard Design Principles: https://www.uxpin.com/studio/blog/dashboard-design-principles/
- Domo — Top 10 dashboard design mistakes: https://www.domo.com/learn/article/top-10-dashboard-design-mistakes-and-what-to-do-about-them
- Databox — Bad dashboard examples: https://databox.com/bad-dashboard-examples
- Designing dashboards for non-technical users (Power BI / Medium): https://medium.com/microsoft-power-bi/how-to-design-data-dashboards-for-non-technical-users-963bb08b2d50
- Sigma — Data fatigue: https://www.sigmacomputing.com/blog/data-fatigue
- Changelog — Reducing server anxiety: https://changelog.com/posts/reducing-server-anxiety
- cbtw — Fear of deploying to production: https://cbtw.tech/insights/fear-of-deploying-to-production

## 14. Resolved decisions (2026-06-21)

1. **Status color tokens** (§3) — **Approved.** Add `--success`/`--warning` (+ foregrounds) to
   `globals.css` in both themes; additive only.
2. **Health page vs Overview** — **Approved: Health is its own page** (the Overview's
   "Details for developers" stays a summary expander, not the full Health surface).
3. **Command palette (⌘K)** — **Approved: defer to Phase 4** polish.
