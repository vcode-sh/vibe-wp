import { Badge } from "@control-panel/ui/components/badge";
import { ScrollArea } from "@control-panel/ui/components/scroll-area";
import { Skeleton } from "@control-panel/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@control-panel/ui/components/tabs";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/patterns/page-header";
import { TopBar } from "@/components/top-bar";
import { logsQuery } from "@/data/queries";
import type { LogLine } from "@/data/types";

export const Route = createFileRoute("/_auth/sites/$siteId/logs")({
	component: LogsPage,
});

const SOURCES = ["all", "nginx", "php", "wp"] as const;

function LogsPage() {
	const { siteId } = Route.useParams();
	const logs = useQuery(logsQuery(siteId));
	const [source, setSource] = useState<(typeof SOURCES)[number]>("all");

	const filtered: LogLine[] =
		logs.data?.filter((l) => source === "all" || l.source === source) ?? [];

	return (
		<>
			<TopBar crumbs={[siteId, "Logs"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="Live tail across nginx, PHP-FPM and WordPress. Secrets redacted."
					title="Logs"
				/>
				<Tabs
					onValueChange={(v) => setSource(v as typeof source)}
					value={source}
				>
					<TabsList>
						{SOURCES.map((s) => (
							<TabsTrigger key={s} value={s}>
								{s}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
				{logs.isLoading ? (
					<Skeleton className="h-64 w-full" />
				) : (
					<ScrollArea className="h-64 rounded-md border border-border bg-background p-3 font-mono text-xs">
						{filtered.map((l) => (
							<div className="flex gap-3" key={l.id}>
								<span className="text-muted-foreground">{l.ts}</span>
								<Badge className="h-4" variant="outline">
									{l.source}
								</Badge>
								<span>{l.text}</span>
							</div>
						))}
					</ScrollArea>
				)}
			</main>
		</>
	);
}
