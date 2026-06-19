# Installer TUI Redesign — Design Language Overhaul

Date: 2026-06-19
Status: Approved (design phase)
Scope: `installer/` presentation layer only — no `core/` business-logic changes.

## Problem

The current installer TUI reads like a 1990s wizard despite a modern color
palette. The root causes are structural, not chromatic:

1. **Box-in-box-in-box.** Every region (header, rail, main, context, fields,
   action) is a single-line full-border rectangle of near-identical color, so
   there is no visual hierarchy and no focal point.
2. **ASCII markers** (`* > -`) instead of glyphs.
3. **Selection is only a border-color swap** — no filled/inverted active row,
   so focus is weak.
4. **~70% dead vertical space.** Content clings to the top-left; nothing is
   centered or width-capped, so wide terminals sprawl.
5. **Keybinds are dim prose** instead of key-cap chips.
6. **No wordmark, no spacing rhythm, no light dividers** — `gap={1}` and full
   boxes everywhere.

## Goals

- A restrained, modern design language in the spirit of opencode / codex /
  claude-cli: one accent, generous whitespace, selective borders, glyph
  iconography, filled selection states, key-cap chips, a capped & centered
  content column.
- Keep the existing palette (`theme.ts`) — it is already good.
- Presentation-only. `core/` planning, execution, validation, redaction,
  secrets all stay byte-for-byte untouched.
- SSH-safe: functional motion only (task spinner + execute progress bar). No
  decorative animation. Selection/step changes are instant.
- Graceful degradation: glyphs have an ASCII fallback for dumb terminals.

## Non-Goals

- No rewrite of screen logic or the step/focus state machine in `app.tsx`.
- No new dependencies.
- No decorative/per-frame animation, transitions, or easing.
- No changes to `bin/`, Docker, or the stack.

## Decisions (from brainstorm)

- **Ambition:** full design-language overhaul (new shared design layer +
  restyle of chrome/primitives; screens stay structurally the same).
- **Layout:** slim left rail + centered content column capped at ~80 cols;
  right context pane becomes on-demand (toggled with `?`), hidden by default.
- **Identity:** restrained mono + a single accent (periwinkle `#8EA4FF`).
  Status colors (success/warn/danger) are used for status only, never chrome.
- **Motion:** functional only (spinner on running tasks, progress fill on
  Execute). Everything else instant.

## Architecture

All work lives in `installer/src/{app,components,screens}` plus the theme.
New shared modules, each its own file ≤220 lines:

| File | Responsibility |
| --- | --- |
| `app/theme.ts` (extend) | Add semantic role tokens: `focusRing`, `activeStep`, `selectionBg`, `divider`. |
| `app/tokens.ts` (new) | Border-style tokens (`frame="rounded"`, selective sides), spacing scale (`xs/sm/md`), content max-width constant. |
| `components/glyphs.ts` (new) | Glyph map with UTF-8 values + ASCII fallback, resolved once at startup. |
| `components/keycap.tsx` (new) | `<KeyCap>` chip + `<KeyHints>` row (replaces prose footer text). |
| `components/section.tsx` (new) | `<Section title>` (label + light divider, no full box) and `<Card>` (rounded, used sparingly for the single focal block). |
| `components/layout.tsx` (new) | `<Column maxWidth>` centered wrapper + `<Stack gap>` rhythm helper. |
| `components/choice-list.tsx` (align existing untracked file) | Canonical selectable list: glyph marker + filled selected row. Reused by rail, mode, sites. |

Restyled in place (no structural change):

- `components/chrome.tsx` — `Header` (wordmark `◇ VIBE WP` + dim tagline/version,
  drop the `WxH` readout from the header), `StepRail` (`✓ ▸ ○` glyphs, filled
  active row, no per-row borders), `HelpPanel` (on-demand context, restyled),
  `Footer` (KeyHints chips + `Step n/total` + single issues pill),
  `LogStrip` (lighter framing).
- `components/primitives.tsx` — `Field` (focus = accent ring + subtle fill),
  `ToggleRow` (`●——`/`——●` pill instead of `ON/OFF`), `Metric` (inline
  `glyph label value` row, not a box), `Panel`/`ActionRow`/`InfoGrid` aligned
  to the new tokens.
- `app/app.tsx` — shell uses `<Column>` to cap & center the main content;
  context pane defaults hidden and toggles with `?`; compact mode (<92 cols)
  collapses the rail to a one-line dotted stepper `●●○○ 2/13`.

## Design Tokens & Rules

