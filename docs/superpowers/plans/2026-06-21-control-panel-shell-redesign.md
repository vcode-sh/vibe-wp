# Vibe WP Control Panel — Shell & Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the starter-grade web Control Panel UI with a distinctive, friendly, persistent-sidebar app shell and a "status, not statistics" dashboard, built on the existing design tokens and vendored shadcn primitives, rendered against a typed mock-data layer.

**Architecture:** A TanStack Router app restructured under an authenticated app shell (shadcn `Sidebar` + `SidebarInset` + top bar). All screens read from a typed mock-data layer (`web/src/data/`) exposed as TanStack Query `queryOptions` factories — the one seam that later swaps to oRPC without touching components. Reusable "pattern" components (StatusHero, NeedsYouLane, VerdictTile, SafetyConfirmDialog, OperationRunner, …) carry the load; each screen is a thin composition.

**Tech Stack:** Bun + Turborepo, Vite, React 19, TanStack Router (file-based) + TanStack Query, shadcn/ui (Base UI–backed) from `@control-panel/ui`, Tailwind v4, Biome via `ultracite`. Logic tests via Vitest + Testing Library.

Design source of truth: `docs/superpowers/specs/2026-06-21-control-panel-shell-brand-design.md`.

## Global Constraints

Every task implicitly includes all of these. Values are copied verbatim from the spec / codebase:

- **Indentation is TABS.** Biome (`ultracite`) is configured `"indentStyle": "tab"`. All code in this plan uses tabs.
- **Semantic tokens only — never hardcode a hex color.** Use `bg-background`, `bg-card`, `bg-sidebar`, `text-primary`, `text-muted-foreground`, `border-border`, `ring`, `text-success`, `text-warning`, `text-destructive`. (Mockup hex values in the spec are illustrative only.)
- **Light and dark are both first-class.** Default theme stays `dark` (`ThemeProvider` in `__root.tsx`). Every screen must read correctly in both — verify by toggling.
- **shadcn here is Base UI–backed: use the `render` prop, NOT `asChild`.** e.g. `<SidebarMenuButton render={<Link to="…" />}>`, `<DropdownMenuTrigger render={<Button />}>`.
- **Radius:** use the `--radius` scale (0.625rem) via shadcn components; no sharp hand-rolled boxes.
- **Type:** Inter Variable (already configured); do not add fonts.
- **Scope is frontend-only against mock data.** No `server`/`bin/vibe` wiring, no auth/transport changes, no secrets rendered. Backend wiring is a separate spec.
- **Quality gate per task:** `bun run check-types` (turbo → tsc) and `bun run check` (ultracite) must pass. Run both from `control-panel/`.
- **Keep files focused.** One responsibility per file; prefer small components.
- **Voice:** plain, calm, reassuring; reuse the TUI labels ("Back up now", "Copy live to staging", "Secure the server").

## Testing approach (read once)

The `control-panel` repo has **no frontend test runner**. This plan adds Vitest **once** (Task 0.1) and uses it for the **pure logic** (`web/src/data/derive.ts`) where TDD genuinely applies. For **presentational** tasks (components/screens), the per-task cycle is:

1. Implement the file(s).
2. **Verify types:** `bun run check-types` → expect PASS (this also regenerates `routeTree.gen.ts` via `vite build`).
3. **Verify lint/format:** `bun run check` → expect PASS.
4. **Verify visually:** with the dev loop running (see below), open the screen and confirm it renders in **both light and dark**.
5. Commit.

**Dev loop for visual checks** (run once, leave running): from `control-panel/`: `bun run db:push` then `bun run dev`. Open `http://localhost:3001`, create an account at `/login` (auth is real; data is mock). All redesigned screens render from fixtures regardless of the backend.

---

## File Structure

**Created**
- `control-panel/web/vitest.config.ts` — Vitest config (reuses Vite plugins).
- `control-panel/web/src/test/setup.ts` — Testing Library/jest-dom setup.
- `control-panel/web/src/data/types.ts` — shared data shapes (the future API contract shape).
- `control-panel/web/src/data/derive.ts` — pure helpers (relativeTime, overallVerdict, verdictTone).
- `control-panel/web/src/data/derive.test.ts` — unit tests for derive.
- `control-panel/web/src/data/fixtures.ts` — mock data.
- `control-panel/web/src/data/queries.ts` — `queryOptions` factories (the swap seam).
- `control-panel/web/src/components/app-sidebar.tsx` — the left rail.
- `control-panel/web/src/components/site-switcher.tsx` — site dropdown in the sidebar header.
- `control-panel/web/src/components/top-bar.tsx` — breadcrumb + global actions.
- `control-panel/web/src/components/patterns/status-hero.tsx`
- `control-panel/web/src/components/patterns/needs-you.tsx`
- `control-panel/web/src/components/patterns/verdict-tile.tsx`
- `control-panel/web/src/components/patterns/safety-net.tsx`
- `control-panel/web/src/components/patterns/activity-timeline.tsx`
- `control-panel/web/src/components/patterns/developer-details.tsx`
- `control-panel/web/src/components/patterns/safety-confirm.tsx`
- `control-panel/web/src/components/patterns/operation-runner.tsx`
- `control-panel/web/src/components/patterns/page-header.tsx`
- `control-panel/web/src/routes/_auth/sites/index.tsx`
- `control-panel/web/src/routes/_auth/sites/$siteId/overview.tsx`
- `control-panel/web/src/routes/_auth/sites/$siteId/health.tsx`
- `control-panel/web/src/routes/_auth/sites/$siteId/backups.tsx`
- `control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx`
- `control-panel/web/src/routes/_auth/sites/$siteId/staging.tsx`
- `control-panel/web/src/routes/_auth/server.tsx`
- `control-panel/web/src/routes/_auth/settings.tsx`

**Modified**
- `control-panel/packages/ui/src/styles/globals.css` — add `--success`/`--warning` tokens.
- `control-panel/web/package.json` — add `test` script + Vitest devDeps.
- `control-panel/web/src/routes/__root.tsx` — drop `Header`, keep providers + `<Outlet/>`.
- `control-panel/web/src/routes/index.tsx` — redirect `/` → `/sites`.
- `control-panel/web/src/routes/_auth/route.tsx` — becomes the app shell.

**Deleted**
- `control-panel/web/src/routes/_auth/dashboard.tsx` — replaced by `sites/$siteId/overview.tsx`.
- `control-panel/web/src/components/header.tsx` — replaced by `app-sidebar.tsx` + `top-bar.tsx`.

---

# Phase 0 — Foundation

### Task 0.1: Status color tokens + Vitest harness

**Files:**
- Modify: `control-panel/packages/ui/src/styles/globals.css`
- Modify: `control-panel/web/package.json`
- Create: `control-panel/web/vitest.config.ts`
- Create: `control-panel/web/src/test/setup.ts`

**Interfaces:**
- Produces: Tailwind utilities `text-success`, `bg-success`, `text-success-foreground`, `text-warning`, `bg-warning`, `text-warning-foreground` (both themes). A working `bun run test` command in `web`.

- [ ] **Step 1: Add success/warning tokens to `:root`** in `globals.css` (after the `--destructive` line, line ~25). Insert:

```css
	--success: oklch(0.62 0.17 150);
	--success-foreground: oklch(0.985 0 0);
	--warning: oklch(0.75 0.15 80);
	--warning-foreground: oklch(0.205 0 0);
```

- [ ] **Step 2: Add the same to `.dark`** (after its `--destructive` line, line ~60):

```css
	--success: oklch(0.7 0.16 150);
	--success-foreground: oklch(0.205 0 0);
	--warning: oklch(0.8 0.14 80);
	--warning-foreground: oklch(0.205 0 0);
```

- [ ] **Step 3: Register them in `@theme inline`** (alongside `--color-destructive`, line ~97). Insert:

```css
	--color-success: var(--success);
	--color-success-foreground: var(--success-foreground);
	--color-warning: var(--warning);
	--color-warning-foreground: var(--warning-foreground);
```

- [ ] **Step 4: Add Vitest deps + script.** In `control-panel/web/package.json`, add to `scripts`: `"test": "vitest run"`, and to `devDependencies`: `"vitest": "^3.2.4"`, `"@testing-library/react": "^16.3.0"`, `"@testing-library/jest-dom": "^6.6.3"`, `"jsdom": "^25.0.1"`. Then run `bun install` from `control-panel/`.

