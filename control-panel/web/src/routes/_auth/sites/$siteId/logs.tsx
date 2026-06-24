import {
	NativeSelect,
	NativeSelectOption,
} from "@control-panel/ui/components/native-select";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Radio } from "lucide-react";
import { useState } from "react";
import { LiveLogTail } from "@/components/patterns/live-log-tail";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { logsQuery } from "@/data/queries";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/sites/$siteId/logs")({
	component: LogsPage,
});

const SOURCES = [
	"all",
	"nginx",
	"php",
	"wp",
	"mariadb",
	"redis",
	"access",
] as const;
const TAILS = ["100", "500", "2000"] as const;
const SENSITIVE = new Set(["access", "mariadb"]);

type Source = (typeof SOURCES)[number];
type Tail = (typeof TAILS)[number];

const SEVERITY_CLASS: Record<string, string> = {
	error: "text-destructive",
	warn: "text-amber-500",
	debug: "text-muted-foreground/60",
	info: "",
};
const CACHE_CLASS: Record<string, string> = {
	HIT: "text-emerald-500",
	MISS: "text-destructive",
};

async function downloadLogs(
	siteId: string,
	service: Source,
	filter: string
): Promise<void> {
	const res = await client.logsExport({
		siteId,
		service,
		...(filter ? { filter } : {}),
	});
	const body = res.lines
		.map((l) => `${l.whenISO}\t${l.source}\t${l.text}`)
		.join("\n");
	const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = res.filename;
	a.click();
	URL.revokeObjectURL(url);
}

function RecentLogs({
	siteId,
	source,
	tail,
	filter,
}: {
	siteId: string;
	source: Source;
	tail: Tail;
	filter: string;
}) {
	const logs = useQuery(logsQuery(siteId, { service: source, tail, filter }));
	const lines = logs.data ?? [];

	return (
		<QueryBoundary
			errorMessage="Couldn't load the logs."
			hasData={Boolean(logs.data)}
			isError={logs.isError}
			isLoading={logs.isLoading}
			onRetry={() => logs.refetch()}
			skeletonClassName="h-64 w-full"
		>
			<TabsContent value={source}>
				{lines.length === 0 ? (
					<div className="py-8 text-center text-muted-foreground text-xs">
						No log entries for this source.
					</div>
				) : (
					<ScrollArea className="h-64 rounded-md border border-border bg-background p-3 font-mono text-xs">
						{lines.map((l) => (
							<div className="flex gap-3" key={l.id}>
								<span className="text-muted-foreground">
									{l.whenISO.slice(11, 19)}
								</span>
								<Badge className="h-4" variant="outline">
									{l.source}
								</Badge>
								{l.cache ? (
									<Badge
										className={`h-4 ${CACHE_CLASS[l.cache] ?? ""}`}
										variant="outline"
									>
										cache:{l.cache}
									</Badge>
								) : null}
								<span className={SEVERITY_CLASS[l.severity ?? "info"]}>
									{l.text}
								</span>
							</div>
						))}
					</ScrollArea>
				)}
			</TabsContent>
		</QueryBoundary>
	);
}

function LogsPage() {
	const { siteId } = Route.useParams();
	const [tailing, setTailing] = useState(false);
	const [source, setSource] = useState<Source>("all");
	const [tail, setTail] = useState<Tail>("500");
	const [filter, setFilter] = useState("");

	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";

	const visibleSources = SOURCES.filter((s) => isAdmin || !SENSITIVE.has(s));

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
				<Tabs onValueChange={(v) => setSource(v as Source)} value={source}>
					<div className="flex flex-wrap items-center gap-2">
						<TabsList>
							{visibleSources.map((s) => (
								<TabsTrigger key={s} value={s}>
									{s}
								</TabsTrigger>
							))}
						</TabsList>
						<NativeSelect
							className="w-24"
							onChange={(e) => setTail(e.target.value as Tail)}
							value={tail}
						>
							{TAILS.map((t) => (
								<NativeSelectOption key={t} value={t}>
									{t} lines
								</NativeSelectOption>
							))}
						</NativeSelect>
						<Input
							className="w-48"
							onChange={(e) => setFilter(e.target.value)}
							placeholder="Filter…"
							value={filter}
						/>
						{isAdmin ? (
							<Button
								onClick={() => downloadLogs(siteId, source, filter)}
								size="sm"
								variant="outline"
							>
								<Download aria-hidden className="size-4" />
								Download
							</Button>
						) : null}
					</div>
					{tailing ? (
						<LiveLogTail
							active={tailing}
							filter={filter || undefined}
							service={source}
							siteId={siteId}
						/>
					) : (
						<RecentLogs
							filter={filter}
							siteId={siteId}
							source={source}
							tail={tail}
						/>
					)}
				</Tabs>
			</div>
		</>
	);
}