**Roles** (added to `theme.ts`, screens never reference raw hex):
`focusRing` = accent; `activeStep` = accent; `selectionBg` = low-luminance
periwinkle fill (~`#1A1F33`) for selected rows; `divider` = dim border.

**Glyphs** (`glyphs.ts`, UTF-8 → ASCII fallback): `done ✓→[x]`,
`active ▸→>`, `pending ○→-`, `ok ●→*`, `missing ◍→!`, `warn ⚠→!`,
`enter ⏎→Enter`, `tab ⇥→Tab`, `arrows ↑↓→Up/Dn`. Resolved once at startup by
probing `TERM`/`LANG` for UTF-8 and honoring a `--ascii` flag; default to ASCII
when the terminal looks non-UTF8.

**Restraint rules:**
- One accent — periwinkle appears only on focused element, active step, primary
  action, and cursor. Never decorative.
- Status colors are status-only.
- Borders earn their place: outer frame rounded; inner groupings use a single
  light `─` divider or a selective bottom-border, not a full box.
- Selection = filled row (`selectionBg` + accent left-glyph), not a border swap.

## Motion (functional only)

- Task **spinner** (braille `⠋⠙⠹⠸…`, ~10fps, single cell) on running tasks.
- **Progress-bar fill** on the Execute screen.
- Selection and step changes are instant — no transition animation.
- ASCII fallback spinner (`|/-\`) when glyphs are disabled.

## Data Flow

Unchanged. `app.tsx` still owns `state`, `stepIndex`, `focusIndex`,
`showHelp`, `logOpen`; screens remain pure functions of `ScreenProps`. The new
components are presentational and stateless except the spinner's local frame
tick. No screen runs shell commands; all execution stays in `core/`.

## Error / Edge Handling

- **Narrow terminals (<92 cols):** rail collapses to a dotted stepper; content
  column drops its max-width and fills available width; context pane stays
  hidden.
- **Non-UTF8 terminals:** ASCII glyph + spinner fallbacks.
- **Long values (domains, paths):** continue to `truncate`; secrets continue to
  render via the existing secret-mode / `redaction.ts` paths — never widened.

## Testing & Verification

Primary loop is local, on macOS, no GitHub/VPS round-trip:

```sh
cd installer
bun run dev:local          # interactive TUI with fake host facts + sample sites
bun run dev:local --compact # exercise the collapsed/compact layout
bun run src/main.tsx --local --ascii   # verify ASCII fallback path
bun run dry-run:local
bun run export-plan:local  # confirm plans still produce identical output
```

`--local` uses deterministic fake VPS facts, sample sites under
`installer/.vibe-local/`, and simulated execution — it must not write `/opt`,
`/srv`, `/etc/caddy`, env files, or Docker volumes.

Gate before considering any step complete:

```sh
bun run quality   # check:loc (≤220 lines) + typecheck + lint (Biome) + test
```

Unit tests: add focused tests for pure helpers only —
`glyphs.ts` (UTF-8 vs ASCII resolution) and any token/layout math (e.g.
content-width clamping). Visual components are verified via `dev:local`, not
snapshots.

## Build Order

1. Foundation: `theme.ts` roles, `tokens.ts`, `glyphs.ts` (+ test).
2. Shared components: `layout.tsx`, `section.tsx`, `keycap.tsx`, align
   `choice-list.tsx`.
3. Shell: restyle `chrome.tsx` (Header, StepRail, Footer, HelpPanel) and wire
   `<Column>` + context toggle into `app.tsx`.
4. Primitives: restyle `primitives.tsx`.
5. Screen sweep: roll the language across all 13 screens, one group at a time,
   running `dev:local` after each.
6. Motion: spinner + Execute progress bar.
7. Final `bun run quality` + a visual pass in `dev:local` (normal, compact,
   ascii).

## Constraints Honored

- English-only code/docs/UI copy.
- Every file ≤220 lines (`check:loc`); split if a module grows.
- Biome formatting/lint/import-organization.
- `core/` untouched; no shell from components; secrets never printed.
- Do not revert other agents' in-flight untracked work (new screens,
  `choice-list.tsx`, `operations-plan.ts`, etc.) — integrate with it.

## Risks

- **Glyph rendering varies by terminal** → mitigated by ASCII fallback +
  `--ascii` + conservative default.
- **13-screen sweep is the bulk of the effort** → mitigated by doing shared
  components first so screens become small, mechanical edits.
- **220-line cap** may force splitting `chrome.tsx`/`primitives.tsx` → expected;
  extract sub-components into new files as needed.
