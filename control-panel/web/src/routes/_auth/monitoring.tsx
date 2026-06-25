import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { OverviewTile } from "@/components/monitoring/overview-tile";
import { StatusLegend } from "@/components/monitoring/status-legend";
import { statusTier, worstTier } from "@/components/monitoring/tiers";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { monitoringOverviewQuery } from "@/data/queries";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/monitoring")({
	component: MonitoringOverviewPage,
});

function headline(
	entries: { status: "ok" | "warn" | "fail" | "unknown" }[]
): string {
	if (entries.length === 0) {
		return "No sites detected yet.";
	}
	const worst = worstTier(entries.map((e) => statusTier(e.status)));
	const attention = entries.filter(
		(e) => e.status === "warn" || e.status === "fail"
	).length;
	if (worst === "ok") {
		return `All ${entries.length} site${entries.length === 1 ? "" : "s"} healthy.`;
	}
	if (worst === "none") {
		return "Waiting for the first checks to record.";
	}
	return `${attention} of ${entries.length} site${entries.length === 1 ? "" : "s"} need attention.`;
}

function MonitoringOverviewPage() {
	const qc = useQueryClient();
	const overview = useQuery(monitoringOverviewQuery());
	const checkAll = useMutation(orpc.monitoringSummary.mutationOptions());
	const now = new Date();
	const entries = overview.data ?? [];
	// monitoringSummary is operator+ — viewers can read the board but can't run a
	// fresh check, so don't show them a button that only fails.
	const { data: session } = authClient.useSession();
	const canCheck =
		session?.user.role === "operator" || session?.user.role === "admin";

	async function handleCheckAll() {
		try {
			await checkAll.mutateAsync({});
			await qc.invalidateQueries(monitoringOverviewQuery());
			toast.success("Checked every site and updated their status.");
		} catch {
			toast.error("Couldn't check the sites. Try again in a moment.");
		}
	}

	return (
		<>
			<TopBar crumbs={["Monitoring"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						canCheck ? (
							<Button disabled={checkAll.isPending} onClick={handleCheckAll}>
								{checkAll.isPending ? "Checking…" : "Check every site"}
							</Button>
						) : undefined
					}
					subtitle={overview.data ? headline(entries) : "Loading site status…"}
					title="Monitoring"
				/>
				<StatusLegend />
				<QueryBoundary
					errorMessage="Couldn't load site status."
					hasData={overview.data !== undefined}
					isError={overview.isError}
					isLoading={overview.isLoading}
					onRetry={() => overview.refetch()}
					skeletonClassName="h-48 w-full"
				>
					{entries.length === 0 ? (
						<div className="rounded-md border border-border border-dashed p-6 text-center">
							<p className="font-medium text-sm">No sites to monitor yet</p>
							<p className="mt-1 text-muted-foreground text-sm">
								Once a site is installed it appears here automatically with its
								uptime, certificate and DNS status. Press “Check every site” to
								capture the first snapshot.
							</p>
						</div>
					) : (
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{entries.map((entry) => (
								<OverviewTile entry={entry} key={entry.siteId} now={now} />
							))}
						</div>
					)}
				</QueryBoundary>
			</div>
		</>
	);
}
