import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@control-panel/ui/components/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { RowActions } from "@/components/plugins/inventory-actions";
import {
	AutoUpdateScheduleCard,
	BulkUpdateBar,
	CoreUpdateCard,
} from "@/components/plugins/inventory-cards";
import { SecurityRadarCard } from "@/components/security/security-radar-card";
import { SecurityScoreCard } from "@/components/security/security-score-card";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/data/derive";
import { inventoryQuery } from "@/data/queries";
import type { InsightsPlugin, InsightsTheme, SiteInsights } from "@/data/types";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/sites/$siteId/inventory")({
	component: InventoryPage,
});

function autoUpdateLabel(v: boolean | null): string {
	if (v === true) {
		return "on";
	}
	if (v === false) {
		return "off";
	}
	return "—";
}

function humanizeBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (bytes < 1024 * 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function minutesAgo(iso: string, now: Date): number {
	return Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
}

function RefreshButton({
	siteId,
	disabled,
}: {
	siteId: string;
	disabled?: boolean;
}) {
	const qc = useQueryClient();
	const refresh = useMutation(orpc.refreshInventory.mutationOptions());

	async function handleRefresh() {
		try {
			await refresh.mutateAsync({ siteId });
			setTimeout(() => {
				qc.invalidateQueries(inventoryQuery(siteId));
			}, 2000);
		} catch {
			toast.error("Failed to refresh inventory.");
		}
	}

	return (
		<Button
			disabled={disabled || refresh.isPending}
			onClick={handleRefresh}
			variant="outline"
		>
			{refresh.isPending ? "Refreshing…" : "Refresh now"}
		</Button>
	);
}

function PluginTable({
	plugins,
	siteId,
}: {
	plugins: InsightsPlugin[];
	siteId: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Plugins ({plugins.length})</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Version</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Auto-update</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{plugins.map((p) => (
							<TableRow key={p.slug}>
								<TableCell className="font-medium">{p.name}</TableCell>
								<TableCell>
									{p.version}
									{p.update_available && p.new_version ? (
										<span className="ml-2 text-amber-500 text-xs">
											→ {p.new_version}
										</span>
									) : null}
								</TableCell>
								<TableCell>
									<Badge
										variant={p.status === "active" ? "default" : "outline"}
									>
										{p.status}
									</Badge>
								</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{autoUpdateLabel(p.auto_update)}
								</TableCell>
								<TableCell className="text-right">
									<RowActions kind="plugin" row={p} siteId={siteId} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

function ThemeTable({
	themes,
	siteId,
}: {
	themes: InsightsTheme[];
	siteId: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Themes ({themes.length})</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Version</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Auto-update</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{themes.map((t) => (
							<TableRow key={t.slug}>
								<TableCell className="font-medium">{t.name}</TableCell>
								<TableCell>
									{t.version}
									{t.update_available && t.new_version ? (
										<span className="ml-2 text-amber-500 text-xs">
											→ {t.new_version}
										</span>
									) : null}
								</TableCell>
								<TableCell>
									<Badge
										variant={t.status === "active" ? "default" : "outline"}
									>
										{t.status}
									</Badge>
								</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{autoUpdateLabel(t.auto_update)}
								</TableCell>
								<TableCell className="text-right">
									<RowActions kind="theme" row={t} siteId={siteId} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}

function SiteHealthSection({ data }: { data: SiteInsights["site_health"] }) {
	const { critical, recommended } = data;
	if (critical.length === 0 && recommended.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Site Health</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm">No issues reported.</p>
				</CardContent>
			</Card>
		);
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Site Health</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-2">
				{critical.map((issue) => (
					<div className="flex items-start gap-2 text-sm" key={issue.test}>
						<span className="mt-0.5 text-destructive">✗</span>
						<span className="font-medium text-destructive">{issue.label}</span>
					</div>
				))}
				{recommended.map((issue) => (
					<div className="flex items-start gap-2 text-sm" key={issue.test}>
						<span className="mt-0.5 text-amber-500">✗</span>
						<span className="text-amber-600">{issue.label}</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

interface SignalEntry {
	label: string;
	ok: boolean;
}

function SecuritySignals({
	signals,
	objectCache,
	fastcgiCache,
}: {
	signals: SiteInsights["signals"];
	objectCache: SiteInsights["object_cache"];
	fastcgiCache: SiteInsights["fastcgi_cache"];
}) {
	const items: SignalEntry[] = [
		{ label: "XML-RPC disabled", ok: !signals.xmlrpc_enabled },
		{
			label: "Theme/plugin file editor disabled",
			ok: !signals.file_edit_enabled,
		},
		{ label: "WP_DEBUG off", ok: !signals.debug_on },
		{ label: "WP_DEBUG_LOG off", ok: !signals.debug_log_on },
		{ label: "WP_DEBUG_DISPLAY off", ok: !signals.debug_display_on },
		{ label: "SCRIPT_DEBUG off", ok: !signals.script_debug_on },
		{ label: "WP cron not disabled externally", ok: !signals.cron_disabled },
		{ label: "Object cache enabled", ok: objectCache.enabled },
		{ label: "FastCGI page cache enabled", ok: fastcgiCache.enabled },
	];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">
					Security &amp; Performance signals
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-1.5">
				{items.map(({ label, ok }) => (
					<div className="flex items-center gap-2 text-sm" key={label}>
						<span className={ok ? "text-success" : "text-destructive"}>
							{ok ? "✓" : "✗"}
						</span>
						<span className={ok ? "" : "text-muted-foreground"}>{label}</span>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

function InventoryContent({
	data,
	siteId,
}: {
	data: SiteInsights;
	siteId: string;
}) {
	const now = new Date();
	const mins = minutesAgo(data.generated_at, now);
	const stale = mins > 24 * 60;
	const collectedLabel =
		mins < 60 ? `${mins} min ago` : relativeTime(data.generated_at, now);

	return (
		<div className="grid gap-4">
			<div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
				<div className="grid gap-0.5">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold text-lg">
							WordPress {data.wp_core.version}
						</span>
						{data.wp_core.update_available && data.wp_core.new_version ? (
							<Badge
								className="border-amber-400 text-amber-500"
								variant="outline"
							>
								Update to {data.wp_core.new_version}
							</Badge>
						) : null}
					</div>
					<p className="text-muted-foreground text-sm">
						PHP {data.php_version} · {data.db.engine} {data.db.server_version} ·
						DB {humanizeBytes(data.db.size_bytes)}
					</p>
					<p className="text-muted-foreground text-xs">
						Collected {collectedLabel}
						{stale ? (
							<span className="ml-2 text-amber-500">
								(stale — older than 24 h)
							</span>
						) : null}
					</p>
				</div>
				<RefreshButton siteId={siteId} />
			</div>
			<SecurityScoreCard siteId={siteId} />
			<SecurityRadarCard siteId={siteId} />
			<CoreUpdateCard siteId={siteId} wpCore={data.wp_core} />
			<BulkUpdateBar
				hasPluginUpdates={data.plugins.some((p) => p.update_available)}
				siteId={siteId}
			/>
			<PluginTable plugins={data.plugins} siteId={siteId} />
			<ThemeTable siteId={siteId} themes={data.themes} />
			<AutoUpdateScheduleCard siteId={siteId} />
			<SiteHealthSection data={data.site_health} />
			<SecuritySignals
				fastcgiCache={data.fastcgi_cache}
				objectCache={data.object_cache}
				signals={data.signals}
			/>
		</div>
	);
}

function InventoryBody({
	siteId,
	data,
}: {
	siteId: string;
	data: SiteInsights | null;
}) {
	if (data === null) {
		return (
			<div className="flex flex-col items-center gap-4 rounded-lg border border-border border-dashed py-16 text-center">
				<p className="text-muted-foreground text-sm">
					No inventory collected yet.
				</p>
				<RefreshButton siteId={siteId} />
			</div>
		);
	}
	return <InventoryContent data={data} siteId={siteId} />;
}

function InventoryPage() {
	const { siteId } = Route.useParams();
	const inventory = useQuery(inventoryQuery(siteId));

	return (
		<>
			<TopBar crumbs={[siteId, "Inventory"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					subtitle="WordPress core, plugins, themes, health issues and security signals."
					title="Inventory"
				/>
				<QueryBoundary
					errorMessage="Couldn't load the inventory."
					hasData={inventory.data !== undefined}
					isError={inventory.isError}
					isLoading={inventory.isLoading}
					onRetry={() => inventory.refetch()}
					skeletonClassName="h-64 w-full"
				>
					{inventory.data === undefined ? null : (
						<InventoryBody data={inventory.data} siteId={siteId} />
					)}
				</QueryBoundary>
			</div>
		</>
	);
}
