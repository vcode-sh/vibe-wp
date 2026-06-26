import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PerformanceAdvisorCard } from "@/components/health/performance-advisor-card";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { VerdictTile } from "@/components/patterns/verdict-tile";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { healthPerfQuery, healthQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";
import { invalidateMonitoringSampleRecorded } from "@/lib/realtime/immediate-invalidation";

export const Route = createFileRoute("/_auth/sites/$siteId/health")({
	component: HealthPage,
});

function uptimeDisplay(
	data: { tiles: Array<{ key: string }>; uptimePercent: number } | undefined
): { className: string; label: string } {
	if (data === undefined) {
		return { label: "—", className: "" };
	}
	if (data.tiles.some((tile) => tile.key === "monitoring-sample")) {
		return { label: "Pending", className: "text-muted-foreground" };
	}
	return data.uptimePercent >= 100
		? { label: "Reachable", className: "text-success" }
		: { label: "Unreachable", className: "text-destructive" };
}

function HealthPage() {
	const { siteId } = Route.useParams();
	const qc = useQueryClient();
	const health = useQuery(healthQuery(siteId));
	const record = useMutation(orpc.monitoringRecordSample.mutationOptions());
	const [perfEnabled, setPerfEnabled] = useState(false);
	const perf = useQuery({
		...healthPerfQuery(siteId),
		enabled: perfEnabled,
	});

	const uptime = uptimeDisplay(health.data);

	async function handleHealthCheck() {
		try {
			await record.mutateAsync({ siteId });
			await invalidateMonitoringSampleRecorded(qc, siteId);
			toast.success("Captured a fresh health snapshot.");
		} catch {
			toast.error("Couldn't run the health check. Operator role required.");
		}
	}

	return (
		<>
			<TopBar crumbs={[siteId, "Health"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<>
							<Button
								disabled={health.isFetching || record.isPending}
								onClick={handleHealthCheck}
							>
								{record.isPending ? "Checking…" : "Run health check"}
							</Button>
							<Button
								disabled={perf.isFetching}
								onClick={() => {
									if (perfEnabled) {
										perf.refetch();
									} else {
										setPerfEnabled(true);
									}
								}}
								variant="outline"
							>
								{perf.isFetching ? "Loading…" : "Perf report"}
							</Button>
						</>
					}
					subtitle="Uptime, performance and alerts for this site."
					title="Health"
				/>
				<QueryBoundary
					errorMessage="Couldn't load this site's health."
					hasData={Boolean(health.data)}
					isError={health.isError}
					isLoading={health.isLoading}
					onRetry={() => health.refetch()}
				>
					{health.data ? (
						<>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								{health.data.tiles.map((tile) => (
									<VerdictTile key={tile.key} tile={tile} />
								))}
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<Card>
									<CardHeader>
										<CardTitle className="text-sm">Status</CardTitle>
									</CardHeader>
									<CardContent className="grid gap-1 text-sm">
										<div>
											Uptime:{" "}
											<span className={uptime.className}>{uptime.label}</span>
										</div>
									</CardContent>
								</Card>
								<Card>
									<CardHeader>
										<CardTitle className="text-sm">Alerts</CardTitle>
									</CardHeader>
									<CardContent className="text-sm">
										{health.data.alertChannels.length > 0 ? (
											<ul className="flex flex-col gap-1">
												{health.data.alertChannels.map((ch) => (
													<li className="font-medium text-foreground" key={ch}>
														{ch}
													</li>
												))}
											</ul>
										) : (
											<p className="text-muted-foreground">
												No alert channels configured.
											</p>
										)}
									</CardContent>
								</Card>
							</div>
							{perfEnabled ? (
								<QueryBoundary
									errorMessage="Couldn't load the performance report."
									hasData={Boolean(perf.data)}
									isError={perf.isError}
									isLoading={perf.isLoading}
									onRetry={() => perf.refetch()}
									skeletonClassName="h-36 w-full"
								>
									{perf.data ? (
										<Card>
											<CardHeader>
												<CardTitle className="text-sm">
													Performance report
												</CardTitle>
											</CardHeader>
											<CardContent className="grid gap-1 text-sm">
												<div>TTFB: {perf.data.ttfbMs}ms</div>
												<div>Page cache hit: {perf.data.cacheHitPercent}%</div>
												<div>OPcache hit: {perf.data.opcacheHitPercent}%</div>
												<div>Redis hit: {perf.data.redisHitPercent}%</div>
											</CardContent>
										</Card>
									) : null}
								</QueryBoundary>
							) : null}
							<PerformanceAdvisorCard siteId={siteId} />
						</>
					) : null}
				</QueryBoundary>
			</div>
		</>
	);
}
