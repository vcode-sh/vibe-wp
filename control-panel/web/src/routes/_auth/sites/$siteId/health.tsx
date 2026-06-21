import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { VerdictTile } from "@/components/patterns/verdict-tile";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<>
							<Button
								onClick={() => toast.success("Health check: running (mock)…")}
							>
								Run health check
							</Button>
							<Button
								onClick={() => toast.success("Perf report: running (mock)…")}
								variant="outline"
							>
								Perf report
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
					) : null}
				</QueryBoundary>
			</div>
		</>
	);
}