- [ ] **Step 5: Create `web/vitest.config.ts`:**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [react()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test/setup.ts"],
		include: ["src/**/*.test.{ts,tsx}"],
	},
	resolve: {
		alias: {
			"@": new URL("./src", import.meta.url).pathname,
		},
	},
});
```

- [ ] **Step 6: Create `web/src/test/setup.ts`:**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: Verify.** Run `bun run check` (from `control-panel/`) → expect PASS. Start `bun run dev`, temporarily confirm a `text-success` element is green in dark and light (e.g. inspect any element), then revert any scratch markup.

- [ ] **Step 8: Commit.**

```bash
git add control-panel/packages/ui/src/styles/globals.css control-panel/web/package.json control-panel/web/vitest.config.ts control-panel/web/src/test/setup.ts control-panel/bun.lock
git commit -m "feat(panel): add success/warning tokens + vitest harness"
```

---

### Task 0.2: Mock-data types, derive logic (TDD), fixtures, query seam

**Files:**
- Create: `control-panel/web/src/data/types.ts`
- Create: `control-panel/web/src/data/derive.ts`
- Test: `control-panel/web/src/data/derive.test.ts`
- Create: `control-panel/web/src/data/fixtures.ts`
- Create: `control-panel/web/src/data/queries.ts`

**Interfaces:**
- Produces (consumed by every screen):
  - Types: `Verdict`, `SiteSummary`, `MetricTile`, `NeedItem`, `ActivityEntry`, `SiteOverview`, `ServerInfo`, `BackupRecord`, `HealthReport`, `StagingInfo`, `LogLine`.
  - `relativeTime(iso: string, now: Date): string`
  - `overallVerdict(tiles: MetricTile[]): Verdict`
  - `verdictTone(v: Verdict): { text: string; bg: string; ring: string; dot: string }`
  - Query factories: `sitesQuery()`, `serverInfoQuery()`, `siteOverviewQuery(siteId)`, `healthQuery(siteId)`, `backupsQuery(siteId)`, `logsQuery(siteId)`, `stagingQuery(siteId)` — each returns a TanStack Query `queryOptions` object.

- [ ] **Step 1: Create `web/src/data/types.ts`:**

```ts
export type Verdict = "good" | "watch" | "act";

export type SiteSummary = {
	id: string;
	name: string;
	domain: string;
	hasStaging: boolean;
	status: Verdict;
	lastBackupISO: string;
};

export type MetricTile = {
	key: string;
	label: string;
	verdict: Verdict;
	value: string;
	detail: string;
	help: string;
};

export type NeedItem = {
	id: string;
	icon: "update" | "backup" | "cert" | "disk" | "security";
	title: string;
	detail: string;
	actionLabel: string;
	reversible: boolean;
};

export type ActivityEntry = {
	id: string;
	whenISO: string;
	kind: "backup" | "health" | "cache" | "update" | "deploy";
	text: string;
	good: boolean;
};

export type SiteOverview = {
	siteId: string;
	headline: string;
	status: Verdict;
	subline: string;
	needs: NeedItem[];
	tiles: MetricTile[];
	safety: {
		backupText: string;
		backupDetail: string;
		securityText: string;
		securityDetail: string;
	};
	activity: ActivityEntry[];
};

export type ServerInfo = {
	vps: string;
	siteCount: number;
	diskPercent: number;
	allHealthy: boolean;
};

export type BackupRecord = {
	id: string;
	whenISO: string;
	sizeMB: number;
	location: "local" | "offsite";
	verified: boolean;
};

export type HealthReport = {
	tiles: MetricTile[];
	ttfbMs: number;
	cacheHitPercent: number;
	tlsDays: number;
	uptimePercent: number;
	alertChannels: string[];
};

export type StagingInfo = {
	present: boolean;
	url: string | null;
	noindex: boolean;
};

export type LogLine = {
	id: string;
	ts: string;
	source: "nginx" | "php" | "wp";
	text: string;
};
```

- [ ] **Step 2: Write the failing test** `web/src/data/derive.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { overallVerdict, relativeTime, verdictTone } from "./derive";
import type { MetricTile } from "./types";

const tile = (verdict: MetricTile["verdict"]): MetricTile => ({
	key: "k",
	label: "L",
	verdict,
	value: "v",
	detail: "d",
	help: "h",
});

describe("relativeTime", () => {
	const now = new Date("2026-06-21T12:00:00Z");
	it("formats minutes", () => {
		expect(relativeTime("2026-06-21T11:30:00Z", now)).toBe("30m ago");
	});
	it("formats hours", () => {
		expect(relativeTime("2026-06-21T10:00:00Z", now)).toBe("2h ago");
	});
	it("formats yesterday", () => {
		expect(relativeTime("2026-06-20T12:00:00Z", now)).toBe("Yesterday");
	});
	it("formats days", () => {
		expect(relativeTime("2026-06-18T12:00:00Z", now)).toBe("3 days ago");
	});
	it("clamps the future to just now", () => {
		expect(relativeTime("2026-06-21T12:00:30Z", now)).toBe("just now");
	});
});

describe("overallVerdict", () => {
	it("returns the worst tile verdict", () => {
		expect(overallVerdict([tile("good"), tile("watch"), tile("good")])).toBe(
			"watch"
		);
		expect(overallVerdict([tile("good"), tile("act")])).toBe("act");
		expect(overallVerdict([tile("good"), tile("good")])).toBe("good");
	});
	it("treats an empty list as good", () => {
		expect(overallVerdict([])).toBe("good");
	});
});

describe("verdictTone", () => {
	it("maps each verdict to token classes", () => {
		expect(verdictTone("good").text).toBe("text-success");
		expect(verdictTone("watch").text).toBe("text-warning");
		expect(verdictTone("act").text).toBe("text-destructive");
	});
});
```

- [ ] **Step 3: Run the test to verify it fails.** Run `bun run test` (from `control-panel/web`, or `cd web && bunx vitest run`). Expected: FAIL ("Cannot find module './derive'").

- [ ] **Step 4: Implement `web/src/data/derive.ts`:**

```ts
import type { MetricTile, Verdict } from "./types";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function relativeTime(iso: string, now: Date): string {
	const diff = now.getTime() - new Date(iso).getTime();
	if (diff < MINUTE) {
		return "just now";
	}
	if (diff < HOUR) {
		return `${Math.floor(diff / MINUTE)}m ago`;
	}
	if (diff < DAY) {
		return `${Math.floor(diff / HOUR)}h ago`;
	}
	const days = Math.floor(diff / DAY);
	if (days === 1) {
		return "Yesterday";
	}
	return `${days} days ago`;
}

const RANK: Record<Verdict, number> = { good: 0, watch: 1, act: 2 };

export function overallVerdict(tiles: MetricTile[]): Verdict {
	let worst: Verdict = "good";
	for (const t of tiles) {
		if (RANK[t.verdict] > RANK[worst]) {
			worst = t.verdict;
		}
	}
	return worst;
}

export function verdictTone(v: Verdict): {
	text: string;
	bg: string;
	ring: string;
	dot: string;
} {
	if (v === "good") {
		return {
			text: "text-success",
			bg: "bg-success/10",
			ring: "ring-success/30",
			dot: "bg-success",
		};
	}
	if (v === "watch") {
		return {
			text: "text-warning",
			bg: "bg-warning/10",
			ring: "ring-warning/30",
			dot: "bg-warning",
		};
	}
	return {
		text: "text-destructive",
		bg: "bg-destructive/10",
		ring: "ring-destructive/30",
		dot: "bg-destructive",
	};
}
```

- [ ] **Step 5: Run the test to verify it passes.** Run `bun run test`. Expected: PASS (11 assertions).

- [ ] **Step 6: Create `web/src/data/fixtures.ts`** (realistic mock content; one rich site + two summaries):

```ts
import type {
	BackupRecord,
	HealthReport,
	LogLine,
	ServerInfo,
	SiteOverview,
	SiteSummary,
	StagingInfo,
} from "./types";

export const siteSummaries: SiteSummary[] = [
	{
		id: "acme-blog",
		name: "acme-blog",
		domain: "acme.com",
		hasStaging: true,
		status: "good",
		lastBackupISO: "2026-06-21T10:00:00Z",
	},
	{
		id: "shop",
		name: "shop",
		domain: "shop.io",
		hasStaging: false,
		status: "watch",
		lastBackupISO: "2026-06-20T12:00:00Z",
	},
	{
		id: "docs",
		name: "docs",
		domain: "docs.dev",
		hasStaging: false,
		status: "good",
		lastBackupISO: "2026-06-21T07:00:00Z",
	},
];

export const serverInfo: ServerInfo = {
	vps: "1 VPS",
	siteCount: 3,
	diskPercent: 41,
	allHealthy: true,
};

