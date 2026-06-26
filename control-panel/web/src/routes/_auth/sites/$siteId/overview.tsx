import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ActivityTimeline } from "@/components/patterns/activity-timeline";
import { DeveloperDetails } from "@/components/patterns/developer-details";
import { NeedsYou } from "@/components/patterns/needs-you";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { SafetyNet } from "@/components/patterns/safety-net";
import { StatusHero } from "@/components/patterns/status-hero";
import { VerdictTile } from "@/components/patterns/verdict-tile";
import { DevDetailsContent } from "@/components/sites/dev-details-content";
import { SiteControls } from "@/components/sites/site-controls";
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
	const navigate = useNavigate();
	const overview = useQuery(siteOverviewQuery(siteId));
	const updatesAvailable = useQuery(updatesAvailableQuery(siteId));
	const { start, isRunning } = useOperations();

	function goToBackups() {
		navigate({ to: "/sites/$siteId/backups", params: { siteId } });
	}

	const applyUpdates = useMutation(orpc.updatesApply.mutationOptions());
	const runBackup = useMutation(orpc.backupsRun.mutationOptions());

	const [snoozed, setSnoozed] = useState<Set<string>>(new Set());
	const needs = overview.data?.needs ?? [];
	const visibleNeeds = needs.filter((n) => !snoozed.has(n.id));
	const needsKey = needs.map((n) => n.id).join("\n");

	// A snoozed need is hidden until its underlying condition clears. Once the
	// server stops reporting that id, prune it so the same stable id can resurface
	// later. Guard the setState so we only update when something actually changes,
	// avoiding a render loop.
	useEffect(() => {
		const presentIds = new Set(needsKey ? needsKey.split("\n") : []);
		setSnoozed((prev) => {
			let changed = false;
			const next = new Set<string>();
			for (const id of prev) {
				if (presentIds.has(id)) {
					next.add(id);
				} else {
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [needsKey]);

	function handleLater(id: string) {
		setSnoozed((prev) => new Set([...prev, id]));
	}

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

	// NeedsYou routes backup/cert/disk/security needs to their own pages; only
	// the inline plugin-update action reaches this handler.
	async function handleAct(item: NeedItem) {
		if (item.icon === "update") {
			await handleApplyUpdates("plugins");
		} else {
			goToBackups();
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
								calm={visibleNeeds.length === 0}
								headline={overview.data.headline}
								status={overview.data.status}
								subline={overview.data.subline}
							/>
							<NeedsYou
								items={visibleNeeds}
								onAct={handleAct}
								onLater={handleLater}
								siteId={siteId}
							/>
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
							<SiteControls siteId={siteId} />
							<div className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
								<div className="grid grid-cols-2 gap-3 self-start sm:grid-cols-2">
									{overview.data.tiles.map((tile) => (
										<VerdictTile key={tile.key} tile={tile} />
									))}
								</div>
								<SafetyNet
									onBackup={handleBackup}
									onRestore={goToBackups}
									safety={overview.data.safety}
								/>
							</div>
							<ActivityTimeline entries={overview.data.activity} />
							<DeveloperDetails>
								<DevDetailsContent siteId={siteId} />
							</DeveloperDetails>
						</>
					) : null}
				</QueryBoundary>
			</div>
		</>
	);
}
