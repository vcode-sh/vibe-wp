# Installer TUI Redesign Implementation Plan

## Status — 2026-06-19

**All 12 original tasks DONE**, plus substantial scope beyond the original plan
(the installer grew into a VPS manager). Shipped on branch `installer-tui-redesign`:

- ✅ Design language: opencode/t1code-inspired layered surfaces, **WordPress-blue** accent,
  glyphs, muted-blue selection + bright left accent bar, ASCII fallback, motion (spinner +
  progress), tinted card surfaces.
- ✅ Navigation made intuitive: Space toggles (Enter never double-fires), context-aware
  footer hints per screen, full mouse support (click choices/toggles/button/ops/completed
  rail steps).
- ✅ Dynamic wizard flow (`app/flow.ts`): steps branch by mode; Sites is the single intent
  picker; old "Mode" → "Location"; **Quick vs Custom** new-site fork (Quick = domain + email).
- ✅ Friendly **Manage dashboard** (`screens/dashboard-screen.tsx` + `core/manage-operations.ts`):
  grouped plain-language ops over `bin/vibe`, color-coded safety, confirm-on-danger, status cards.
- ✅ **Headless core** (Phase 3): `core/index.ts` facade, `runHeadless` dispatcher,
  `core/boundary.test.ts` guard, `--headless-json` entrypoint.
- ✅ Welcome hero with ASCII wordmark + author credits (`core/credits.ts`).

Gate green throughout: `bun run quality` (≤220 lines, typecheck, Biome, 26 tests).
Roadmap: `docs/product-roadmap.md`. **In progress:** a screen-by-screen idiot-proofing pass
(inline validation, plain-language help) — see commits after this date.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the installer's flat box-in-box TUI with a restrained modern design language (one accent, glyphs, filled selection, key-cap chips, capped/centered content column) without touching any `core/` business logic.

**Architecture:** Introduce a small shared design layer (`tokens.ts`, `glyphs.ts`, `layout.tsx`, `section.tsx`, `keycap.tsx`), then restyle the ~8 shared presentational components (`chrome.tsx`, `primitives.tsx`, `choice-list.tsx`) so the new look propagates to all 13 screens. Screens get only bespoke text/hero/progress edits. Functional motion only (task spinner + Execute progress bar); everything else instant for SSH safety.

**Tech Stack:** Bun, React 19, `@opentui/react` + `@opentui/core` (supports `borderStyle: "rounded"`, per-side `border={["bottom"]}`, `title`/`bottomTitle`, `customBorderChars`). Biome lint/format. `bun test` runner.

## Global Constraints

- English for all code, comments, UI copy, commit messages.
- Every TS/TSX file ≤220 lines (`bun run check:loc`). Split into new modules if a file would exceed this.
- `core/` is untouched: no planning/execution/validation/redaction/secrets changes. No shell from components.
- Never print secrets; keep the existing `Field` secret-mode and `redaction.ts` paths intact.
- No new dependencies.
- One accent only (periwinkle `#8EA4FF`). Status colors (`success`/`warning`/`danger`) used for status only, never chrome.
- Glyphs always resolve through the glyph map with an ASCII fallback driven by the existing `options.ascii` flag (and a non-UTF8 `LANG`/`TERM` default).
- Verify after every task: `bun run quality` (check:loc + typecheck + Biome lint + tests) and a visual pass with `bun run dev:local` (plus `--compact` and `--ascii` where relevant). `--local` must never write `/opt`, `/srv`, `/etc/caddy`, env files, or Docker volumes.
- Do not revert other agents' in-flight untracked work.

---

### Task 1: Theme role tokens + design tokens

**Files:**
- Modify: `installer/src/app/theme.ts`
- Create: `installer/src/app/tokens.ts`
- Test: `installer/src/app/tokens.test.ts`