const overviews: Record<string, SiteOverview> = {
	"acme-blog": {
		siteId: "acme-blog",
		headline: "acme-blog is healthy.",
		status: "good",
		subline: "checked just now · backed up 2h ago · TLS good for 89 days",
		needs: [
			{
				id: "wp-update",
				icon: "update",
				title: "WordPress 7.0.1 is available",
				detail:
					"A small security update. ~20 seconds, and we take a fresh backup first.",
				actionLabel: "Update now",
				reversible: true,
			},
		],
		tiles: [
			{
				key: "health",
				label: "Health",
				verdict: "good",
				value: "Healthy",
				detail: "HTTP 200 · Redis connected",
				help: "All checks return OK and the object cache is connected.",
			},
			{
				key: "speed",
				label: "Speed",
				verdict: "good",
				value: "Fast",
				detail: "TTFB 210ms · cache warm",
				help: "Under ~400ms time-to-first-byte is fast for WordPress.",
			},
			{
				key: "cache",
				label: "Cache",
				verdict: "good",
				value: "Warm",
				detail: "94% hit rate",
				help: "A high hit rate means most requests skip PHP.",
			},
			{
				key: "disk",
				label: "Disk",
				verdict: "good",
				value: "Plenty",
				detail: "41% of 80 GB used",
				help: "Under ~80% leaves room for backups and growth.",
			},
		],
		safety: {
			backupText: "Backed up 2h ago · off-site ✓",
			backupDetail: "Next: tonight 03:00 · keeps 7",
			securityText: "Server secured",
			securityDetail: "Firewall on · auto-updates on",
		},
		activity: [
			{
				id: "a1",
				whenISO: "2026-06-21T10:00:00Z",
				kind: "backup",
				text: "Backed up automatically (off-site ✓)",
				good: true,
			},
			{
				id: "a2",
				whenISO: "2026-06-21T04:00:00Z",
				kind: "health",
				text: "Health check passed — all green",
				good: true,
			},
			{
				id: "a3",
				whenISO: "2026-06-20T15:00:00Z",
				kind: "cache",
				text: "You cleared the cache",
				good: false,
			},
			{
				id: "a4",
				whenISO: "2026-06-18T09:00:00Z",
				kind: "update",
				text: "Plugin “WooCommerce” updated to 9.4",
				good: false,
			},
		],
	},
};

export function overviewFor(siteId: string): SiteOverview {
	const found = overviews[siteId];
	if (found) {
		return found;
	}
	const base = overviews["acme-blog"];
	return { ...base, siteId, headline: `${siteId} is healthy.` };
}

export function healthFor(_siteId: string): HealthReport {
	return {
		tiles: overviews["acme-blog"].tiles,
		ttfbMs: 210,
		cacheHitPercent: 94,
		tlsDays: 89,
		uptimePercent: 99.9,
		alertChannels: ["Telegram", "Email"],
	};
}

export function backupsFor(_siteId: string): BackupRecord[] {
	return [
		{
			id: "b1",
			whenISO: "2026-06-21T10:00:00Z",
			sizeMB: 142,
			location: "offsite",
			verified: true,
		},
		{
			id: "b2",
			whenISO: "2026-06-20T03:00:00Z",
			sizeMB: 140,
			location: "offsite",
			verified: true,
		},
		{
			id: "b3",
			whenISO: "2026-06-19T03:00:00Z",
			sizeMB: 139,
			location: "local",
			verified: true,
		},
	];
}

export function logsFor(_siteId: string): LogLine[] {
	return [
		{ id: "l1", ts: "10:42:01", source: "nginx", text: "GET / 200 12ms" },
		{ id: "l2", ts: "10:42:03", source: "php", text: "Cron: ran 2 due events" },
		{ id: "l3", ts: "10:42:09", source: "wp", text: "Object cache: hit" },
	];
}

export function stagingFor(siteId: string): StagingInfo {
	return siteId === "acme-blog"
		? { present: true, url: "staging.acme.com", noindex: true }
		: { present: false, url: null, noindex: true };
}
```

- [ ] **Step 7: Create `web/src/data/queries.ts`** (the swap seam — later, each `queryFn` becomes an oRPC call):

```ts
import { queryOptions } from "@tanstack/react-query";

import {
	backupsFor,
	healthFor,
	logsFor,
	overviewFor,
	serverInfo,
	siteSummaries,
	stagingFor,
} from "./fixtures";

const settle = <T>(value: T): Promise<T> =>
	new Promise((resolve) => setTimeout(() => resolve(value), 150));

export const sitesQuery = () =>
	queryOptions({ queryKey: ["sites"], queryFn: () => settle(siteSummaries) });

export const serverInfoQuery = () =>
	queryOptions({ queryKey: ["server"], queryFn: () => settle(serverInfo) });

export const siteOverviewQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "overview"],
		queryFn: () => settle(overviewFor(siteId)),
	});

export const healthQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "health"],
		queryFn: () => settle(healthFor(siteId)),
	});

export const backupsQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "backups"],
		queryFn: () => settle(backupsFor(siteId)),
	});

export const logsQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "logs"],
		queryFn: () => settle(logsFor(siteId)),
	});

export const stagingQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "staging"],
		queryFn: () => settle(stagingFor(siteId)),
	});
```

- [ ] **Step 8: Verify + commit.** Run `bun run test` (PASS), `bun run check-types` (PASS), `bun run check` (PASS).

```bash
git add control-panel/web/src/data control-panel/web/src/data/derive.test.ts
git commit -m "feat(panel): typed mock-data layer + derive logic + query seam"
```

---

### Task 0.3: App shell (sidebar + top bar) and route restructure

**Files:**
- Create: `control-panel/web/src/components/site-switcher.tsx`
- Create: `control-panel/web/src/components/app-sidebar.tsx`
- Create: `control-panel/web/src/components/top-bar.tsx`
- Modify: `control-panel/web/src/routes/_auth/route.tsx`
- Modify: `control-panel/web/src/routes/__root.tsx`
- Modify: `control-panel/web/src/routes/index.tsx`
- Delete: `control-panel/web/src/routes/_auth/dashboard.tsx`
- Delete: `control-panel/web/src/components/header.tsx`

**Interfaces:**
- Consumes: `sitesQuery` (Task 0.2); shadcn `Sidebar*` from `@control-panel/ui/components/sidebar`.
- Produces: `<AppSidebar />`, `<TopBar />`, `<SiteSwitcher />`; the `_auth` route renders the full shell around `<Outlet/>`. Active site id read via `useParams({ strict: false }).siteId`.

- [ ] **Step 1: Create `web/src/components/site-switcher.tsx`:**

```tsx
import { Avatar, AvatarFallback } from "@control-panel/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@control-panel/ui/components/dropdown-menu";
import {
	SidebarMenuButton,
} from "@control-panel/ui/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, Plus } from "lucide-react";

import { sitesQuery } from "@/data/queries";

