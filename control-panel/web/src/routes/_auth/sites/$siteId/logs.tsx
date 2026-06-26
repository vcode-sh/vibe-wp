import {
	NativeSelect,
	NativeSelectOption,
} from "@control-panel/ui/components/native-select";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Radio } from "lucide-react";
import { useState } from "react";
import {
	LOG_CACHE_FILTERS,
	LOG_FILTER_MODES,
	LOG_SENSITIVE_SOURCES,
	LOG_SEVERITIES,
	LOG_SOURCES,
	LOG_TAILS,
	type LogCacheFilter,
	type LogFilterMode,
	type LogSeverity,
	type LogSource,
	type LogTail,
} from "@/components/logs/log-options";
import { RecentLogs } from "@/components/logs/recent-log-list";
import { LiveLogTail } from "@/components/patterns/live-log-tail";
import { PageHeader } from "@/components/patterns/page-header";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/sites/$siteId/logs")({
	component: LogsPage,
});

async function downloadLogs(input: {
	cache: LogCacheFilter;
	filter: string;
	filterMode: LogFilterMode;
	service: LogSource;
	severity: LogSeverity;
	siteId: string;
	tail: LogTail;
}): Promise<void> {
	const res = await client.logsExport({
		siteId: input.siteId,
		service: input.service,
		tail: input.tail,
		filterMode: input.filterMode,
		severity: input.severity,
		cache: input.cache,
		...(input.filter ? { filter: input.filter } : {}),
	});
	const body = [
		"time\tsource\tseverity\tcache\ttext",
		...res.lines.map(
			(l) =>
				`${l.whenISO}\t${l.source}\t${l.severity ?? "info"}\t${l.cache ?? ""}\t${l.text}`
		),
	].join("\n");
	const url = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
	const a = document.createElement("a");
	a.href = url;
	a.download = res.filename;
	a.click();
	URL.revokeObjectURL(url);
}

function LogsPage() {
	const { siteId } = Route.useParams();
	const [tailing, setTailing] = useState(false);
	const [source, setSource] = useState<LogSource>("all");
	const [tail, setTail] = useState<LogTail>("500");
	const [filter, setFilter] = useState("");
	const [filterMode, setFilterMode] = useState<LogFilterMode>("text");
	const [severity, setSeverity] = useState<LogSeverity>("all");
	const [cache, setCache] = useState<LogCacheFilter>("all");

	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";
	const visibleSources = LOG_SOURCES.filter(
		(s) => isAdmin || !LOG_SENSITIVE_SOURCES.has(s)
	);

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
				<Tabs onValueChange={(v) => setSource(v as LogSource)} value={source}>
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
							onChange={(e) => setTail(e.target.value as LogTail)}
							value={tail}
						>
							{LOG_TAILS.map((t) => (
								<NativeSelectOption key={t} value={t}>
									{t} lines
								</NativeSelectOption>
							))}
						</NativeSelect>
						<Input
							className="w-48"
							onChange={(e) => setFilter(e.target.value)}
							placeholder="Filter..."
							value={filter}
						/>
						<NativeSelect
							aria-label="Filter mode"
							className="w-24"
							onChange={(e) => setFilterMode(e.target.value as LogFilterMode)}
							value={filterMode}
						>
							{LOG_FILTER_MODES.map((mode) => (
								<NativeSelectOption key={mode} value={mode}>
									{mode}
								</NativeSelectOption>
							))}
						</NativeSelect>
						<NativeSelect
							aria-label="Severity"
							className="w-28"
							onChange={(e) => setSeverity(e.target.value as LogSeverity)}
							value={severity}
						>
							{LOG_SEVERITIES.map((s) => (
								<NativeSelectOption key={s} value={s}>
									{s}
								</NativeSelectOption>
							))}
						</NativeSelect>
						<NativeSelect
							aria-label="Cache"
							className="w-32"
							onChange={(e) => setCache(e.target.value as LogCacheFilter)}
							value={cache}
						>
							{LOG_CACHE_FILTERS.map((c) => (
								<NativeSelectOption key={c} value={c}>
									{c === "all" ? "all cache" : c}
								</NativeSelectOption>
							))}
						</NativeSelect>
						{isAdmin ? (
							<Button
								onClick={() =>
									downloadLogs({
										siteId,
										service: source,
										tail,
										filter,
										filterMode,
										severity,
										cache,
									})
								}
								size="sm"
								variant="outline"
							>
								<Download aria-hidden className="size-4" />
								Download
							</Button>
						) : null}
					</div>
					<TabsContent value={source}>
						{tailing ? (
							<LiveLogTail
								active={tailing}
								cache={cache}
								filter={filter || undefined}
								filterMode={filterMode}
								service={source}
								severity={severity}
								siteId={siteId}
							/>
						) : (
							<RecentLogs
								cache={cache}
								filter={filter}
								filterMode={filterMode}
								severity={severity}
								siteId={siteId}
								source={source}
								tail={tail}
							/>
						)}
					</TabsContent>
				</Tabs>
			</div>
		</>
	);
}
