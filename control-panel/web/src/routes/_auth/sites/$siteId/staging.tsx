import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { StagingDialog } from "@/components/provisioning/staging-dialog";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sitesQuery, stagingQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/sites/$siteId/staging")({
	component: StagingPage,
});

/** Empty state: no staging copy exists yet — explain what staging is for. */
function NoStagingCard({ onAdd }: { onAdd: () => void }) {
	return (
		<Card>
			<CardContent className="flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
				<div className="grid gap-1">
					<span className="font-medium text-sm">No staging site yet</span>
					<span className="max-w-prose text-muted-foreground text-sm">
						Staging is a private, search-engine-hidden copy of this site. Add
						one to test plugin updates, theme changes, or content before they go
						live — without any risk to visitors.
					</span>
				</div>
				<Button onClick={onAdd}>Add staging</Button>
			</CardContent>
		</Card>
	);
}

/** One direction of the live<->staging sync, with plain-language help + action. */
function SyncAction({
	icon,
	title,
	description,
	buttonLabel,
	pendingLabel,
	pending,
	onClick,
	variant,
	footer,
}: {
	icon: ReactNode;
	title: string;
	description: string;
	buttonLabel: string;
	pendingLabel: string;
	pending: boolean;
	onClick: () => void;
	variant?: "default" | "outline";
	footer?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
			<div className="flex items-start gap-3">
				<span aria-hidden className="mt-0.5 text-muted-foreground">
					{icon}
				</span>
				<div className="grid gap-1">
					<span className="font-medium text-sm">{title}</span>
					<span className="text-muted-foreground text-sm">{description}</span>
				</div>
			</div>
			{footer}
			<Button
				className="self-start"
				disabled={pending}
				onClick={onClick}
				variant={variant}
			>
				{pending ? pendingLabel : buttonLabel}
			</Button>
		</div>
	);
}

function StagingCard({
	url,
	noindex,
	onRefresh,
	onPublish,
	onAdd,
	refreshPending,
	publishPending,
}: {
	url: string | null;
	noindex: boolean;
	onRefresh: () => void;
	onPublish: () => void;
	onAdd: () => void;
	refreshPending: boolean;
	publishPending: boolean;
}) {
	if (!url) {
		return <NoStagingCard onAdd={onAdd} />;
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					{url}
					{noindex ? <Badge variant="outline">noindex</Badge> : null}
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3 sm:grid-cols-2">
				<SyncAction
					buttonLabel="Copy live to staging"
					description="Overwrite staging with a fresh copy of the live site's database and files, so you're testing against what visitors see right now."
					icon={<ArrowDownToLine className="size-5" />}
					onClick={onRefresh}
					pending={refreshPending}
					pendingLabel="Copying…"
					title="Refresh staging from live"
				/>
				<SyncAction
					buttonLabel="Publish staging to live"
					description="Push the staging plugins, themes, and content over to the live site, replacing it with what you've tested."
					footer={
						<p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
							<ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
							<span>
								Safe by default: we back up the live site first and
								automatically roll it back if it fails its health check after
								publishing.
							</span>
						</p>
					}
					icon={<ArrowUpFromLine className="size-5" />}
					onClick={onPublish}
					pending={publishPending}
					pendingLabel="Publishing…"
					title="Publish staging to live"
					variant="outline"
				/>
			</CardContent>
		</Card>
	);
}

function StagingPage() {
	const { siteId } = Route.useParams();
	const staging = useQuery(stagingQuery(siteId));
	const sites = useQuery(sitesQuery());
	const productionDomain = sites.data?.find((s) => s.id === siteId)?.domain;
	const [publishing, setPublishing] = useState(false);
	const [adding, setAdding] = useState(false);
	const { start, isRunning } = useOperations();

	const refresh = useMutation(orpc.stagingRefresh.mutationOptions());
	// The UI drives the SAFE push-to-live path (backup -> promote -> health check
	// -> auto-rollback on failure). The legacy stagingPromote procedure stays in
	// the router for back-compat but is no longer reachable from this screen.
	const pushToLive = useMutation(orpc.stagingPushToLive.mutationOptions());

	async function handleRefresh() {
		try {
			const result = await refresh.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: "Copying live to staging…",
				kind: "refresh",
				siteId,
			});
		} catch {
			toast.error("Failed to start staging refresh.");
		}
	}

	async function handlePushToLive() {
		try {
			const result = await pushToLive.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: "Publishing staging to live…",
				kind: "stagingPushToLive",
				siteId,
			});
			setPublishing(false);
		} catch {
			toast.error("Failed to start push to live.");
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
							onAdd={() => setAdding(true)}
							onPublish={() => setPublishing(true)}
							onRefresh={handleRefresh}
							publishPending={
								pushToLive.isPending || isRunning(siteId, "stagingPushToLive")
							}
							refreshPending={refresh.isPending || isRunning(siteId, "refresh")}
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

			<SafetyConfirm
				confirmLabel="Publish to live"
				consequence="This copies your staging files over the live site, replacing it. We back up live first and automatically roll back to that backup if the site fails its health check."
				onConfirm={handlePushToLive}
				onOpenChange={setPublishing}
				open={publishing}
				reversible={false}
				title="Publish staging to live"
			/>
		</>
	);
}