export function SiteSwitcher({ activeSiteId }: { activeSiteId?: string }) {
	const navigate = useNavigate();
	const sites = useQuery(sitesQuery());
	const active = sites.data?.find((s) => s.id === activeSiteId);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<SidebarMenuButton
						className="data-[state=open]:bg-sidebar-accent"
						size="lg"
					/>
				}
			>
				<Avatar className="size-7 rounded-md">
					<AvatarFallback className="rounded-md bg-primary text-primary-foreground text-xs font-bold">
						{(active?.name ?? "V").slice(0, 1).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div className="grid flex-1 text-left leading-tight">
					<span className="truncate font-semibold text-sm">
						{active?.name ?? "All sites"}
					</span>
					<span className="truncate text-muted-foreground text-xs">
						{active?.domain ?? "select a site"}
					</span>
				</div>
				<ChevronsUpDown className="ml-auto size-4 opacity-70" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuLabel>Sites</DropdownMenuLabel>
				{sites.data?.map((s) => (
					<DropdownMenuItem
						key={s.id}
						onClick={() =>
							navigate({
								to: "/sites/$siteId/overview",
								params: { siteId: s.id },
							})
						}
					>
						{s.name}
						<span className="ml-auto text-muted-foreground text-xs">
							{s.domain}
						</span>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => navigate({ to: "/sites" })}>
					All sites
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => navigate({ to: "/sites" })}>
					<Plus className="size-4" /> New site
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
```

- [ ] **Step 2: Create `web/src/components/app-sidebar.tsx`:**

```tsx
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@control-panel/ui/components/sidebar";
import { Link, useMatchRoute, useParams } from "@tanstack/react-router";
import {
	Activity,
	CopyCheck,
	HeartPulse,
	LayoutDashboard,
	ScrollText,
	Settings,
	ShieldCheck,
} from "lucide-react";
import type { ComponentType } from "react";

import { SiteSwitcher } from "@/components/site-switcher";
import UserMenu from "@/components/user-menu";

type SiteLink = {
	label: string;
	to: string;
	icon: ComponentType<{ className?: string }>;
};

const SITE_LINKS: SiteLink[] = [
	{ label: "Overview", to: "/sites/$siteId/overview", icon: LayoutDashboard },
	{ label: "Health", to: "/sites/$siteId/health", icon: HeartPulse },
	{ label: "Backups", to: "/sites/$siteId/backups", icon: CopyCheck },
	{ label: "Logs", to: "/sites/$siteId/logs", icon: ScrollText },
	{ label: "Staging", to: "/sites/$siteId/staging", icon: Activity },
];

const SERVER_LINKS: SiteLink[] = [
	{ label: "Server & security", to: "/server", icon: ShieldCheck },
	{ label: "Settings", to: "/settings", icon: Settings },
];

export function AppSidebar() {
	const params = useParams({ strict: false });
	const siteId = params.siteId;
	const matchRoute = useMatchRoute();

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SiteSwitcher activeSiteId={siteId} />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				{siteId ? (
					<SidebarGroup>
						<SidebarGroupLabel>This site</SidebarGroupLabel>
						<SidebarMenu>
							{SITE_LINKS.map(({ label, to, icon: Icon }) => (
								<SidebarMenuItem key={to}>
									<SidebarMenuButton
										isActive={Boolean(matchRoute({ to, params: { siteId } }))}
										render={<Link params={{ siteId }} to={to} />}
										tooltip={label}
									>
										<Icon className="size-4" />
										<span>{label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroup>
				) : null}

				<SidebarGroup>
					<SidebarGroupLabel>Server</SidebarGroupLabel>
					<SidebarMenu>
						{SERVER_LINKS.map(({ label, to, icon: Icon }) => (
							<SidebarMenuItem key={to}>
								<SidebarMenuButton
									isActive={Boolean(matchRoute({ to }))}
									render={<Link to={to} />}
									tooltip={label}
								>
									<Icon className="size-4" />
									<span>{label}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						))}
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<UserMenu />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
```

- [ ] **Step 3: Create `web/src/components/top-bar.tsx`:**

```tsx
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
} from "@control-panel/ui/components/breadcrumb";
import { Separator } from "@control-panel/ui/components/separator";
import { SidebarTrigger } from "@control-panel/ui/components/sidebar";

import { ModeToggle } from "@/components/mode-toggle";

export function TopBar({ crumbs }: { crumbs: string[] }) {
	return (
		<header className="flex h-14 shrink-0 items-center gap-2 border-border border-b px-4">
			<SidebarTrigger className="-ml-1" />
			<Separator className="mr-1 h-4" orientation="vertical" />
			<Breadcrumb>
				<BreadcrumbList>
					{crumbs.map((c, i) => (
						<BreadcrumbItem key={c}>
							<BreadcrumbPage
								className={
									i === crumbs.length - 1
										? "text-foreground"
										: "text-muted-foreground"
								}
							>
								{c}
							</BreadcrumbPage>
						</BreadcrumbItem>
					))}
				</BreadcrumbList>
			</Breadcrumb>
			<div className="ml-auto flex items-center gap-2">
				<ModeToggle />
			</div>
		</header>
	);
}
```

- [ ] **Step 4: Rewrite `web/src/routes/_auth/route.tsx`** as the shell (keep the existing `beforeLoad` guard):

```tsx
import { SidebarInset, SidebarProvider } from "@control-panel/ui/components/sidebar";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async () => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
});

function AuthLayout() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<Outlet />
			</SidebarInset>
		</SidebarProvider>
	);
}
```

- [ ] **Step 5: Rewrite `web/src/routes/__root.tsx`** — drop `Header`, keep providers:

```tsx
import { Toaster } from "@control-panel/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import type { orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{ title: "Vibe WP Control Panel" },
			{
				name: "description",
				content: "Web control panel for Vibe WP sites and operations.",
			},
		],
		links: [{ rel: "icon", href: "/favicon.ico" }],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<ThemeProvider
				attribute="class"
				defaultTheme="dark"
				disableTransitionOnChange
				storageKey="vibe-wp-control-theme"
			>
				<Outlet />
				<Toaster richColors />
			</ThemeProvider>
			<TanStackRouterDevtools position="bottom-left" />
			<ReactQueryDevtools buttonPosition="bottom-right" position="bottom" />
		</>
	);
}
```

- [ ] **Step 6: Rewrite `web/src/routes/index.tsx`** as a redirect:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/sites" });
	},
});
```

- [ ] **Step 7: Delete the obsolete files.**

```bash
git rm control-panel/web/src/routes/_auth/dashboard.tsx control-panel/web/src/components/header.tsx
```

(The `/sites` routes are created in Phase 1; until then `check-types` will fail on the missing route — so Steps 8–9 verify only after Task 1.1 lands the `sites` index. Implement Task 1.1 immediately after this step.)

- [ ] **Step 8: Verify** after Task 1.1: `bun run check-types` (PASS), `bun run check` (PASS), and visually confirm the shell renders with the sidebar collapsing.

- [ ] **Step 9: Commit** (together with Task 1.1 if needed to keep the tree compiling):

```bash
git add control-panel/web/src/components control-panel/web/src/routes
git commit -m "feat(panel): app shell (sidebar + top bar) + route restructure"
```

---

# Phase 1 — Sites portfolio + Overview

### Task 1.1: PageHeader pattern + Sites portfolio page

**Files:**
- Create: `control-panel/web/src/components/patterns/page-header.tsx`
- Create: `control-panel/web/src/routes/_auth/sites/index.tsx`

**Interfaces:**
- Consumes: `sitesQuery`, `serverInfoQuery`, `verdictTone`, `relativeTime`.
- Produces: `<PageHeader title actions? />`; route `/sites`.

- [ ] **Step 1: Create `web/src/components/patterns/page-header.tsx`:**

```tsx
import type { ReactNode } from "react";

export function PageHeader({
	title,
	subtitle,
	actions,
}: {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				{subtitle ? (
					<p className="mt-1 text-muted-foreground text-sm">{subtitle}</p>
				) : null}
			</div>
			{actions ? <div className="flex items-center gap-2">{actions}</div> : null}
		</div>
	);
}
```

- [ ] **Step 2: Create `web/src/routes/_auth/sites/index.tsx`:**

```tsx
import { Badge } from "@control-panel/ui/components/badge";
import { Button } from "@control-panel/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@control-panel/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, Plus } from "lucide-react";

import { TopBar } from "@/components/top-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { relativeTime, verdictTone } from "@/data/derive";
import { serverInfoQuery, sitesQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/sites/")({
	component: SitesPage,
});

function SitesPage() {
	const sites = useQuery(sitesQuery());
	const server = useQuery(serverInfoQuery());
	const now = new Date();

	return (
		<>
			<TopBar crumbs={["Sites"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-6 p-6">
				<PageHeader
					actions={
						<>
							<Button>
								<Plus className="size-4" /> New site
							</Button>
							<Button variant="outline">
								<Database className="size-4" /> External DB &amp; Redis
							</Button>
						</>
					}
					subtitle="Every Vibe WP site on this server."
					title="Sites"
				/>

				{server.data ? (
					<Card>
						<CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
							<span className="size-2 rounded-full bg-success" />
							<span className="font-medium">{server.data.vps}</span>
							<span className="text-muted-foreground">
								{server.data.siteCount} sites · disk {server.data.diskPercent}% ·
								{server.data.allHealthy ? " all healthy" : " needs attention"}
							</span>
						</CardContent>
					</Card>
				) : null}

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{sites.data?.map((s) => (
						<Link
							key={s.id}
							params={{ siteId: s.id }}
							to="/sites/$siteId/overview"
						>
							<Card className="transition-colors hover:border-primary">
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										{s.name}
										<span
											className={`size-2 rounded-full ${verdictTone(s.status).dot}`}
										/>
									</CardTitle>
									<p className="text-muted-foreground text-xs">{s.domain}</p>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-2">
									<Badge variant="outline">
										{s.hasStaging ? "prod + staging" : "prod"}
									</Badge>
									<Badge variant="outline">
										backed up {relativeTime(s.lastBackupISO, now)}
									</Badge>
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
			</main>
		</>
	);
}
```

- [ ] **Step 3: Verify** (this is where Task 0.3 also compiles): `bun run check-types` → PASS; `bun run check` → PASS. Visually: `/sites` shows the server banner + 3 site cards; cards link into a site.

- [ ] **Step 4: Commit.**

```bash
git add control-panel/web/src/components/patterns/page-header.tsx control-panel/web/src/routes/_auth/sites/index.tsx
git commit -m "feat(panel): sites portfolio page + page header"
```

