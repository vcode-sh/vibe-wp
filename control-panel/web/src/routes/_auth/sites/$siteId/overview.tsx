import { Skeleton } from "@control-panel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActivityTimeline } from "@/components/patterns/activity-timeline";
import { DeveloperDetails } from "@/components/patterns/developer-details";
import { NeedsYou } from "@/components/patterns/needs-you";
import { SafetyNet } from "@/components/patterns/safety-net";
import { StatusHero } from "@/components/patterns/status-hero";
import { VerdictTile } from "@/components/patterns/verdict-tile";
import { TopBar } from "@/components/top-bar";
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