**Interfaces:**
- Produces: `theme` gains keys `focusRing`, `activeStep`, `selectionBg`, `divider` (all `string` hex). `tokens.ts` exports `const CONTENT_MAX_WIDTH = 84`, `const RAIL_WIDTH = 22`, `const space = { xs: 0, sm: 1, md: 2 } as const`, `const BORDER = { frame: "rounded", inset: "single" } as const` (values are `@opentui/core` `BorderStyle`), and `function clampContentWidth(available: number): number` returning `Math.min(available, CONTENT_MAX_WIDTH)`.

- [ ] **Step 1: Write the failing test**

```ts
// installer/src/app/tokens.test.ts
import { expect, test } from "bun:test";
import { clampContentWidth, CONTENT_MAX_WIDTH } from "./tokens";

test("clampContentWidth caps wide terminals", () => {
  expect(clampContentWidth(300)).toBe(CONTENT_MAX_WIDTH);
});

test("clampContentWidth keeps narrow widths", () => {
  expect(clampContentWidth(60)).toBe(60);
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd installer && bun test src/app/tokens.test.ts`
Expected: FAIL — cannot find module `./tokens`.

- [ ] **Step 3: Add role tokens to `theme.ts`**

Add inside the `theme` object (keep existing keys):

```ts
  focusRing: "#8EA4FF",
  activeStep: "#8EA4FF",
  selectionBg: "#1A2133",
  divider: "#1C222B",
```

- [ ] **Step 4: Create `tokens.ts`**

```ts
import type { BorderStyle } from "@opentui/core";

export const CONTENT_MAX_WIDTH = 84;
export const RAIL_WIDTH = 22;

export const space = { xs: 0, sm: 1, md: 2 } as const;

export const BORDER: { frame: BorderStyle; inset: BorderStyle } = {
  frame: "rounded",
  inset: "single"
};

export function clampContentWidth(available: number): number {
  return Math.min(available, CONTENT_MAX_WIDTH);
}
```

(If `BorderStyle` is not exported from the package root, import from `@opentui/core/lib/border` — confirm during implementation.)

- [ ] **Step 5: Run test, expect PASS**

Run: `cd installer && bun test src/app/tokens.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add installer/src/app/theme.ts installer/src/app/tokens.ts installer/src/app/tokens.test.ts
git commit -m "Add design role tokens and layout tokens"
```

---

### Task 2: Glyph map with ASCII fallback

**Files:**
- Create: `installer/src/components/glyphs.ts`
- Test: `installer/src/components/glyphs.test.ts`

**Interfaces:**
- Produces: `type GlyphName = "done" | "active" | "pending" | "ok" | "missing" | "warn" | "enter" | "tab" | "arrows" | "bullet"`; `function resolveGlyphs(ascii: boolean): Record<GlyphName, string>`; `function shouldUseAscii(opts: { ascii: boolean; env?: NodeJS.ProcessEnv }): boolean` (true when `opts.ascii`, or when `LANG`/`LC_ALL`/`TERM` lack `UTF`/`utf8` and are set). The spinner frames: `function spinnerFrames(ascii: boolean): string[]` → braille `["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]` or `["|","/","-","\\"]`.

- [ ] **Step 1: Write the failing test**

```ts
// installer/src/components/glyphs.test.ts
import { expect, test } from "bun:test";
import { resolveGlyphs, shouldUseAscii, spinnerFrames } from "./glyphs";

test("unicode glyphs by default", () => {
  expect(resolveGlyphs(false).done).toBe("✓");
});

test("ascii fallback swaps every glyph to ascii-safe", () => {
  const g = resolveGlyphs(true);
  for (const v of Object.values(g)) {
    expect(/^[\x20-\x7e]+$/.test(v)).toBe(true);
  }
});

test("shouldUseAscii honors explicit flag", () => {
  expect(shouldUseAscii({ ascii: true, env: { LANG: "en_US.UTF-8" } })).toBe(true);
});

test("shouldUseAscii defaults ascii for non-utf8 locale", () => {
  expect(shouldUseAscii({ ascii: false, env: { LANG: "C" } })).toBe(true);
  expect(shouldUseAscii({ ascii: false, env: { LANG: "en_US.UTF-8" } })).toBe(false);
});

test("spinner frames differ by mode", () => {
  expect(spinnerFrames(false).length).toBeGreaterThan(1);
  expect(spinnerFrames(true)).toContain("/");
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `cd installer && bun test src/components/glyphs.test.ts`
Expected: FAIL — cannot find module `./glyphs`.

- [ ] **Step 3: Implement `glyphs.ts`**

```ts
export type GlyphName =
  | "done" | "active" | "pending" | "ok" | "missing"
  | "warn" | "enter" | "tab" | "arrows" | "bullet";

