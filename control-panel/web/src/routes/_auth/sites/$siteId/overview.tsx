import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActivityTimeline } from "@/components/patterns/activity-timeline";
import { DeveloperDetails } from "@/components/patterns/developer-details";
import { NeedsYou } from "@/components/patterns/needs-you";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { SafetyNet } from "@/components/patterns/safety-net";
import { StatusHero } from "@/components/patterns/status-hero";
import { VerdictTile } from "@/components/patterns/verdict-tile";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { siteOverviewQuery, updatesAvailableQuery } from "@/data/queries";
import type { NeedItem } from "@/data/types";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/sites/$siteId/overview")({
	component: OverviewPage,
});

function OverviewPage() {
	const { siteId } = Route.useParams();
	const overview = useQuery(siteOverviewQuery(siteId));
	const updatesAvailable = useQuery(updatesAvailableQuery(siteId));
	const { start, isRunning } = useOperations();

	const applyUpdates = useMutation(orpc.updatesApply.mutationOptions());
	const runBackup = useMutation(orpc.backupsRun.mutationOptions());

	async function handleApplyUpdates(what: "core" | "plugins" = "core") {
		try {
			const result = await applyUpdates.mutateAsync({ siteId, what });
			start({
				jobId: result.jobId,
				title: "Running updates…",
				kind: "wpUpdate",
				siteId,
			});
		} catch {
			toast.error("Failed to start updates.");
		}
	}

	async function handleBackup() {
		try {
			const result = await runBackup.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: "Backing up…",
				kind: "backup",
				siteId,
			});
		} catch {
			toast.error("Failed to start backup.");
		}
	}

	async function handleAct(item: NeedItem) {
		if (item.icon === "update") {
			await handleApplyUpdates("plugins");
		} else {
			toast.info(`${item.actionLabel} isn't available yet.`);
		}
	}

	const pluginCount = updatesAvailable.data?.plugins ?? 0;

	return (
		<>
			<TopBar crumbs={[siteId, "Overview"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<QueryBoundary
					errorMessage="Couldn't load this site."
					hasData={Boolean(overview.data)}
					isError={overview.isError}
					isLoading={overview.isLoading}
					onRetry={() => overview.refetch()}
				>
					{overview.data ? (
						<>
							<StatusHero
								calm={overview.data.needs.length === 0}
								headline={overview.data.headline}
								status={overview.data.status}
								subline={overview.data.subline}
							/>
							<NeedsYou items={overview.data.needs} onAct={handleAct} />
							{pluginCount > 0 ? (
								<div className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3 text-sm">
									<span className="text-muted-foreground">
										{pluginCount} plugin update{pluginCount === 1 ? "" : "s"}{" "}
										available
									</span>
									<Button
										disabled={
											applyUpdates.isPending || isRunning(siteId, "wpUpdate")
										}
										onClick={() => handleApplyUpdates("plugins")}
										size="sm"
										variant="outline"
									>
										Run updates
									</Button>
								</div>
							) : null}
							<div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
								<div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-2">
									{overview.data.tiles.map((tile) => (
										<VerdictTile key={tile.key} tile={tile} />
									))}
								</div>
								<SafetyNet
									onBackup={handleBackup}
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
					) : null}
				</QueryBoundary>
			</div>
		</>
	);
}
