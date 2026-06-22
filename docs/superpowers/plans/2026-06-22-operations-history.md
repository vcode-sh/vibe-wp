# Operations History + Audit-Log Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a server-wide "Operations" page that shows persisted job history joined with audit-log actor info, so operators can review past operations (who, what, when, outcome) after leaving the page.

**Architecture:** A new `operationsList` procedure in `packages/api/src/routers/operations.ts` runs a Drizzle left-join of `jobs` → `audit_log` → `user` (name), returns `JobHistoryEntry[]` sorted newest-first, capped at 100. The web side adds a `/_auth/operations` route, a `SERVER_LINKS` sidebar entry, and a table page that renders the history via `QueryBoundary` and `useQuery`.

**Tech Stack:** Drizzle ORM (libsql/SQLite), oRPC, TanStack Query, TanStack Router file-based routing, shadcn/ui (`Table`, `Badge`), semantic color tokens.

## Global Constraints

- TypeScript/TSX files ≤ 220 lines; split if a file would exceed this
- No `any` — use strict types throughout
- oRPC + TanStack Query conventions: procedures live in the router, query factories live in `web/src/data/queries.ts`, `orpc.<procedure>.queryOptions()` in the component
- shadcn/ui primitives only; semantic tokens (e.g. `text-success`, `text-destructive`, `text-warning`, `text-muted-foreground`) not hardcoded colors
- Gate commands always run from `control-panel/`: `bun run check-types && bun run check && bun run build`
- `protectedProcedure` for read-only access (any authenticated user); `adminProcedure` for write/destructive
- English copy; no placeholder "TBD" content
- Tabs for indentation (project convention)

---

### Task 1: `JobHistoryEntry` contract type + `jobsHistory` DB query helper

**Files:**
- Modify: `control-panel/packages/api/src/contract.ts`
- Modify: `control-panel/packages/api/src/core-bridge/jobs-db.ts`

**Interfaces:**
- Produces:
  - `JobHistoryEntry` (exported from `contract.ts`) — the shape returned by the procedure and consumed by the UI
  - `jobsHistory(opts)` (exported from `jobs-db.ts`) — the DB query function

- [ ] **Step 1: Add `JobHistoryEntry` to contract.ts**

Open `control-panel/packages/api/src/contract.ts` and append after the `ProvisionJobRef` interface (around line 126):

```typescript
export interface JobHistoryEntry {
	/** Unique job id */
	id: string;
	/** Site id the job ran against */
	siteId: string;
	/** Operation kind, e.g. "backup", "restore", "harden" */
	kind: string;
	/** Audit action label, e.g. "backup", "cancel" — null when no audit row was written */
	action: string | null;
	/** Display name of the user who triggered the operation — null when unknown */
	actorName: string | null;
	/** User id of the actor — null when unknown */
	actorId: string | null;
	status: JobStatus;
	exitCode: number | null;
	startedAt: string;
	finishedAt: string | null;
	/** Duration in seconds, null if not yet finished */
	durationSeconds: number | null;
}
```

- [ ] **Step 2: Add `jobsHistory` query to jobs-db.ts**

Open `control-panel/packages/api/src/core-bridge/jobs-db.ts`. Add imports at the top:

```typescript
import { db } from "@control-panel/db";
import { auditLog, jobs } from "@control-panel/db/schema/jobs";
import { user } from "@control-panel/db/schema/auth";
import { desc, eq } from "drizzle-orm";
```

(The file already imports `db`, `auditLog`, `jobs`, `desc`, `eq` — add only `user` from `@control-panel/db/schema/auth`.)

Then append this function:

```typescript
export interface JobsHistoryOptions {
	siteId?: string;
	limit?: number;
}

export async function jobsHistory(opts: JobsHistoryOptions = {}): Promise<
	Array<{
		id: string;
		siteId: string;
		kind: string;
		status: string;
		exitCode: number | null;
		startedAt: Date;
		finishedAt: Date | null;
		action: string | null;
		actorId: string | null;
		actorName: string | null;
	}>
> {
	const limit = Math.min(opts.limit ?? 100, 100);
	const rows = await db
		.select({
			id: jobs.id,
			siteId: jobs.siteId,
			kind: jobs.kind,
			status: jobs.status,
			exitCode: jobs.exitCode,
			startedAt: jobs.startedAt,
			finishedAt: jobs.finishedAt,
			action: auditLog.action,
			actorId: auditLog.userId,
			actorName: user.name,
		})
		.from(jobs)
		.leftJoin(auditLog, eq(auditLog.jobId, jobs.id))
		.leftJoin(user, eq(user.id, auditLog.userId))
		.orderBy(desc(jobs.startedAt))
		.limit(limit);

	if (opts.siteId) {
		return rows.filter((r) => r.siteId === opts.siteId);
	}
	return rows;
}
```

Note on the `.filter` after the query: SQLite `WHERE` on a `.leftJoin` result is cleaner as a Drizzle `.where(eq(jobs.siteId, siteId))` but requires conditional query building. The post-filter approach is acceptable for ≤100 rows; if a site-scoped hot path emerges later, add `.where` then. The schema already has `jobs.siteId` unindexed — add no migration in this task.

- [ ] **Step 3: Run type check**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run check-types 2>&1 | head -40
```

Expected: no errors in `contract.ts` or `jobs-db.ts`.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomrobak/_projects_/vibe-wp && git add control-panel/packages/api/src/contract.ts control-panel/packages/api/src/core-bridge/jobs-db.ts && git commit -m "feat(api): add JobHistoryEntry type + jobsHistory DB query"
```

---

### Task 2: `operationsList` oRPC procedure

**Files:**
- Modify: `control-panel/packages/api/src/routers/operations.ts`

**Interfaces:**
- Consumes: `jobsHistory(opts)` from `../core-bridge/jobs-db`, `JobHistoryEntry` from `../contract`
- Produces: `operationsList` procedure on `operationsRouter` — input `{ siteId?: string, limit?: number }`, output `JobHistoryEntry[]`

- [ ] **Step 1: Update operations.ts**

Open `control-panel/packages/api/src/routers/operations.ts`. The current file has three procedures (`operationsGet`, `operationsStream`, `operationsCancel`). Add the following import alongside the existing ones:

```typescript
import type { Job, JobHistoryEntry, StreamEvent } from "../contract";
import { cancelJob, getJob, streamJob } from "../core-bridge/jobs";
import { jobsHistory, writeAudit } from "../core-bridge/jobs-db";
```

(Replace the existing `import { writeAudit } from "../core-bridge/jobs-db";` line with the above.)

Then add `operationsList` to the router object (append before the closing `};`):

```typescript
	operationsList: protectedProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				limit: z.number().int().min(1).max(100).optional(),
			})
		)
		.handler(async ({ input }): Promise<JobHistoryEntry[]> => {
			const rows = await jobsHistory({
				siteId: input.siteId,
				limit: input.limit,
			});
			return rows.map((r) => ({
				id: r.id,
				siteId: r.siteId,
				kind: r.kind,
				action: r.action,
				actorName: r.actorName,
				actorId: r.actorId,
				status: r.status as JobHistoryEntry["status"],
				exitCode: r.exitCode,
				startedAt: r.startedAt.toISOString(),
				finishedAt: r.finishedAt?.toISOString() ?? null,
				durationSeconds:
					r.finishedAt !== null
						? Math.round(
								(r.finishedAt.getTime() - r.startedAt.getTime()) / 1000
							)
						: null,
			}));
		}),
```

Full updated file (complete, since Task 1 already wrote the import line — adjust accordingly to not duplicate):

The file after edits should have at the top:

