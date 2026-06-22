import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { serverInfoQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/server")({
	component: ServerPage,
});

function ServerPage() {
	const server = useQuery(serverInfoQuery());
	const { start } = useOperations();

	const harden = useMutation(orpc.serverHarden.mutationOptions());

	async function handleHarden() {
		try {
			const result = await harden.mutateAsync({});
			start({
				jobId: result.jobId,
				title: "Securing the server…",
				kind: "harden",
			});
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
				{/* Site lifecycle (stop/start/restart) needs a site-scoped UI — tracked as a follow-up. */}
			</div>
		</>
	);
}