const UNICODE: Record<GlyphName, string> = {
  done: "✓", active: "▸", pending: "○", ok: "●", missing: "◍",
  warn: "⚠", enter: "⏎", tab: "⇥", arrows: "↑↓", bullet: "•"
};

const ASCII: Record<GlyphName, string> = {
  done: "x", active: ">", pending: "-", ok: "*", missing: "!",
  warn: "!", enter: "Enter", tab: "Tab", arrows: "Up/Dn", bullet: "-"
};

export function resolveGlyphs(ascii: boolean): Record<GlyphName, string> {
  return ascii ? ASCII : UNICODE;
}

export function shouldUseAscii(opts: { ascii: boolean; env?: NodeJS.ProcessEnv }): boolean {
  if (opts.ascii) {
    return true;
  }
  const env = opts.env ?? process.env;
  const locale = env.LC_ALL || env.LANG || "";
  if (locale && !/utf-?8/i.test(locale)) {
    return true;
  }
  return env.TERM === "dumb";
}

export function spinnerFrames(ascii: boolean): string[] {
  return ascii
    ? ["|", "/", "-", "\\"]
    : ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `cd installer && bun test src/components/glyphs.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add installer/src/components/glyphs.ts installer/src/components/glyphs.test.ts
git commit -m "Add glyph map with ASCII fallback and spinner frames"
```

---

### Task 3: Glyph context provider

**Files:**
- Create: `installer/src/components/glyph-context.tsx`
- Modify: `installer/src/app/app.tsx` (wrap tree, ~line 103-127)

**Interfaces:**
- Consumes: `resolveGlyphs`, `shouldUseAscii` (Task 2); `options.ascii` (already on `InstallerOptions`).
- Produces: `<GlyphProvider ascii={boolean}>` and `function useGlyphs(): Record<GlyphName, string>` plus `function useAscii(): boolean`. Components read glyphs via this hook instead of importing the map directly (keeps ascii resolution in one place).

- [ ] **Step 1: Implement provider**

```tsx
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { type GlyphName, resolveGlyphs } from "./glyphs";

const GlyphContext = createContext<{ glyphs: Record<GlyphName, string>; ascii: boolean }>({
  glyphs: resolveGlyphs(false),
  ascii: false
});

export function GlyphProvider({ ascii, children }: { ascii: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ glyphs: resolveGlyphs(ascii), ascii }), [ascii]);
  return <GlyphContext.Provider value={value}>{children}</GlyphContext.Provider>;
}

export function useGlyphs(): Record<GlyphName, string> {
  return useContext(GlyphContext).glyphs;
}

export function useAscii(): boolean {
  return useContext(GlyphContext).ascii;
}
```

- [ ] **Step 2: Wrap the app tree in `app.tsx`**

Compute once near the top of `App`: `const ascii = useMemo(() => shouldUseAscii({ ascii: options.ascii }), [options.ascii]);` (import `shouldUseAscii` from `../components/glyphs`). Wrap the returned root `<box>` in `<GlyphProvider ascii={ascii}>...</GlyphProvider>`.

- [ ] **Step 3: Verify build + visual**

Run: `cd installer && bun run typecheck && bun run dev:local`
Expected: typecheck passes; TUI still renders (no visual change yet). Quit with Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add installer/src/components/glyph-context.tsx installer/src/app/app.tsx
git commit -m "Add glyph context provider and wire into app shell"
```

---

### Task 4: Layout primitives (Column, Stack)

**Files:**
- Create: `installer/src/components/layout.tsx`

**Interfaces:**
- Consumes: `CONTENT_MAX_WIDTH`, `space` (Task 1).
- Produces: `<Column maxWidth?={number}>` — centers children horizontally by capping width (renders a centered child box of `maxWidth` inside a row with `justifyContent="center"`); `<Stack gap?={number} grow?={boolean}>` — vertical flex column with consistent gap. Both accept `children: ReactNode`.

- [ ] **Step 1: Implement**

```tsx
import type { ReactNode } from "react";
import { CONTENT_MAX_WIDTH, space } from "../app/tokens";

export function Column({
  children,
  maxWidth = CONTENT_MAX_WIDTH
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <box flexDirection="row" flexGrow={1} justifyContent="center">
      <box flexDirection="column" flexGrow={1} maxWidth={maxWidth}>
        {children}
      </box>
    </box>
  );
}

export function Stack({
  children,
  gap = space.sm,
  grow = false
}: {
  children: ReactNode;
  gap?: number;
  grow?: boolean;
}) {
  return (
    <box flexDirection="column" flexGrow={grow ? 1 : undefined} gap={gap}>
      {children}
    </box>
  );
}
```

(Confirm `maxWidth` is a valid OpenTUI box prop during implementation; if not, fall back to `width={maxWidth}` with side spacer boxes.)

- [ ] **Step 2: Verify typecheck**

Run: `cd installer && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add installer/src/components/layout.tsx
git commit -m "Add Column and Stack layout primitives"
```

---

### Task 5: Section header + Card + KeyCap

**Files:**
- Create: `installer/src/components/section.tsx`
- Create: `installer/src/components/keycap.tsx`

**Interfaces:**
- Consumes: `theme` colors, `BORDER` (Task 1), `useGlyphs` (Task 3).
- Produces:
  - `section.tsx`: `<Section title={string}>{children}</Section>` — bold accent label, a light full-width `divider`-colored `─` rule (a `box` with `border={["bottom"]}` and `borderColor={color("divider")}`), then children. `<Card>{children}</Card>` — a single rounded-border focal box (`borderStyle={BORDER.frame}`).
  - `keycap.tsx`: `<KeyCap>{label}</KeyCap>` — text chip with `backgroundColor={color("panel3")}` and `paddingX={1}`; `<KeyHints hints={Array<{ key: string; label: string }>} />` — a row of `KeyCap` + dim label pairs separated by `space.md`.

- [ ] **Step 1: Implement `keycap.tsx`**

```tsx
import type { ReactNode } from "react";
import { color } from "../app/theme";
import { space } from "../app/tokens";

export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <box backgroundColor={color("panel3")} paddingX={1}>
      <text fg={color("text")}>{children}</text>
    </box>
  );
}