---

### Task 1.2: Overview pattern components

**Files:**
- Create: `control-panel/web/src/components/patterns/status-hero.tsx`
- Create: `control-panel/web/src/components/patterns/needs-you.tsx`
- Create: `control-panel/web/src/components/patterns/verdict-tile.tsx`
- Create: `control-panel/web/src/components/patterns/safety-net.tsx`
- Create: `control-panel/web/src/components/patterns/activity-timeline.tsx`
- Create: `control-panel/web/src/components/patterns/developer-details.tsx`

**Interfaces:**
- Consumes: `verdictTone`, `relativeTime`, types from `@/data/types`.
- Produces: `<StatusHero headline status subline calm />`, `<NeedsYou items onAct />`, `<VerdictTile tile />`, `<SafetyNet safety onBackup />`, `<ActivityTimeline entries />`, `<DeveloperDetails />`.

- [ ] **Step 1: Create `status-hero.tsx`:**

```tsx
import { Card } from "@control-panel/ui/components/card";
import { Check } from "lucide-react";

import { verdictTone } from "@/data/derive";
import type { Verdict } from "@/data/types";

export function StatusHero({
	headline,
	status,
	subline,
	calm,
}: {
	headline: string;
	status: Verdict;
	subline: string;
	calm: boolean;
}) {
	const tone = verdictTone(status);
	return (
		<Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
			<div
				className={`flex size-11 items-center justify-center rounded-full ring-2 ${tone.ring} ${tone.text}`}
			>
				<Check className="size-5" />
			</div>
			<div className="min-w-0">
				<h2 className="font-semibold text-xl tracking-tight">{headline}</h2>
				<p className="mt-1 flex items-center gap-2 text-muted-foreground text-sm">
					<span className={`inline-flex items-center gap-1 ${tone.text}`}>
						<span className={`size-1.5 rounded-full ${tone.dot}`} /> live
					</span>
					· {subline}
				</p>
			</div>
			{calm ? (
				<div
					className={`ml-auto whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${tone.text} ${tone.bg}`}
				>
					✓ Nothing needs you
				</div>
			) : null}
		</Card>
	);
}
```

- [ ] **Step 2: Create `needs-you.tsx`** (includes the calm empty state):

```tsx
import { Button } from "@control-panel/ui/components/button";
import { Card } from "@control-panel/ui/components/card";
import { Check, ChevronUp } from "lucide-react";

import type { NeedItem } from "@/data/types";

export function NeedsYou({
	items,
	onAct,
}: {
	items: NeedItem[];
	onAct: (item: NeedItem) => void;
}) {
	if (items.length === 0) {
		return (
			<Card className="flex items-center gap-3 border-success/40 p-4 text-sm">
				<Check className="size-4 text-success" />
				<span className="text-muted-foreground">
					Nothing needs you right now.
				</span>
			</Card>
		);
	}
	return (
		<Card className="border-warning/50 border-l-4 p-4">
			<div className="mb-3 flex items-center gap-2 font-semibold text-sm">
				<ChevronUp className="size-4 text-warning" /> Needs you
				<span className="rounded-full border border-warning/50 bg-warning/10 px-2 text-warning text-xs">
					{items.length}
				</span>
				<span className="ml-auto text-muted-foreground text-xs">
					we always back up before changes
				</span>
			</div>
			<div className="grid gap-2">
				{items.map((item) => (
					<div
						className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
						key={item.id}
					>
						<div className="min-w-0">
							<div className="font-medium text-sm">{item.title}</div>
							<div className="mt-0.5 text-muted-foreground text-xs">
								{item.detail}
							</div>
						</div>
						<div className="ml-auto flex shrink-0 gap-2">
							<Button size="sm" variant="ghost">
								Later
							</Button>
							<Button onClick={() => onAct(item)} size="sm">
								{item.actionLabel}
							</Button>
						</div>
					</div>
				))}
			</div>
		</Card>
	);
}
```

- [ ] **Step 3: Create `verdict-tile.tsx`:**

```tsx
import { Card } from "@control-panel/ui/components/card";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@control-panel/ui/components/tooltip";
import { HelpCircle } from "lucide-react";

import { verdictTone } from "@/data/derive";
import type { MetricTile } from "@/data/types";

export function VerdictTile({ tile }: { tile: MetricTile }) {
	const tone = verdictTone(tile.verdict);
	return (
		<Card className="p-3">
			<div className="flex items-center justify-between">
				<span className="text-muted-foreground text-xs uppercase tracking-wide">
					{tile.label}
				</span>
				<Tooltip>
					<TooltipTrigger render={<HelpCircle className="size-3.5 text-muted-foreground" />} />
					<TooltipContent>{tile.help}</TooltipContent>
				</Tooltip>
			</div>
			<div className={`mt-2 font-bold text-base ${tone.text}`}>{tile.value}</div>
			<div className="mt-0.5 text-muted-foreground text-xs">{tile.detail}</div>
		</Card>
	);
}
```

- [ ] **Step 4: Create `safety-net.tsx`:**

```tsx
import { Button } from "@control-panel/ui/components/button";
import { Card, CardHeader, CardTitle } from "@control-panel/ui/components/card";
import { CopyCheck, ShieldCheck } from "lucide-react";

import type { SiteOverview } from "@/data/types";

export function SafetyNet({
	safety,
	onBackup,
	onRestore,
}: {
	safety: SiteOverview["safety"];
	onBackup: () => void;
	onRestore: () => void;
}) {
	return (
		<Card className="p-4">
			<CardHeader className="p-0">
				<CardTitle className="text-sm">Your safety net</CardTitle>
			</CardHeader>
			<div className="mt-3 grid gap-3">
				<div className="flex items-start gap-3">
					<CopyCheck className="mt-0.5 size-4 text-success" />
					<div>
						<div className="font-medium text-sm">{safety.backupText}</div>
						<div className="text-muted-foreground text-xs">
							{safety.backupDetail}
						</div>
					</div>
				</div>
				<div className="flex items-start gap-3">
					<ShieldCheck className="mt-0.5 size-4 text-success" />
					<div>
						<div className="font-medium text-sm">{safety.securityText}</div>
						<div className="text-muted-foreground text-xs">
							{safety.securityDetail}
						</div>
					</div>
				</div>
				<div className="flex items-center gap-3">
					<Button onClick={onBackup} size="sm">
						Back up now
					</Button>
					<Button
						className="text-primary"
						onClick={onRestore}
						size="sm"
						variant="link"
					>
						Restore a backup…
					</Button>
				</div>
			</div>
		</Card>
	);
}
```

- [ ] **Step 5: Create `activity-timeline.tsx`:**

```tsx
import { Card, CardHeader, CardTitle } from "@control-panel/ui/components/card";

import { relativeTime } from "@/data/derive";
import type { ActivityEntry } from "@/data/types";

export function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
	const now = new Date();
	return (
		<Card className="p-4">
			<CardHeader className="p-0">
				<CardTitle className="text-sm">Recent activity</CardTitle>
			</CardHeader>
			<ul className="mt-3 grid gap-2">
				{entries.map((e) => (
					<li className="flex items-baseline gap-3 text-sm" key={e.id}>
						<span className="w-20 shrink-0 text-muted-foreground text-xs">
							{relativeTime(e.whenISO, now)}
						</span>
						<span
							className={`relative top-1 size-2 shrink-0 rounded-full ${
								e.good ? "bg-success" : "bg-muted-foreground"
							}`}
						/>
						<span>{e.text}</span>
					</li>
				))}
			</ul>
		</Card>
	);
}
```

- [ ] **Step 6: Create `developer-details.tsx`:**

```tsx
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@control-panel/ui/components/collapsible";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function DeveloperDetails({ children }: { children: ReactNode }) {
	return (
		<Collapsible className="rounded-lg border border-border border-dashed">
			<CollapsibleTrigger className="flex w-full items-center gap-2 p-3 text-muted-foreground text-sm">
				<ChevronRight className="size-4 transition-transform data-[panel-open]:rotate-90" />
				Details for developers — containers, raw metrics, live logs, env
			</CollapsibleTrigger>
			<CollapsibleContent className="border-border border-t p-3 text-muted-foreground text-sm">
				{children}
			</CollapsibleContent>
		</Collapsible>
	);
}
```

- [ ] **Step 7: Verify + commit.** `bun run check-types` (PASS), `bun run check` (PASS). (Components are exercised by Task 1.3.)

```bash
git add control-panel/web/src/components/patterns
git commit -m "feat(panel): overview pattern components"
```

---

### Task 1.3: Overview page

