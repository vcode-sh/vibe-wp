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
import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, Plus } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { TopBar } from "@/components/top-bar";
import { relativeTime, verdictTone } from "@/data/derive";
import { serverInfoQuery, sitesQuery } from "@/data/queries";
import type { ServerInfo, SiteSummary } from "@/data/types";

export const Route = createFileRoute("/_auth/sites/")({
	component: SitesPage,
});

function ErrorBanner({
	message,
	onRetry,
}: {
	message: string;
	onRetry: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 p-4 text-sm">
			<p className="font-medium">{message}</p>
			<Button onClick={onRetry} size="sm" variant="outline">
				Try again
			</Button>
		</div>
	);
}

function ServerStatus({
	isError,
	isLoading,
	data,
	onRetry,
}: {
	isError: boolean;
	isLoading: boolean;
	data: ServerInfo | undefined;
	onRetry: () => void;
}) {
	if (isLoading) {
		return <Skeleton className="h-14 w-full" />;
	}
	if (isError) {
		return (
			<ErrorBanner
				message="Couldn't load the server status."
				onRetry={onRetry}
			/>
		);
	}
	if (!data) {
		return null;
	}
	return (
		<Card>
			<CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
				<span className="size-2 rounded-full bg-success" />
				<span className="font-medium">{data.vps}</span>
				<span className="text-muted-foreground">
					{data.siteCount} sites · disk {data.diskPercent}%·
					{data.allHealthy ? " all healthy" : " needs attention"}
				</span>
			</CardContent>
		</Card>
	);
}

function SiteGrid({
	isError,
	isLoading,
	sites,
	now,
	onRetry,
}: {
	isError: boolean;
	isLoading: boolean;
	sites: SiteSummary[] | undefined;
	now: Date;
	onRetry: () => void;
}) {
	if (isError) {
		return (
			<ErrorBanner message="Couldn't load your sites." onRetry={onRetry} />
		);
	}
	if (isLoading) {
		return (
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 3 }).map((_, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders
					<Skeleton className="h-32 w-full" key={i} />
				))}
			</div>
		);
	}
	if (sites && sites.length === 0) {
		return (
			<div className="rounded-lg border border-border border-dashed p-10 text-center">
				<p className="font-medium">No sites yet</p>
				<p className="mt-1 text-muted-foreground text-sm">
					Create your first Vibe WP site to get started.
				</p>
				<Button className="mt-4">
					<Plus className="size-4" /> New site
				</Button>
			</div>
		);
	}
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{sites?.map((s) => (
				<Link
					className="group rounded-none focus-visible:outline-none"
					key={s.id}
					params={{ siteId: s.id }}
					to="/sites/$siteId/overview"
				>
					<Card className="transition-colors hover:border-primary group-focus-visible:border-primary">
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
	);
}

function SitesPage() {
	const sites = useQuery(sitesQuery());
	const server = useQuery(serverInfoQuery());
	const now = new Date();

	return (
		<>
			<TopBar crumbs={["Sites"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
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

				<ServerStatus
					data={server.data}
					isError={server.isError}
					isLoading={server.isLoading}
					onRetry={() => server.refetch()}
				/>

				<SiteGrid
					isError={sites.isError}
					isLoading={sites.isLoading}
					now={now}
					onRetry={() => sites.refetch()}
					sites={sites.data}
				/>
			</div>
		</>
	);
}
