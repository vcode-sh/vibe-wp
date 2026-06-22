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
						<TableCell>{e.action ?? e.kind}</TableCell>
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
					{history.data ? <OperationsTable entries={history.data} /> : null}
				</QueryBoundary>
			</div>
		</>
	);
}