```typescript
import { eventIterator } from "@orpc/server";
import { z } from "zod";

import type { Job, JobHistoryEntry, StreamEvent } from "../contract";
import { cancelJob, getJob, streamJob } from "../core-bridge/jobs";
import { jobsHistory, writeAudit } from "../core-bridge/jobs-db";
import { adminProcedure, protectedProcedure } from "../procedures";
```

And `operationsList` as the last entry in `operationsRouter`.

- [ ] **Step 2: Run type check and linting**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run check-types 2>&1 | head -40 && bun run check 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Run build to confirm the package dist compiles**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomrobak/_projects_/vibe-wp && git add control-panel/packages/api/src/routers/operations.ts && git commit -m "feat(api): add operationsList procedure (jobs + audit join)"
```

---

### Task 3: Web query factory + contract type export

**Files:**
- Modify: `control-panel/web/src/data/queries.ts`
- Modify: `control-panel/web/src/data/types.ts`

**Interfaces:**
- Consumes: `operationsList` procedure via `orpc` client (auto-typed via `AppRouterClient`)
- Produces:
  - `operationsListQuery(opts?)` — query factory in `queries.ts`
  - `JobHistoryEntry` re-exported from `types.ts`

- [ ] **Step 1: Add the query factory to queries.ts**

Open `control-panel/web/src/data/queries.ts` and append:

```typescript
export const operationsListQuery = (opts?: {
	siteId?: string;
	limit?: number;
}) => orpc.operationsList.queryOptions({ input: opts ?? {} });
```

- [ ] **Step 2: Re-export `JobHistoryEntry` from types.ts**

Open `control-panel/web/src/data/types.ts`. The file re-exports from `@control-panel/api/contract`. Add `JobHistoryEntry` to the list:

```typescript
export type {
	ActivityEntry,
	BackupRecord,
	BackupScheduleInput,
	CreateExternalInput,
	CreateSiteInput,
	HealthReport,
	Job,
	JobHistoryEntry,
	JobStatus,
	LogLine,
	MetricTile,
	NeedItem,
	PerformancePresetInput,
	PerfReport,
	ServerInfo,
	SiteOverview,
	SiteSummary,
	StagingInfo,
	StreamEvent,
	Verdict,
} from "@control-panel/api/contract";
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run check-types 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomrobak/_projects_/vibe-wp && git add control-panel/web/src/data/queries.ts control-panel/web/src/data/types.ts && git commit -m "feat(web): add operationsListQuery factory + JobHistoryEntry type export"
```

---

### Task 4: Status badge component

**Files:**
- Create: `control-panel/web/src/components/patterns/job-status-badge.tsx`

**Interfaces:**
- Consumes: `JobStatus` from `@/data/types`
- Produces: `<JobStatusBadge status={…} />` — used by the operations table in Task 5

**Why a dedicated file:** the status badge has its own label/color mapping; isolating it keeps the table file under 220 lines and makes the component reusable if site-scoped history views are added later.

- [ ] **Step 1: Write the component**

Create `/Users/tomrobak/_projects_/vibe-wp/control-panel/web/src/components/patterns/job-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import type { JobStatus } from "@/data/types";

const LABELS: Record<JobStatus, string> = {
	queued: "Queued",
	running: "Running",
	succeeded: "Succeeded",
	failed: "Failed",
	canceled: "Canceled",
};

