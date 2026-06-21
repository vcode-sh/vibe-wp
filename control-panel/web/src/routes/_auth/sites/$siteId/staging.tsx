import { Badge } from "@control-panel/ui/components/badge";
import { Button } from "@control-panel/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@control-panel/ui/components/card";
import { Skeleton } from "@control-panel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { TopBar } from "@/components/top-bar";
import { stagingQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/sites/$siteId/staging")({
	component: StagingPage,
});

function StagingCard({
	url,
	noindex,
	onPublish,
}: {
	url: string | null;
	noindex: boolean;
	onPublish: () => void;
}) {
	if (!url) {
		return (
			<Card>
				<CardContent className="flex items-center justify-between py-6">
					<span className="text-muted-foreground text-sm">
						No staging site yet.
					</span>
					<Button onClick={() => toast.success("Add staging (mock)…")}>
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
				<Button onClick={() => toast.success("Copy live → staging (mock)…")}>
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

	return (
		<>
			<TopBar crumbs={[siteId, "Staging"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="A safe copy of your live site to try changes first."
					title="Staging"
				/>
				{staging.isLoading || !staging.data ? (
					<Skeleton className="h-32 w-full" />
				) : (
					<StagingCard
						noindex={staging.data.noindex}
						onPublish={() => setPublishing(true)}
						url={staging.data.present ? staging.data.url : null}
					/>
				)}
			</main>

			<SafetyConfirm
				confirmLabel="Publish to live"
				consequence="This copies your staging files over the live site. We back up live first."
				onConfirm={() => {
					toast.success("Publishing to live (mock)…");
					setPublishing(false);
				}}
				onOpenChange={setPublishing}
				open={publishing}
				reversible
				title="Publish staging to live"
			/>
		</>
	);
}