**Files:**
- Create: `control-panel/web/src/routes/_auth/sites/$siteId/overview.tsx`

**Interfaces:**
- Consumes: `siteOverviewQuery`, all Task 1.2 patterns, `overallVerdict`, `Skeleton`, `toast`.

- [ ] **Step 1: Create the route:**

```tsx
import { Skeleton } from "@control-panel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { TopBar } from "@/components/top-bar";
import { ActivityTimeline } from "@/components/patterns/activity-timeline";
import { DeveloperDetails } from "@/components/patterns/developer-details";
import { NeedsYou } from "@/components/patterns/needs-you";
import { SafetyNet } from "@/components/patterns/safety-net";
import { StatusHero } from "@/components/patterns/status-hero";
import { VerdictTile } from "@/components/patterns/verdict-tile";
import { siteOverviewQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/sites/$siteId/overview")({
	component: OverviewPage,
});

function OverviewPage() {
	const { siteId } = Route.useParams();
	const overview = useQuery(siteOverviewQuery(siteId));

	return (
		<>
			<TopBar crumbs={[siteId, "Overview"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-3 p-6">
				{overview.isLoading || !overview.data ? (
					<Skeleton className="h-24 w-full" />
				) : (
					<>
						<StatusHero
							calm={overview.data.needs.length === 0}
							headline={overview.data.headline}
							status={overview.data.status}
							subline={overview.data.subline}
						/>
						<NeedsYou
							items={overview.data.needs}
							onAct={(item) =>
								toast.success(`${item.actionLabel}: starting (mock)…`)
							}
						/>
						<div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
							<div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-2">
								{overview.data.tiles.map((tile) => (
									<VerdictTile key={tile.key} tile={tile} />
								))}
							</div>
							<SafetyNet
								onBackup={() => toast.success("Back up now: starting (mock)…")}
								onRestore={() => toast("Open Backups to restore")}
								safety={overview.data.safety}
							/>
						</div>
						<ActivityTimeline entries={overview.data.activity} />
						<DeveloperDetails>
							Containers, raw perf metrics, live logs and env will appear here
							once the panel is wired to the core.
						</DeveloperDetails>
					</>
				)}
			</main>
		</>
	);
}
```

- [ ] **Step 2: Verify.** `bun run check-types` (PASS), `bun run check` (PASS). Visually: navigate into a site → Overview shows hero + Needs-you + verdict tiles + safety net + timeline + dev expander, in light and dark.

- [ ] **Step 3: Commit.**

```bash
git add control-panel/web/src/routes/_auth/sites/\$siteId/overview.tsx
git commit -m "feat(panel): site Overview page (status, not statistics)"
```

---

# Phase 2 — Per-site pages

### Task 2.1: SafetyConfirmDialog + OperationRunner

**Files:**
- Create: `control-panel/web/src/components/patterns/safety-confirm.tsx`
- Create: `control-panel/web/src/components/patterns/operation-runner.tsx`

**Interfaces:**
- Produces:
  - `<SafetyConfirm open onOpenChange title consequence reversible confirmLabel onConfirm />`
  - `<OperationRunner open onOpenChange title lines />` where `lines: string[]` streams progress (mock).

- [ ] **Step 1: Create `safety-confirm.tsx`:**

```tsx
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@control-panel/ui/components/alert-dialog";
import { Badge } from "@control-panel/ui/components/badge";

export function SafetyConfirm({
	open,
	onOpenChange,
	title,
	consequence,
	reversible,
	confirmLabel,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	consequence: string;
	reversible: boolean;
	confirmLabel: string;
	onConfirm: () => void;
}) {
	return (
		<AlertDialog onOpenChange={onOpenChange} open={open}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle className="flex items-center gap-2">
						{title}
						<Badge variant={reversible ? "outline" : "destructive"}>
							{reversible ? "Reversible" : "Irreversible"}
						</Badge>
					</AlertDialogTitle>
					<AlertDialogDescription>{consequence}</AlertDialogDescription>
				</AlertDialogHeader>
				<p className="text-muted-foreground text-xs">
					We take a fresh backup first. Enter to confirm, Esc to cancel.
				</p>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
```

- [ ] **Step 2: Create `operation-runner.tsx`** (streams the provided lines into a scrollable log with a progress bar; mock now, real stream later):

```tsx
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@control-panel/ui/components/dialog";
import { Progress } from "@control-panel/ui/components/progress";
import { ScrollArea } from "@control-panel/ui/components/scroll-area";
import { useEffect, useState } from "react";

export function OperationRunner({
	open,
	onOpenChange,
	title,
	lines,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	lines: string[];
}) {
	const [shown, setShown] = useState(0);

	useEffect(() => {
		if (!open) {
			setShown(0);
			return;
		}
		if (shown >= lines.length) {
			return;
		}
		const id = setTimeout(() => setShown((n) => n + 1), 500);
		return () => clearTimeout(id);
	}, [open, shown, lines.length]);

	const percent = lines.length === 0 ? 100 : (shown / lines.length) * 100;

	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<Progress value={percent} />
				<ScrollArea className="h-48 rounded-md border border-border bg-background p-3 font-mono text-xs">
					{lines.slice(0, shown).map((line) => (
						<div className="text-muted-foreground" key={line}>
							{line}
						</div>
					))}
					{shown >= lines.length ? (
						<div className="text-success">✓ Done</div>
					) : null}
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 3: Verify + commit.** `bun run check-types` / `bun run check` (PASS). (Exercised by Backups/Staging.)

```bash
git add control-panel/web/src/components/patterns/safety-confirm.tsx control-panel/web/src/components/patterns/operation-runner.tsx
git commit -m "feat(panel): safety-confirm dialog + operation runner"
```

---

### Task 2.2: Health page

**Files:**
- Create: `control-panel/web/src/routes/_auth/sites/$siteId/health.tsx`

- [ ] **Step 1: Create the route:**

```tsx
import { Button } from "@control-panel/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@control-panel/ui/components/card";
import { Skeleton } from "@control-panel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { TopBar } from "@/components/top-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { VerdictTile } from "@/components/patterns/verdict-tile";
import { healthQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/sites/$siteId/health")({
	component: HealthPage,
});

