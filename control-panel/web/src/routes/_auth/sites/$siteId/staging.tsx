import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stagingQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/sites/$siteId/staging")({
	component: StagingPage,
});

function StagingCard({
	url,
	noindex,
	onRefresh,
	onPublish,
	refreshPending,
}: {
	url: string | null;
	noindex: boolean;
	onRefresh: () => void;
	onPublish: () => void;
	refreshPending: boolean;
}) {
	if (!url) {
		return (
			<Card>
				<CardContent className="flex items-center justify-between py-6">
					<span className="text-muted-foreground text-sm">
						No staging site yet.
					</span>
					<Button
						onClick={() => toast.info("Adding staging isn't available yet.")}
					>
						Add staging
					</Button>
				</CardContent>
			</Card>
		);
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					{url}
					{noindex ? <Badge variant="outline">noindex</Badge> : null}
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-wrap gap-2">
				<Button disabled={refreshPending} onClick={onRefresh}>
					Copy live to staging
				</Button>
				<Button onClick={onPublish} variant="outline">
					Publish staging to live
				</Button>
			</CardContent>
		</Card>
	);
}

function StagingPage() {
	const { siteId } = Route.useParams();
	const staging = useQuery(stagingQuery(siteId));
	const [publishing, setPublishing] = useState(false);
	const { start } = useOperations();

	const refresh = useMutation(orpc.stagingRefresh.mutationOptions());
	const promote = useMutation(orpc.stagingPromote.mutationOptions());

	async function handleRefresh() {
		try {
			const result = await refresh.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: "Copying live to staging…",
				kind: "refresh",
			});
		} catch {
			toast.error("Failed to start staging refresh.");
		}
	}

	async function handlePromote() {
		try {
			const result = await promote.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: "Publishing staging to live…",
				kind: "promote",
			});
			setPublishing(false);
		} catch {
			toast.error("Failed to start promote.");
		}
	}

	return (
		<>
			<TopBar crumbs={[siteId, "Staging"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="A safe copy of your live site to try changes first."
					title="Staging"
				/>
				<QueryBoundary
					errorMessage="Couldn't load the staging status."
					hasData={Boolean(staging.data)}
					isError={staging.isError}
					isLoading={staging.isLoading}
					onRetry={() => staging.refetch()}
					skeletonClassName="h-32 w-full"
				>
					{staging.data ? (
						<StagingCard
							noindex={staging.data.present ? staging.data.noindex : false}
							onPublish={() => setPublishing(true)}
							onRefresh={handleRefresh}
							refreshPending={refresh.isPending}
							url={staging.data.present ? staging.data.url : null}
						/>
					) : null}
				</QueryBoundary>
			</div>

			<SafetyConfirm
				confirmLabel="Publish to live"
				consequence="This copies your staging files over the live site. Your live site will be replaced. We back up live first."
				onConfirm={handlePromote}
				onOpenChange={setPublishing}
				open={publishing}
				reversible={false}
				title="Publish staging to live"
			/>
		</>
	);
}
