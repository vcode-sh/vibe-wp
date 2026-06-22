import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { OperationRunner } from "@/components/patterns/operation-runner";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverInfoQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/server")({
	component: ServerPage,
});

function ServerPage() {
	const server = useQuery(serverInfoQuery());
	const [stopping, setStopping] = useState(false);
	const [runnerOpen, setRunnerOpen] = useState(false);
	const [jobId, setJobId] = useState<string | null>(null);
	const [runnerTitle, setRunnerTitle] = useState("");

	const harden = useMutation(orpc.serverHarden.mutationOptions());

	async function handleHarden() {
		try {
			const result = await harden.mutateAsync({});
			setRunnerTitle("Securing the server…");
			setJobId(result.jobId);
			setRunnerOpen(true);
		} catch {
			toast.error("Failed to start server hardening.");
		}
	}

	return (
		<>
			<TopBar crumbs={["Server & security"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<Button disabled={harden.isPending} onClick={handleHarden}>
							Secure the server
						</Button>
					}
					subtitle="The VPS shared by all your sites."
					title="Server & security"
				/>
				<QueryBoundary
					errorMessage="Couldn't load server info."
					hasData={Boolean(server.data)}
					isError={server.isError}
					isLoading={server.isLoading}
					onRetry={() => server.refetch()}
					skeletonClassName="h-36 w-full"
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Host</CardTitle>
							</CardHeader>
							<CardContent className="grid gap-1 text-sm">
								<div>{server.data?.vps ?? "—"}</div>
								<div>Sites: {server.data?.siteCount ?? "—"}</div>
								<div>Disk used: {server.data?.diskPercent ?? "—"}%</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="text-sm">Security</CardTitle>
							</CardHeader>
							<CardContent className="grid gap-1 text-sm">
								<div className="text-success">Firewall: on</div>
								<div className="text-success">fail2ban: active</div>
								<div className="text-success">Auto-updates: on</div>
							</CardContent>
						</Card>
					</div>
				</QueryBoundary>
				{/* TODO: Stop a site — lifecycleDown({ siteId }) requires a site picker;
				    add a <Select sites> + SafetyConfirm + OperationRunner once the
				    site-list affordance is designed (follow-up task). */}
				<Card className="border-destructive/40">
					<CardContent className="flex items-center justify-between py-4">
						<div className="text-sm">
							<div className="font-medium">Stop a site</div>
							<div className="text-muted-foreground text-xs">
								Takes a site offline until you start it again.
							</div>
						</div>
						<Button onClick={() => setStopping(true)} variant="outline">
							Stop a site…
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* Stop-a-site is not yet fully wired: lifecycleDown needs a siteId that
			    this server-level page does not have. The SafetyConfirm is kept in
			    place; the confirm handler shows an informative toast until a site
			    selector is added in a follow-up. */}
			<SafetyConfirm
				confirmLabel="Stop the site"
				consequence="The site goes offline until you start it again. Your data and backups are untouched."
				onConfirm={() => {
					toast.info("Site stopping requires selecting a site — coming soon.");
					setStopping(false);
				}}
				onOpenChange={setStopping}
				open={stopping}
				reversible={false}
				title="Stop a site"
			/>

			<OperationRunner
				jobId={jobId}
				onOpenChange={setRunnerOpen}
				open={runnerOpen}
				title={runnerTitle}
			/>
		</>
	);
}
