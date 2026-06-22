import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Radio } from "lucide-react";
import { useState } from "react";
import { LiveLogTail } from "@/components/patterns/live-log-tail";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { logsQuery } from "@/data/queries";
import type { LogLine } from "@/data/types";

export const Route = createFileRoute("/_auth/sites/$siteId/logs")({
	component: LogsPage,
});

const SOURCES = ["all", "nginx", "php", "wp"] as const;

function RecentLogs({ siteId }: { siteId: string }) {
	const logs = useQuery(logsQuery(siteId));
	const [source, setSource] = useState<(typeof SOURCES)[number]>("all");
	const filtered: LogLine[] =
		logs.data?.filter((l) => source === "all" || l.source === source) ?? [];

	return (
		<QueryBoundary
			errorMessage="Couldn't load the logs."
			hasData={Boolean(logs.data)}
			isError={logs.isError}
			isLoading={logs.isLoading}
			onRetry={() => logs.refetch()}
			skeletonClassName="h-64 w-full"
		>
			<Tabs onValueChange={(v) => setSource(v as typeof source)} value={source}>
				<TabsList>
					{SOURCES.map((s) => (
						<TabsTrigger key={s} value={s}>
							{s}
						</TabsTrigger>
					))}
				</TabsList>
				<TabsContent value={source}>
					{filtered.length === 0 ? (
						<div className="py-8 text-center text-muted-foreground text-xs">
							No log entries for this source.
						</div>
					) : (
						<ScrollArea className="h-64 rounded-md border border-border bg-background p-3 font-mono text-xs">
							{filtered.map((l) => (
								<div className="flex gap-3" key={l.id}>
									<span className="text-muted-foreground">
										{l.whenISO.slice(11, 19)}
									</span>
									<Badge className="h-4" variant="outline">
										{l.source}
									</Badge>
									<span>{l.text}</span>
								</div>
							))}
						</ScrollArea>
					)}
				</TabsContent>
			</Tabs>
		</QueryBoundary>
	);
}

function LogsPage() {
	const { siteId } = Route.useParams();
	const [tailing, setTailing] = useState(false);

	return (
		<>
			<TopBar crumbs={[siteId, "Logs"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<Button
							onClick={() => setTailing((v) => !v)}
							variant={tailing ? "default" : "outline"}
						>
							<Radio aria-hidden className="size-4" />
							{tailing ? "Live (stop)" : "Go live"}
						</Button>
					}
					subtitle="Recent logs, or a live tail across nginx, PHP-FPM and WordPress. Secrets redacted."
					title="Logs"
				/>
				{tailing ? (
					<LiveLogTail active={tailing} siteId={siteId} />
				) : (
					<RecentLogs siteId={siteId} />
				)}
			</div>
		</>
	);
}