export function KeyHints({ hints }: { hints: Array<{ key: string; label: string }> }) {
  return (
    <box flexDirection="row" gap={space.md}>
      {hints.map((hint) => (
        <box flexDirection="row" gap={space.sm} key={`${hint.key}-${hint.label}`}>
          <KeyCap>{hint.key}</KeyCap>
          <text fg={color("muted")}>{hint.label}</text>
        </box>
      ))}
    </box>
  );
}
```

- [ ] **Step 2: Implement `section.tsx`**

```tsx
import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { color } from "../app/theme";
import { BORDER, space } from "../app/tokens";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <box flexDirection="column" gap={space.sm}>
      <box border={["bottom"]} borderColor={color("divider")} flexDirection="row">
        <text attributes={TextAttributes.BOLD} fg={color("accent")}>
          {title}
        </text>
      </box>
      {children}
    </box>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <box
      borderColor={color("border")}
      borderStyle={BORDER.frame}
      flexDirection="column"
      flexGrow={1}
      padding={space.sm}
    >
      {children}
    </box>
  );
}
```

- [ ] **Step 3: Verify typecheck**

Run: `cd installer && bun run typecheck`
Expected: PASS. (If `border={["bottom"]}` typing complains, use the `borderStyle` + `border` props per the confirmed `BorderSides[]` support.)

- [ ] **Step 4: Commit**

```bash
git add installer/src/components/section.tsx installer/src/components/keycap.tsx
git commit -m "Add Section, Card, and KeyCap presentational components"
```

---

### Task 6: Restyle ChoiceList (filled selection + glyph)

**Files:**
- Modify: `installer/src/components/choice-list.tsx`

**Interfaces:**
- Consumes: `useGlyphs` (Task 3), `selectionBg`/`focusRing` tokens (Task 1).
- Produces: same public `ChoiceList` props (unchanged API). Visual change only.

- [ ] **Step 1: Restyle `ChoiceRow`**

Replace the row visuals: drop the per-row full `border`; selected row uses `backgroundColor={color("selectionBg")}` and a left active glyph (`useGlyphs().active`) in accent; unselected rows use `bullet`/space marker in `subtle`. Replace the `"selected"` text with nothing (the fill is the signal). Keep number-prefix and description. Active number/name in `color("text")` bold; inactive in `color("muted")`. Pass `focused` through so the active glyph only shows accent when the list is focused (use accent when `focused`, else `muted`).

Concrete row body:

```tsx
function ChoiceRow({ active, focused, index, marker, option }: {
  active: boolean; focused: boolean; index: number; marker: string;
  option: { description: string; name: string; value: string };
}) {
  return (
    <box
      backgroundColor={active ? color("selectionBg") : color("panel")}
      flexDirection="column"
      paddingX={1}
    >
      <box flexDirection="row" gap={1}>
        <text fg={active ? color(focused ? "accent" : "muted") : color("subtle")}>{marker}</text>
        <text attributes={active ? TextAttributes.BOLD : TextAttributes.NONE} fg={color(active ? "text" : "muted")}>
          {index + 1}. {option.name}
        </text>
      </box>
      <text fg={color("subtle")} wrapMode="word">{option.description}</text>
    </box>
  );
}
```

In `ChoiceList`, compute `const glyphs = useGlyphs();` and pass `marker={option.value === value ? glyphs.active : glyphs.bullet}` and `focused={focused}` to each row.

- [ ] **Step 2: Verify build + visual**

Run: `cd installer && bun run typecheck && bun run dev:local`
Expected: typecheck passes; on the Sites/Mode steps the selected option is a filled row with a `▸` marker, no per-row boxes. Try `--ascii`: `bun run src/main.tsx --local --ascii`.

- [ ] **Step 3: Commit**

```bash
git add installer/src/components/choice-list.tsx
git commit -m "Restyle ChoiceList with filled selection and glyph marker"
```

---

### Task 7: Restyle shared primitives

**Files:**
- Modify: `installer/src/components/primitives.tsx`

**Interfaces:**
- Consumes: `useGlyphs` (Task 3), role tokens (Task 1).
- Produces: unchanged public APIs for `Field`, `ToggleRow`, `Metric`, `InfoGrid`, `Panel`, `ActionRow`. Visual change only. If the file would exceed 220 lines, split `Metric`+`InfoGrid` into `installer/src/components/data-display.tsx` and re-export.

- [ ] **Step 1: Apply restyle**

- `Field`: focused → `borderColor={color("focusRing")}`, `borderStyle="rounded"`, `backgroundColor={color("panel2")}`; replace `"editing"` text with a small `useGlyphs().active` accent marker. Keep secret-mode masking exactly as-is.
- `ToggleRow`: replace `ON`/`OFF` text with a pill — `value ? "●——" : "——●"` is too literal; use `useGlyphs().ok` left/right: render `<text fg={value ? color("success") : color("subtle")}>{value ? "on" : "off"}</text>` preceded by a filled/empty glyph (`value ? glyphs.ok : glyphs.pending`). Focused → rounded accent border.
- `Metric`: convert from boxed to an inline row: `glyph label value` — drop the `border`; use a leading status glyph colored by `tone`. Keep `flexGrow`.
- `InfoGrid`: lighten — drop full border, use a `border={["left"]}` accent-divider strip; keep label/value rows.
- `Panel`: rounded border (`borderStyle="rounded"`), title in accent bold, content unchanged.
- `ActionRow`: rounded accent border; prefix primary with `useGlyphs().enter` in a `KeyCap`-style chip (import `KeyCap` from `./keycap`).

- [ ] **Step 2: Check line count + build**

Run: `cd installer && bun run check:loc && bun run typecheck && bun run dev:local`
Expected: `check:loc` passes (≤220); primitives render with the new look across Domain/Admin/AI/Performance steps.

- [ ] **Step 3: Commit**

```bash
git add installer/src/components/primitives.tsx
git commit -m "Restyle shared primitives to new design language"
```

---

### Task 8: Restyle chrome (Header, StepRail, Footer, HelpPanel, LogStrip)

**Files:**
- Modify: `installer/src/components/chrome.tsx`
- If >220 lines after edits, split `StepRail` into `installer/src/components/step-rail.tsx` and re-export from `chrome.tsx`.

**Interfaces:**
- Consumes: `useGlyphs` (Task 3), `KeyCap`/`KeyHints` (Task 5), role tokens, `RAIL_WIDTH` (Task 1).
- Produces: unchanged exported component names (`Header`, `StepRail`, `HelpPanel`, `LogStrip`, `Footer`).

- [ ] **Step 1: Header**

Make it a compact wordmark: `◇ VIBE WP` (use `useGlyphs().bullet`-style diamond; if no diamond glyph, use a `"◇"` literal with ascii fallback `"#"` — add a `wordmark` glyph to the map in Task 2 if cleaner) in accent bold, tagline in muted, version right-aligned. Remove the `dimensions.width x height` readout from the header (moves to debug/context only). Keep `border` but use `borderStyle="rounded"`.

- [ ] **Step 2: StepRail**

Replace `* > -` markers with glyphs: done → `glyphs.done` in `success`, active → `glyphs.active` in `accent`, pending → `glyphs.pending` in `subtle`. Active row gets `backgroundColor={color("selectionBg")}`. Drop the per-row gap noise; remove the outer heavy look — keep one rounded border, `width={RAIL_WIDTH}`.

- [ ] **Step 3: Footer**

Replace the prose keybind text with `<KeyHints hints={[{key: glyphs.tab, label: "focus"}, {key: glyphs.arrows, label: "move"}, {key: glyphs.enter, label: "select"}, {key: "?", label: "context"}]} />`. Keep the issues pill (filled `danger`/`warning` bg only when count > 0, else muted text) and `Step n/total` in accent.

- [ ] **Step 4: HelpPanel + LogStrip**

HelpPanel: rounded border, `CONTEXT` header in accent, warnings with `glyphs.warn`. LogStrip: lighter framing (`border={["top"]}` divider), `LOG` label in muted.

- [ ] **Step 5: Check line count + build + visual**

Run: `cd installer && bun run check:loc && bun run typecheck && bun run dev:local`
Expected: header wordmark, glyph rail with filled active row, key-cap footer all render. Run `--ascii` and `--compact` variants.

- [ ] **Step 6: Commit**

```bash
git add installer/src/components/chrome.tsx installer/src/components/step-rail.tsx
git commit -m "Restyle chrome: wordmark header, glyph rail, key-cap footer"
```

---

### Task 9: App shell — centered column, context toggle default-off, compact stepper

**Files:**
- Modify: `installer/src/app/app.tsx`
- Modify: `installer/src/app/keyboard.ts` (if needed — `?` toggle already wired)

**Interfaces:**
- Consumes: `Column` (Task 4), `RAIL_WIDTH`, glyph context (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Default context hidden**

Change `const [showHelp, setShowHelp] = useState(true);` → `useState(false)` so the context pane is on-demand via `?` (toggle already wired through `handleAppKey`).

- [ ] **Step 2: Wrap main content in `<Column>`**

In `MainPanel`, wrap `renderScreen(props)` output in `<Column>` so content caps at `CONTENT_MAX_WIDTH` and centers. Keep the title/help row above it.

- [ ] **Step 3: Compact dotted stepper**

When `compact` is true, replace the (already hidden) rail with a one-line stepper above the main panel: a row of `glyphs.ok`/`glyphs.pending` dots (filled up to `stepIndex`) + `Step {stepIndex+1}/{steps.length}`. Implement as a small local `CompactStepper` component in `app.tsx` (keep under 220 lines; if tight, move to `chrome.tsx`/`step-rail.tsx`).

- [ ] **Step 4: Verify all layouts**

Run: `cd installer && bun run check:loc && bun run typecheck`
Then visually:
```bash
cd installer
bun run dev:local                 # wide: centered column, rail, no context until ?
bun run src/main.tsx --local --compact   # narrow: dotted stepper
bun run src/main.tsx --local --ascii
```
Expected: content no longer sprawls on wide terminals; `?` reveals context; compact shows dotted stepper.

- [ ] **Step 5: Commit**

```bash
git add installer/src/app/app.tsx installer/src/app/keyboard.ts
git commit -m "Center content column, hide context by default, add compact stepper"
```

---

### Task 10: Screen sweep — bespoke text/hero/layout polish

**Files:**
- Modify: `installer/src/screens/setup-screens.tsx` (Welcome hero, System metrics)
- Modify: `installer/src/screens/review-screens.tsx` (Panels via `Section`)
- Modify: `installer/src/screens/config-screens.tsx`, `installer/src/screens/domain-screen.tsx`, `installer/src/screens/site-screens.tsx` (wrap groups in `Section`)

**Interfaces:**
- Consumes: `Section` (Task 5), restyled primitives (Task 7), `useGlyphs`.
- Produces: no API changes.

- [ ] **Step 1: Welcome hero**

In `WelcomeScreen`, give a centered hero: title line `Welcome to Vibe WP` bold accent, a one-line tagline muted, then the host/Docker/Caddy metrics row (now inline via restyled `Metric`), then the `ActionRow`. Wrap groups in `Section` where it adds clarity. Remove the long run-on bold sentence; keep copy tight.

- [ ] **Step 2: Group remaining screens with `Section`**

Wrap the logical groups (e.g. Domain's domain fields, Admin's credential fields, AI's provider keys, Review's env/tasks/caddyfile) in `<Section title=...>` instead of bare stacks, so each screen has labeled structure with light dividers rather than floating boxes. Do not change any handlers, validation, or `update()` calls.

- [ ] **Step 3: Per-screen visual pass**

Run: `cd installer && bun run check:loc && bun run typecheck`
Then step through every screen in `bun run dev:local` (Tab/arrows/Enter through all 13). Confirm: filled selection, glyphs, key-caps, centered column, no box-in-box. Re-check `--ascii` and `--compact`.

- [ ] **Step 4: Commit**

```bash
git add installer/src/screens
git commit -m "Sweep screens onto new design language with Section grouping"
```

---

### Task 11: Functional motion — task spinner + Execute progress bar

**Files:**
- Create: `installer/src/components/spinner.tsx`
- Modify: `installer/src/screens/execute-screen.tsx`

**Interfaces:**
- Consumes: `spinnerFrames` (Task 2), `useAscii` (Task 3).
- Produces: `<Spinner />` — cycles `spinnerFrames` on a `setInterval` (~100ms) via `useEffect`+`useState`, cleans up on unmount; `<ProgressBar value={number} total={number} width?={number} />` — renders `█`-filled / `░`-empty bar (ascii: `#`/`-`) with `done/total` suffix. Keep both in `spinner.tsx` (<220 lines).

