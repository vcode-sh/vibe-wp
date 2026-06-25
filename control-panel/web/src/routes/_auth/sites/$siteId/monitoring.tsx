import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { tileFromHistory, upSeries } from "@/components/monitoring/derive-tile";
import { MonitoringCard } from "@/components/monitoring/monitoring-card";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { monitoringHistoryQuery, sitesQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/sites/$siteId/monitoring")({
	component: MonitoringPage,
});

function MonitoringPage() {
	const { siteId } = Route.useParams();
	const qc = useQueryClient();
	const history = useQuery(monitoringHistoryQuery(siteId, 7));
	const sites = useQuery(sitesQuery());
	const record = useMutation(orpc.monitoringRecordSample.mutationOptions());

	const domain = sites.data?.find((s) => s.id === siteId)?.domain ?? siteId;
	const samples = history.data ?? [];
	const entry = tileFromHistory(siteId, domain, samples);
	const now = new Date();

	async function handleRecord() {
		try {
			await record.mutateAsync({ siteId });
			await qc.invalidateQueries(monitoringHistoryQuery(siteId, 7));
		} catch {
			toast.error("Couldn't record a monitor sample.");
		}
	}

	return (
		<>
			<TopBar crumbs={[siteId, "Monitoring"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<Button disabled={record.isPending} onClick={handleRecord}>
							{record.isPending ? "Recording…" : "Record sample"}
						</Button>
					}
					subtitle="Uptime, certificate expiry and DNS, with recorded history."
					title="Monitoring"
				/>
				<QueryBoundary
					errorMessage="Couldn't load monitoring history."
					hasData={history.data !== undefined}
					isError={history.isError}
					isLoading={history.isLoading}
					onRetry={() => history.refetch()}
					skeletonClassName="h-64 w-full"
				>
					{history.data === undefined ? null : (
						<MonitoringCard entry={entry} now={now} ups={upSeries(samples)} />
					)}
				</QueryBoundary>
				{samples.length === 0 && history.data !== undefined ? (
					<p className="text-muted-foreground text-sm">
						No samples recorded yet. Use “Record sample” to capture the first
						snapshot — the scheduled monitor timer also accrues history over
						time.
					</p>
				) : null}
			</div>
		</>
	);
}
