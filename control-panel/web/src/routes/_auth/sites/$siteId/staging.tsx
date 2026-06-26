import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { StagingDialog } from "@/components/provisioning/staging-dialog";
import { StagingSyncCard } from "@/components/staging/staging-sync-card";
import { TopBar } from "@/components/top-bar";
import { sitesQuery, stagingQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/sites/$siteId/staging")({
	component: StagingPage,
});

function StagingPage() {
	const { siteId } = Route.useParams();
	const staging = useQuery(stagingQuery(siteId));
	const sites = useQuery(sitesQuery());
	const productionDomain = sites.data?.find((s) => s.id === siteId)?.domain;
	const [adding, setAdding] = useState(false);

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
						<StagingSyncCard
							noindex={staging.data.present ? staging.data.noindex : false}
							onAdd={() => setAdding(true)}
							siteId={siteId}
							url={staging.data.present ? staging.data.url : null}
						/>
					) : null}
				</QueryBoundary>
			</div>

			<StagingDialog
				onOpenChange={setAdding}
				open={adding}
				productionDomain={productionDomain}
				siteId={siteId}
			/>
		</>
	);
}