function HealthPage() {
	const { siteId } = Route.useParams();
	const health = useQuery(healthQuery(siteId));

	return (
		<>
			<TopBar crumbs={[siteId, "Health"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<>
							<Button onClick={() => toast.success("Health check: running (mock)…")}>
								Run health check
							</Button>
							<Button onClick={() => toast.success("Perf report: running (mock)…")} variant="outline">
								Perf report
							</Button>
						</>
					}
					subtitle="Uptime, performance and alerts for this site."
					title="Health"
				/>
				{health.isLoading || !health.data ? (
					<Skeleton className="h-24 w-full" />
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
							{health.data.tiles.map((tile) => (
								<VerdictTile key={tile.key} tile={tile} />
							))}
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle className="text-sm">Performance</CardTitle>
								</CardHeader>
								<CardContent className="grid gap-1 text-sm">
									<div>TTFB: {health.data.ttfbMs}ms</div>
									<div>Cache hit: {health.data.cacheHitPercent}%</div>
									<div>Uptime: {health.data.uptimePercent}%</div>
									<div>TLS valid: {health.data.tlsDays} days</div>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle className="text-sm">Alerts</CardTitle>
								</CardHeader>
								<CardContent className="text-sm">
									Channels: {health.data.alertChannels.join(" · ")}
								</CardContent>
							</Card>
						</div>
					</>
				)}
			</main>
		</>
	);
}
```

- [ ] **Step 2: Verify** (`check-types`, `check`, visual). **Step 3: Commit:**

```bash
git add control-panel/web/src/routes/_auth/sites/\$siteId/health.tsx
git commit -m "feat(panel): site Health page"
```

---

### Task 2.3: Backups page (table + safety-confirm + runner)

**Files:**
- Create: `control-panel/web/src/routes/_auth/sites/$siteId/backups.tsx`

**Interfaces:**
- Consumes: `backupsQuery`, `SafetyConfirm`, `OperationRunner`, `Table`, `relativeTime`.

- [ ] **Step 1: Create the route:**

```tsx
import { Badge } from "@control-panel/ui/components/badge";
import { Button } from "@control-panel/ui/components/button";
import { Skeleton } from "@control-panel/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@control-panel/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { TopBar } from "@/components/top-bar";
import { OperationRunner } from "@/components/patterns/operation-runner";
import { PageHeader } from "@/components/patterns/page-header";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { relativeTime } from "@/data/derive";
import { backupsQuery } from "@/data/queries";
import type { BackupRecord } from "@/data/types";

export const Route = createFileRoute("/_auth/sites/$siteId/backups")({
	component: BackupsPage,
});

function BackupsPage() {
	const { siteId } = Route.useParams();
	const backups = useQuery(backupsQuery(siteId));
	const now = new Date();
	const [restoring, setRestoring] = useState<BackupRecord | null>(null);
	const [runnerOpen, setRunnerOpen] = useState(false);

	return (
		<>
			<TopBar crumbs={[siteId, "Backups"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<Button onClick={() => setRunnerOpen(true)}>Back up now</Button>
					}
					subtitle="Local and off-site copies, retention and restore."
					title="Backups"
				/>
				{backups.isLoading || !backups.data ? (
					<Skeleton className="h-40 w-full" />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>When</TableHead>
								<TableHead>Size</TableHead>
								<TableHead>Location</TableHead>
								<TableHead>Verified</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{backups.data.map((b) => (
								<TableRow key={b.id}>
									<TableCell>{relativeTime(b.whenISO, now)}</TableCell>
									<TableCell>{b.sizeMB} MB</TableCell>
									<TableCell>
										<Badge variant="outline">
											{b.location === "offsite" ? "off-site" : "local"}
										</Badge>
									</TableCell>
									<TableCell>{b.verified ? "✓" : "—"}</TableCell>
									<TableCell className="text-right">
										<Button
											onClick={() => setRestoring(b)}
											size="sm"
											variant="ghost"
										>
											Restore…
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</main>

			<SafetyConfirm
				confirmLabel="Restore this backup"
				consequence={
					restoring
						? `This replaces the live site with the backup from ${relativeTime(restoring.whenISO, now)}. We back up the current state first.`
						: ""
				}
				onConfirm={() => {
					toast.success("Restore: starting (mock)…");
					setRestoring(null);
				}}
				onOpenChange={(open) => !open && setRestoring(null)}
				open={restoring !== null}
				reversible
				title="Restore a backup"
			/>

			<OperationRunner
				lines={[
					"Creating database dump…",
					"Archiving wp-content…",
					"Uploading to off-site (R2)…",
					"Verifying archive…",
				]}
				onOpenChange={setRunnerOpen}
				open={runnerOpen}
				title="Backing up acme-blog"
			/>
		</>
	);
}
```

- [ ] **Step 2: Verify** (`check-types`, `check`, visual: table renders; "Back up now" opens the runner and streams; "Restore…" opens the safety dialog with the reversible badge). **Step 3: Commit:**

```bash
git add control-panel/web/src/routes/_auth/sites/\$siteId/backups.tsx
git commit -m "feat(panel): site Backups page with restore safety + runner"
```

---

### Task 2.4: Logs page

**Files:**
- Create: `control-panel/web/src/routes/_auth/sites/$siteId/logs.tsx`

- [ ] **Step 1: Create the route:**

```tsx
import { Badge } from "@control-panel/ui/components/badge";
import { ScrollArea } from "@control-panel/ui/components/scroll-area";
import { Skeleton } from "@control-panel/ui/components/skeleton";
import {
	Tabs,
	TabsList,
	TabsTrigger,
} from "@control-panel/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { TopBar } from "@/components/top-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { logsQuery } from "@/data/queries";
import type { LogLine } from "@/data/types";

export const Route = createFileRoute("/_auth/sites/$siteId/logs")({
	component: LogsPage,
});

const SOURCES = ["all", "nginx", "php", "wp"] as const;

function LogsPage() {
	const { siteId } = Route.useParams();
	const logs = useQuery(logsQuery(siteId));
	const [source, setSource] = useState<(typeof SOURCES)[number]>("all");

	const filtered: LogLine[] =
		logs.data?.filter((l) => source === "all" || l.source === source) ?? [];

	return (
		<>
			<TopBar crumbs={[siteId, "Logs"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="Live tail across nginx, PHP-FPM and WordPress. Secrets redacted."
					title="Logs"
				/>
				<Tabs onValueChange={(v) => setSource(v as typeof source)} value={source}>
					<TabsList>
						{SOURCES.map((s) => (
							<TabsTrigger key={s} value={s}>
								{s}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{logs.isLoading ? (
					<Skeleton className="h-64 w-full" />
				) : (
					<ScrollArea className="h-64 rounded-md border border-border bg-background p-3 font-mono text-xs">
						{filtered.map((l) => (
							<div className="flex gap-3" key={l.id}>
								<span className="text-muted-foreground">{l.ts}</span>
								<Badge className="h-4" variant="outline">
									{l.source}
								</Badge>
								<span>{l.text}</span>
							</div>
						))}
					</ScrollArea>
				)}
			</main>
		</>
	);
}
```

- [ ] **Step 2: Verify** (`check-types`, `check`, visual: source tabs filter the lines). **Step 3: Commit:**

```bash
git add control-panel/web/src/routes/_auth/sites/\$siteId/logs.tsx
git commit -m "feat(panel): site Logs page"
```

---

### Task 2.5: Staging page

**Files:**
- Create: `control-panel/web/src/routes/_auth/sites/$siteId/staging.tsx`

- [ ] **Step 1: Create the route:**

```tsx
import { Badge } from "@control-panel/ui/components/badge";
import { Button } from "@control-panel/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@control-panel/ui/components/card";
import { Skeleton } from "@control-panel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { TopBar } from "@/components/top-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { stagingQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/sites/$siteId/staging")({
	component: StagingPage,
});

function StagingPage() {
	const { siteId } = Route.useParams();
	const staging = useQuery(stagingQuery(siteId));
	const [publishing, setPublishing] = useState(false);

	return (
		<>
			<TopBar crumbs={[siteId, "Staging"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="A safe copy of your live site to try changes first."
					title="Staging"
				/>
				{staging.isLoading || !staging.data ? (
					<Skeleton className="h-32 w-full" />
				) : staging.data.present ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-sm">
								{staging.data.url}
								{staging.data.noindex ? (
									<Badge variant="outline">noindex</Badge>
								) : null}
							</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2">
							<Button onClick={() => toast.success("Copy live → staging (mock)…")}>
								Copy live to staging
							</Button>
							<Button onClick={() => setPublishing(true)} variant="outline">
								Publish staging to live
							</Button>
						</CardContent>
					</Card>
				) : (
					<Card>
						<CardContent className="flex items-center justify-between py-6">
							<span className="text-muted-foreground text-sm">
								No staging site yet.
							</span>
							<Button onClick={() => toast.success("Add staging (mock)…")}>
								Add staging
							</Button>
						</CardContent>
					</Card>
				)}
			</main>

			<SafetyConfirm
				confirmLabel="Publish to live"
				consequence="This copies your staging files over the live site. We back up live first."
				onConfirm={() => {
					toast.success("Publishing to live (mock)…");
					setPublishing(false);
				}}
				onOpenChange={setPublishing}
				open={publishing}
				reversible
				title="Publish staging to live"
			/>
		</>
	);
}
```

- [ ] **Step 2: Verify** (`check-types`, `check`, visual). **Step 3: Commit:**

```bash
git add control-panel/web/src/routes/_auth/sites/\$siteId/staging.tsx
git commit -m "feat(panel): site Staging page"
```

---

# Phase 3 — Shared pages

### Task 3.1: Server & security page

**Files:**
- Create: `control-panel/web/src/routes/_auth/server.tsx`

- [ ] **Step 1: Create the route** (host facts + security cards; uses `serverInfoQuery`; "Secure the server" + a guarded "Stop a site"):

```tsx
import { Button } from "@control-panel/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@control-panel/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { TopBar } from "@/components/top-bar";
import { PageHeader } from "@/components/patterns/page-header";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { serverInfoQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/server")({
	component: ServerPage,
});

function ServerPage() {
	const server = useQuery(serverInfoQuery());
	const [stopping, setStopping] = useState(false);

	return (
		<>
			<TopBar crumbs={["Server & security"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<Button onClick={() => toast.success("Hardening server (mock)…")}>
							Secure the server
						</Button>
					}
					subtitle="The VPS shared by all your sites."
					title="Server & security"
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="text-sm">Host</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-1 text-sm">
							<div>{server.data?.vps ?? "—"}</div>
							<div>Sites: {server.data?.siteCount ?? "—"}</div>
							<div>Disk used: {server.data?.diskPercent ?? "—"}%</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-sm">Security</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-1 text-sm">
							<div className="text-success">Firewall: on</div>
							<div className="text-success">fail2ban: active</div>
							<div className="text-success">Auto-updates: on</div>
						</CardContent>
					</Card>
				</div>
				<Card className="border-destructive/40">
					<CardContent className="flex items-center justify-between py-4">
						<div className="text-sm">
							<div className="font-medium">Stop a site</div>
							<div className="text-muted-foreground text-xs">
								Takes a site offline until you start it again.
							</div>
						</div>
						<Button onClick={() => setStopping(true)} variant="outline">
							Stop a site…
						</Button>
					</CardContent>
				</Card>
			</main>

			<SafetyConfirm
				confirmLabel="Stop the site"
				consequence="The site goes offline until you start it again. Your data and backups are untouched."
				onConfirm={() => {
					toast.success("Stopping the site (mock)…");
					setStopping(false);
				}}
				onOpenChange={setStopping}
				open={stopping}
				reversible
				title="Stop a site"
			/>
		</>
	);
}
```

- [ ] **Step 2: Verify** (`check-types`, `check`, visual). **Step 3: Commit:**

```bash
git add control-panel/web/src/routes/_auth/server.tsx
git commit -m "feat(panel): Server & security page"
```

---

### Task 3.2: Settings page

**Files:**
- Create: `control-panel/web/src/routes/_auth/settings.tsx`

- [ ] **Step 1: Create the route:**

```tsx
import { Button } from "@control-panel/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@control-panel/ui/components/card";
import { Input } from "@control-panel/ui/components/input";
import { Label } from "@control-panel/ui/components/label";
import { createFileRoute } from "@tanstack/react-router";

import { ModeToggle } from "@/components/mode-toggle";
import { TopBar } from "@/components/top-bar";
import { PageHeader } from "@/components/patterns/page-header";

export const Route = createFileRoute("/_auth/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<>
			<TopBar crumbs={["Settings"]} />
			<main className="mx-auto grid w-full max-w-3xl gap-4 p-6">
				<PageHeader
					subtitle="Panel preferences and alert channels."
					title="Settings"
				/>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Appearance</CardTitle>
					</CardHeader>
					<CardContent className="flex items-center justify-between">
						<span className="text-sm">Theme</span>
						<ModeToggle />
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Alert channels</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						<div className="grid gap-1.5">
							<Label htmlFor="telegram">Telegram chat ID</Label>
							<Input id="telegram" placeholder="123456789" />
						</div>
						<div className="grid gap-1.5">
							<Label htmlFor="webhook">Webhook URL</Label>
							<Input id="webhook" placeholder="https://…" />
						</div>
						<Button className="justify-self-start">Save</Button>
					</CardContent>
				</Card>
			</main>
		</>
	);
}
```

- [ ] **Step 2: Verify** (`check-types`, `check`, visual). **Step 3: Commit:**

```bash
git add control-panel/web/src/routes/_auth/settings.tsx
git commit -m "feat(panel): Settings page"
```

---

# Phase 4 — Polish

### Task 4.1: Friendly empty/error states + query error toasts

**Files:**
- Modify: `control-panel/web/src/routes/_auth/sites/index.tsx`
- Modify: `control-panel/web/src/routes/_auth/sites/$siteId/overview.tsx`

**Interfaces:**
- Consumes: shadcn `Empty` (`@control-panel/ui/components/empty`).

- [ ] **Step 1: Add an empty state to the Sites page.** In `sites/index.tsx`, after the `{sites.data?.map(...)}` grid, when `sites.data?.length === 0`, render:

```tsx
{sites.data && sites.data.length === 0 ? (
	<div className="rounded-lg border border-border border-dashed p-10 text-center">
		<p className="font-medium">No sites yet</p>
		<p className="mt-1 text-muted-foreground text-sm">
			Create your first Vibe WP site to get started.
		</p>
		<Button className="mt-4">
			<Plus className="size-4" /> New site
		</Button>
	</div>
) : null}
```

- [ ] **Step 2: Add an error state to Overview.** In `overview.tsx`, before the loading branch, add:

```tsx
{overview.isError ? (
	<div className="rounded-lg border border-destructive/40 p-6 text-sm">
		<p className="font-medium">Couldn't load this site.</p>
		<Button className="mt-3" onClick={() => overview.refetch()} variant="outline">
			Try again
		</Button>
	</div>
) : null}
```

(Import `Button` into `overview.tsx`.)

- [ ] **Step 3: Verify + commit.** `bun run check-types` / `bun run check` (PASS).

```bash
git add control-panel/web/src/routes/_auth/sites
git commit -m "feat(panel): friendly empty + error states"
```

---

### Task 4.2: Live pulse motion + reduced-motion + mobile check

**Files:**
- Modify: `control-panel/web/src/components/patterns/status-hero.tsx`

- [ ] **Step 1: Animate the live dot, respecting reduced motion.** In `status-hero.tsx`, change the live dot span to:

```tsx
<span className={`size-1.5 rounded-full motion-safe:animate-pulse ${tone.dot}`} />
```

- [ ] **Step 2: Verify mobile shell.** Run the dev loop, narrow the viewport to ~375px: confirm the sidebar collapses to a `Sheet` (toggle via the `SidebarTrigger`) and content reflows to one column on Overview.

- [ ] **Step 3: Verify + commit.**

```bash
git add control-panel/web/src/components/patterns/status-hero.tsx
git commit -m "feat(panel): live pulse motion (reduced-motion safe)"
```

---

### Task 4.3: Command palette (⌘K) for site/page navigation

**Files:**
- Create: `control-panel/web/src/components/command-menu.tsx`
- Modify: `control-panel/web/src/routes/_auth/route.tsx`

**Interfaces:**
- Consumes: shadcn `CommandDialog`, `sitesQuery`.

- [ ] **Step 1: Create `command-menu.tsx`:**

```tsx
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@control-panel/ui/components/command";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { sitesQuery } from "@/data/queries";

export function CommandMenu() {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();
	const sites = useQuery(sitesQuery());

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((o) => !o);
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	return (
		<CommandDialog onOpenChange={setOpen} open={open}>
			<CommandInput placeholder="Jump to a site or page…" />
			<CommandList>
				<CommandEmpty>No results.</CommandEmpty>
				<CommandGroup heading="Sites">
					{sites.data?.map((s) => (
						<CommandItem
							key={s.id}
							onSelect={() => {
								navigate({
									to: "/sites/$siteId/overview",
									params: { siteId: s.id },
								});
								setOpen(false);
							}}
							value={s.name}
						>
							{s.name}
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
```

- [ ] **Step 2: Mount it in the shell.** In `_auth/route.tsx`, import `CommandMenu` and render `<CommandMenu />` inside `<SidebarInset>` before `<Outlet />`.

- [ ] **Step 3: Verify + commit.** `bun run check-types` / `bun run check` (PASS); ⌘K opens the palette and navigating works.

```bash
git add control-panel/web/src/components/command-menu.tsx control-panel/web/src/routes/_auth/route.tsx
git commit -m "feat(panel): ⌘K command palette"
```

---

### Task 4.4: Final accessibility + quality sweep

- [ ] **Step 1: Keyboard pass.** Tab through the shell and one of each page; confirm visible focus rings (the `ring` token), the sidebar toggle, dropdowns, and dialogs are reachable and dismissable with Esc.
- [ ] **Step 2: Contrast pass.** In both themes, confirm `text-success`/`text-warning` on `bg-card` and the primary button are legible (AA). If `--warning` is hard to read on light surfaces, darken `--warning` in `:root` only.
- [ ] **Step 3: Full gate.** From `control-panel/`: `bun run test` (PASS), `bun run check-types` (PASS), `bun run check` (PASS).
- [ ] **Step 4: Commit any fixes.**

```bash
git add -A
git commit -m "chore(panel): a11y + contrast polish"
```

---

## Self-Review (completed during planning)

**Spec coverage:** §3 brand/tokens → Task 0.1; §4 shell + routing → Task 0.3; §5 dashboard concept → Tasks 1.2–1.3; §6 pattern library → Tasks 1.2, 2.1; §7 voice → copy throughout; §8 mock-data seam → Task 0.2; §9 a11y/motion → Tasks 4.2, 4.4; IA pages → Tasks 1.1, 2.2–2.5, 3.1–3.2; build order → phases match. Login screen is intentionally left functional (out of scope, noted in spec §2).

**Placeholders:** none — every code step is complete; the only deferred content is the explicitly-mock "Details for developers" body and mock operation streams, which are intended placeholders for the future backend wiring (spec non-goal), labelled as such.

**Type consistency:** verified `Verdict`/`MetricTile`/`NeedItem`/`SiteOverview`/`BackupRecord`/`LogLine`/`StagingInfo`/`HealthReport` names and the `siteOverviewQuery`/`healthQuery`/`backupsQuery`/`logsQuery`/`stagingQuery`/`sitesQuery`/`serverInfoQuery` factory names are identical between Task 0.2 and every consumer.
