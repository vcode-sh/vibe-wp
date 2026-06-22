import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { securityStatusQuery, serverInfoQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/server")({
	component: ServerPage,
});

function SecurityRow({ label, active }: { label: string; active: boolean }) {
	return (
		<div className={active ? "text-success" : "text-warning"}>
			{label}: {active ? "on" : "off"}
		</div>
	);
}

function ServerPage() {
	const server = useQuery(serverInfoQuery());
	const security = useQuery(securityStatusQuery());
	const { start, isRunning } = useOperations();

	const harden = useMutation(orpc.serverHarden.mutationOptions());

	async function handleHarden() {
		try {
			const result = await harden.mutateAsync({});
			start({
				jobId: result.jobId,
				title: "Securing the server…",
				kind: "harden",
				siteId: "server",
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
						<Button
							disabled={harden.isPending || isRunning("server", "harden")}
							onClick={handleHarden}
						>
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
							<CardContent>
								<QueryBoundary
									errorMessage="Couldn't load security status."
									hasData={Boolean(security.data)}
									isError={security.isError}
									isLoading={security.isLoading}
									onRetry={() => security.refetch()}
									skeletonClassName="h-16 w-full"
								>
									{security.data ? (
										<div className="grid gap-1 text-sm">
											<SecurityRow
												active={security.data.firewall}
												label="Firewall"
											/>
											<SecurityRow
												active={security.data.fail2ban}
												label="fail2ban"
											/>
											<SecurityRow
												active={security.data.autoUpdates}
												label="Auto-updates"
											/>
										</div>
									) : null}
								</QueryBoundary>
							</CardContent>
						</Card>
					</div>
				</QueryBoundary>
				{/* Site lifecycle (stop/start/restart) needs a site-scoped UI — tracked as a follow-up. */}
			</div>
		</>
	);
}
