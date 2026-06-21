import { Badge } from "@control-panel/ui/components/badge";
import { Button } from "@control-panel/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@control-panel/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, Plus } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { TopBar } from "@/components/top-bar";
import { relativeTime, verdictTone } from "@/data/derive";
import { serverInfoQuery, sitesQuery } from "@/data/queries";

export const Route = createFileRoute("/_auth/sites/")({
	component: SitesPage,
});

function SitesPage() {
	const sites = useQuery(sitesQuery());
	const server = useQuery(serverInfoQuery());
	const now = new Date();

	return (
		<>
			<TopBar crumbs={["Sites"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-6 p-6">
				<PageHeader
					actions={
						<>
							<Button>
								<Plus className="size-4" /> New site
							</Button>
							<Button variant="outline">
								<Database className="size-4" /> External DB &amp; Redis
							</Button>
						</>
					}
					subtitle="Every Vibe WP site on this server."
					title="Sites"
				/>

				{server.data ? (
					<Card>
						<CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
							<span className="size-2 rounded-full bg-success" />
							<span className="font-medium">{server.data.vps}</span>
							<span className="text-muted-foreground">
								{server.data.siteCount} sites · disk {server.data.diskPercent}%
								·{server.data.allHealthy ? " all healthy" : " needs attention"}
							</span>
						</CardContent>
					</Card>
				) : null}

				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{sites.data?.map((s) => (
						<Link
							key={s.id}
							params={{ siteId: s.id }}
							to="/sites/$siteId/overview"
						>
							<Card className="transition-colors hover:border-primary">
								<CardHeader>
									<CardTitle className="flex items-center justify-between">
										{s.name}
										<span
											className={`size-2 rounded-full ${verdictTone(s.status).dot}`}
										/>
									</CardTitle>
									<p className="text-muted-foreground text-xs">{s.domain}</p>
								</CardHeader>
								<CardContent className="flex flex-wrap gap-2">
									<Badge variant="outline">
										{s.hasStaging ? "prod + staging" : "prod"}
									</Badge>
									<Badge variant="outline">
										backed up {relativeTime(s.lastBackupISO, now)}
									</Badge>
								</CardContent>
							</Card>
						</Link>
					))}
				</div>
				{sites.data && sites.data.length === 0 ? (
					<div className="rounded-lg border border-border border-dashed p-10 text-center">
						<p className="font-medium">No sites yet</p>
						<p className="mt-1 text-muted-foreground text-sm">
							Create your first Vibe WP site to get started.
						</p>
						<Button className="mt-4">
							<Plus className="size-4" /> New site
						</Button>
					</div>
				) : null}
			</main>
		</>
	);
}