- [ ] **Step 1: Implement `spinner.tsx`**

```tsx
import { useEffect, useState } from "react";
import { color } from "../app/theme";
import { useAscii } from "./glyph-context";
import { spinnerFrames } from "./glyphs";

export function Spinner() {
  const ascii = useAscii();
  const frames = spinnerFrames(ascii);
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % frames.length), 100);
    return () => clearInterval(id);
  }, [frames.length]);
  return <text fg={color("accent")}>{frames[i]}</text>;
}

export function ProgressBar({
  value,
  total,
  width = 24
}: {
  value: number;
  total: number;
  width?: number;
}) {
  const ascii = useAscii();
  const ratio = total > 0 ? Math.min(1, value / total) : 0;
  const filled = Math.round(ratio * width);
  const bar = (ascii ? "#" : "█").repeat(filled) + (ascii ? "-" : "░").repeat(width - filled);
  return (
    <box flexDirection="row" gap={1}>
      <text fg={color("accent")}>{bar}</text>
      <text fg={color("muted")}>
        {value}/{total}
      </text>
    </box>
  );
}
```

- [ ] **Step 2: Wire into Execute screen**

In `execute-screen.tsx`: when `status === "running"`, show `<Spinner />` next to the active task line; render `<ProgressBar value={results.length} total={plan.tasks.length} />` while running/done. Do not alter `runPlan`, confirmation, or any `core/` execution logic. Selection/step elsewhere stays instant.