function statusClassName(status: JobStatus): string {
	switch (status) {
		case "succeeded":
			return "border-transparent bg-success/10 text-success";
		case "failed":
			return "border-transparent bg-destructive/10 text-destructive";
		case "running":
			return "border-transparent bg-primary/10 text-primary";
		case "canceled":
			return "border-transparent bg-muted text-muted-foreground";
		default:
			return "border-transparent bg-muted text-muted-foreground";
	}
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
	return (
		<Badge className={statusClassName(status)} variant="outline">
			{LABELS[status]}
		</Badge>
	);
}
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run check-types 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/tomrobak/_projects_/vibe-wp && git add control-panel/web/src/components/patterns/job-status-badge.tsx && git commit -m "feat(web): add JobStatusBadge component with semantic tokens"
```

---

### Task 5: Operations history page route

**Files:**
- Create: `control-panel/web/src/routes/_auth/operations.tsx`

**Interfaces:**
- Consumes:
  - `operationsListQuery()` from `@/data/queries`
  - `JobHistoryEntry` from `@/data/types`
  - `JobStatusBadge` from `@/components/patterns/job-status-badge`
  - `QueryBoundary` from `@/components/patterns/query-boundary`
  - `relativeTime` from `@/data/derive`
  - `PageHeader` from `@/components/patterns/page-header`
  - `TopBar` from `@/components/top-bar`
  - `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` from `@control-panel/ui/components/table`
- Produces: `/_auth/operations` route, accessible from the sidebar

This file must stay ≤ 220 lines. The table rows and empty state are rendered inline (no sub-component extraction needed for that count).

- [ ] **Step 1: Create the route file**

Create `/Users/tomrobak/_projects_/vibe-wp/control-panel/web/src/routes/_auth/operations.tsx`:

```tsx
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
import { JobStatusBadge } from "@/components/patterns/job-status-badge";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { relativeTime } from "@/data/derive";
import { operationsListQuery } from "@/data/queries";
import type { JobHistoryEntry } from "@/data/types";

export const Route = createFileRoute("/_auth/operations")({
	component: OperationsPage,
});

