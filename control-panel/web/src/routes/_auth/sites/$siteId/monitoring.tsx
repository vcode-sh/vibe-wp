import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { tileFromHistory, upSeries } from "@/components/monitoring/derive-tile";
import { MonitoringCard } from "@/components/monitoring/monitoring-card";
import { StatusLegend } from "@/components/monitoring/status-legend";
import {
	WINDOW_CHOICES,
	WindowSelect,
} from "@/components/monitoring/window-select";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { monitoringHistoryQuery, sitesQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";
import { invalidateMonitoringSampleRecorded } from "@/lib/realtime/immediate-invalidation";

export const Route = createFileRoute("/_auth/sites/$siteId/monitoring")({
	component: MonitoringPage,
});

function MonitoringPage() {
	const { siteId } = Route.useParams();
	const qc = useQueryClient();
	const [windowDays, setWindowDays] = useState(7);
	const history = useQuery(monitoringHistoryQuery(siteId, windowDays));
	const sites = useQuery(sitesQuery());
	const record = useMutation(orpc.monitoringRecordSample.mutationOptions());

	const domain = sites.data?.find((s) => s.id === siteId)?.domain ?? siteId;
	const samples = history.data ?? [];
	const entry = tileFromHistory(siteId, domain, samples);
	const windowLabel =
		WINDOW_CHOICES.find((c) => c.days === windowDays)?.label ??
		`${windowDays}d`;
	const now = new Date();
	const noSamples = samples.length === 0 && history.data !== undefined;

	async function handleRecord() {
		try {
			await record.mutateAsync({ siteId });
			await invalidateMonitoringSampleRecorded(qc, siteId);
			toast.success("Captured a fresh monitoring snapshot.");
		} catch {
			toast.error("Couldn't record a monitor sample. Try again in a moment.");
		}
	}

	return (
		<>
			<TopBar crumbs={[siteId, "Monitoring"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<div className="flex items-center gap-2">
							<WindowSelect onChange={setWindowDays} value={windowDays} />
							<Button disabled={record.isPending} onClick={handleRecord}>
								{record.isPending ? "Checking…" : "Check now"}
							</Button>
						</div>
					}
					subtitle="Is this site up, is its HTTPS certificate fresh, and does its domain still point here? We check automatically and keep a history so you can spot trends."
					title="Monitoring"
				/>
				<StatusLegend />
				<QueryBoundary
					errorMessage="Couldn't load monitoring history."
					hasData={history.data !== undefined}
					isError={history.isError}
					isLoading={history.isLoading}
					onRetry={() => history.refetch()}
					skeletonClassName="h-64 w-full"
				>
					{history.data === undefined ? null : (
						<MonitoringCard
							entry={entry}
							now={now}
							ups={upSeries(samples)}
							windowLabel={windowLabel}
						/>
					)}
				</QueryBoundary>
				{noSamples ? (
					<div className="rounded-md border border-border border-dashed p-6 text-center">
						<p className="font-medium text-sm">No checks recorded yet</p>
						<p className="mt-1 text-muted-foreground text-sm">
							The panel records a check for every site automatically in the
							background, so history builds up on its own. To capture the very
							first snapshot right now, press “Check now”.
						</p>
						<div className="mt-3 flex justify-center">
							<Button
								disabled={record.isPending}
								onClick={handleRecord}
								variant="secondary"
							>
								{record.isPending ? "Checking…" : "Check now"}
							</Button>
						</div>
					</div>
				) : null}
			</div>
		</>
	);
}