- [ ] **Step 3: Verify**

Run: `cd installer && bun run check:loc && bun run typecheck && bun run dev:local`
Drive to the Execute step (confirmation phrase from the screen), confirm spinner animates and progress bar fills as simulated tasks complete. Check `--ascii` spinner uses `|/-\`.

- [ ] **Step 4: Commit**

```bash
git add installer/src/components/spinner.tsx installer/src/screens/execute-screen.tsx
git commit -m "Add SSH-safe task spinner and Execute progress bar"
```

---

### Task 12: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full quality gate**

Run: `cd installer && bun run quality`
Expected: check:loc + typecheck + Biome lint + all tests PASS.

- [ ] **Step 2: Visual matrix**

```bash
cd installer
bun run dev:local
bun run src/main.tsx --local --compact
bun run src/main.tsx --local --ascii
bun run dry-run:local
bun run export-plan:local   # confirm plan output unchanged vs core
```
Expected: every screen reflects the new design across normal/compact/ascii; plan export is byte-identical to pre-redesign `core/` output (presentation-only change).

- [ ] **Step 3: Confirm no core drift**

Run: `git diff --name-only main -- installer/src/core`
Expected: empty (no `core/` files changed by this branch).

- [ ] **Step 4: Final commit if anything pending**

```bash
git add -A installer
git commit -m "Finalize installer TUI redesign" || echo "nothing to commit"
```

---

## Self-Review

- **Spec coverage:** tokens/roles (T1) ✓; glyphs + ascii fallback (T2–T3) ✓; layout column/stack (T4) ✓; section/card/keycap (T5) ✓; choice-list filled selection (T6) ✓; primitives restyle (T7) ✓; chrome wordmark/rail/footer/context (T8) ✓; centered column + context-default-off + compact stepper (T9) ✓; screen sweep (T10) ✓; functional motion spinner+progress (T11) ✓; verification incl. core-untouched + ascii/compact matrix (T12) ✓. Restraint rules and 220-line cap are Global Constraints applied to every task.
- **Placeholder scan:** no TBD/TODO; every code step shows code; commands have expected output.
- **Type consistency:** `resolveGlyphs`/`shouldUseAscii`/`spinnerFrames` (T2) reused by T3/T6/T8/T11; `useGlyphs`/`useAscii` (T3) consumed consistently; `CONTENT_MAX_WIDTH`/`RAIL_WIDTH`/`space`/`BORDER` (T1) consumed by T4/T5/T8. `Column`/`Stack`/`Section`/`Card`/`KeyCap`/`KeyHints` names stable across consumers.
- **Note:** OpenTUI prop availability (`maxWidth`, `border={["bottom"]}`, `borderStyle` exports) is confirmed at the `lib/border.d.ts` level; each task that depends on it includes a fallback instruction.