function durationLabel(seconds: number | null): string {
	if (seconds === null) {
		return "—";
	}
	if (seconds < 60) {
		return `${seconds}s`;
	}
	return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function actionLabel(entry: JobHistoryEntry): string {
	return entry.action ?? entry.kind;
}

function OperationsTable({ entries }: { entries: JobHistoryEntry[] }) {
	const now = new Date();

	if (entries.length === 0) {
		return (
			<div className="rounded-lg border border-border border-dashed p-10 text-center text-muted-foreground text-sm">
				No operations recorded yet. Run a backup, update, or other action to see
				history here.
			</div>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>When</TableHead>
					<TableHead>Site</TableHead>
					<TableHead>Action</TableHead>
					<TableHead>Actor</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Duration</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{entries.map((e) => (
					<TableRow key={e.id}>
						<TableCell className="text-muted-foreground text-sm">
							{relativeTime(e.startedAt, now)}
						</TableCell>
						<TableCell className="font-medium">{e.siteId}</TableCell>
						<TableCell>{actionLabel(e)}</TableCell>
						<TableCell className="text-muted-foreground">
							{e.actorName ?? "—"}
						</TableCell>
						<TableCell>
							<JobStatusBadge status={e.status} />
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{durationLabel(e.durationSeconds)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}

function OperationsPage() {
	const history = useQuery(operationsListQuery());

	return (
		<>
			<TopBar crumbs={["Operations"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="Past operations across all sites — who ran what and how it went."
					title="Operations"
				/>
				<QueryBoundary
					errorMessage="Couldn't load the operations history."
					hasData={Boolean(history.data)}
					isError={history.isError}
					isLoading={history.isLoading}
					onRetry={() => history.refetch()}
					skeletonClassName="h-48 w-full"
				>
					{history.data ? (
						<OperationsTable entries={history.data} />
					) : null}
				</QueryBoundary>
			</div>
		</>
	);
}
```

- [ ] **Step 2: Verify line count stays ≤ 220**

```bash
wc -l /Users/tomrobak/_projects_/vibe-wp/control-panel/web/src/routes/_auth/operations.tsx
```

Expected: ≤ 220 lines.

- [ ] **Step 3: Type-check**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run check-types 2>&1 | head -40
```

Expected: no errors. TanStack Router will code-generate the route into `.tanstack/` automatically on next dev/build run.

- [ ] **Step 4: Build (triggers route codegen)**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run build 2>&1 | tail -20
```

Expected: build succeeds; `.tanstack/` is updated with `/_auth/operations`.

- [ ] **Step 5: Commit**

```bash
cd /Users/tomrobak/_projects_/vibe-wp && git add control-panel/web/src/routes/_auth/operations.tsx && git commit -m "feat(web): add /_auth/operations history page"
```

---

### Task 6: Wire sidebar entry

**Files:**
- Modify: `control-panel/web/src/components/app-sidebar.tsx`

**Interfaces:**
- Consumes: `History` icon from `lucide-react` (already a dependency)
- Produces: "Operations" entry added to `SERVER_LINKS`

- [ ] **Step 1: Add the icon import and SERVER_LINKS entry**

Open `control-panel/web/src/components/app-sidebar.tsx`.

Add `History` to the lucide-react import:

```typescript
import {
	Activity,
	CopyCheck,
	HeartPulse,
	History,
	LayoutDashboard,
	ScrollText,
	Settings,
	ShieldCheck,
	SlidersHorizontal,
} from "lucide-react";
```

Update `SERVER_LINKS` to include Operations as the first entry (before "Server & security"):

```typescript
const SERVER_LINKS: SiteLink[] = [
	{ label: "Operations", to: "/operations", icon: History },
	{ label: "Server & security", to: "/server", icon: ShieldCheck },
	{ label: "Settings", to: "/settings", icon: Settings },
];
```

- [ ] **Step 2: Type-check and lint**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run check-types 2>&1 | head -20 && bun run check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Full gate**

```bash
cd /Users/tomrobak/_projects_/vibe-wp/control-panel && bun run check-types && bun run check && bun run build 2>&1 | tail -30
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
cd /Users/tomrobak/_projects_/vibe-wp && git add control-panel/web/src/components/app-sidebar.tsx && git commit -m "feat(web): add Operations entry to server sidebar links"
```

---

## Self-Review

### Spec coverage check

| Requirement | Covered in |
|---|---|
| `operationsList` procedure with optional `siteId?` + `limit?` | Task 2 |
| Jobs joined with audit info (actor/action/timestamps/exit code) | Task 1 (`jobsHistory`) |
| `JobHistoryEntry` contract type | Task 1 |
| Newest-first, capped at 100 | Task 1 |
| Server-wide (no `siteId`) + per-site (pass `siteId`) | Task 1 `jobsHistory` + Task 2 input |
| No secrets in output (rows don't carry secrets; `actorName`/`actorId` are non-sensitive) | Task 1 |
| Server-wide "Operations" sidebar entry | Task 6 |
| Table: timestamp, site, action/kind, actor, status badge, duration | Task 5 |
| Semantic-token status colors | Task 4 |
| `QueryBoundary` loading/empty/error states | Task 5 |
| TSX ≤ 220 lines | Task 5 (verified with `wc -l`) |
| Gates green | Tasks 2, 3, 4, 5, 6 each run `check-types`, Task 6 runs full gate |

### Placeholder scan
No TBD, TODO, or "similar to Task N" placeholders present. All code blocks are complete.

### Type consistency check
- `JobHistoryEntry` defined once in `contract.ts` (Task 1), re-exported via `types.ts` (Task 3), used in `operations.ts` (Task 2) and `operations.tsx` (Task 5) — consistent.
- `jobsHistory` signature defined in Task 1, called in Task 2 — matches.
- `operationsList` output shape in Task 2 maps exactly to `JobHistoryEntry` fields.
- `operationsListQuery()` in Task 3 calls `orpc.operationsList.queryOptions()` — procedure name matches Task 2.
- `JobStatusBadge` accepts `status: JobStatus` (Task 4); `OperationsTable` passes `e.status` typed as `JobStatus` (Task 5) — consistent.
- `durationLabel`, `actionLabel` helpers defined and called within the same file (Task 5) — no cross-task name drift.
