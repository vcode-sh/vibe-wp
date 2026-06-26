/**
 * SecurityRadarCard — per-site vulnerability + abandoned-plugin radar. Lists the
 * ACTIVE plugins the radar flagged (out of date | unmaintained | known CVE) with a
 * severity dot, plain-language "what's wrong + why it matters" copy, and per-row
 * remediation:
 *   - "Update safely" runs the EXISTING safe-update mutation (snapshot + TTFB probe
 *     + automatic rollback) — offered whenever an update exists.
 *   - "Deactivate" (quarantine) runs the EXISTING pluginDeactivate mutation behind
 *     a confirm dialog because it can take a feature offline.
 * Works out of the box with NO paid key: outdated + unmaintained come from the
 * free wp.org data the inventory already collects. The CVE feed is optional and
 * only lights up the "known CVE" reason once an operator configures a source.
 * `null` from the query = insights not collected yet → a friendly empty state.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { relativeTime } from "@/data/derive";
import { securityRadarQuery } from "@/data/queries";
import {
	actionButtonLabel,
	actionGuidance,
	type RadarReason,
	REASON_LABEL,
	reasonExplanation,
	SEVERITY_META,
	summaryLabel,
} from "@/data/radar-copy";
import type { FlaggedPlugin, SecurityRadar } from "@/data/types";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";
import { invalidateInventoryRefreshed } from "@/lib/realtime/immediate-invalidation";

function SeverityDot({ severity }: { severity: FlaggedPlugin["severity"] }) {
	const meta = SEVERITY_META[severity];
	return (
		<span className="flex items-center gap-1.5">
			<span
				aria-hidden
				className={`size-2 shrink-0 rounded-full ${meta.dotClass}`}
			/>
			<span className={`font-medium text-xs ${meta.textClass}`}>
				{meta.label}
			</span>
		</span>
	);
}

function ReasonBadges({ reasons }: { reasons: RadarReason[] }) {
	return (
		<div className="flex flex-wrap gap-1">
			{reasons.map((r) => (
				<Badge
					className={r === "cve" ? "" : "bg-warning text-warning-foreground"}
					key={r}
					variant={r === "cve" ? "destructive" : "secondary"}
				>
					{REASON_LABEL[r]}
				</Badge>
			))}
		</div>
	);
}

function RadarRow({
	flagged,
	siteId,
}: {
	flagged: FlaggedPlugin;
	siteId: string;
}) {
	const { start } = useOperations();
	const safeUpdate = useMutation(orpc.safeUpdate.mutationOptions());
	const deactivate = useMutation(orpc.pluginDeactivate.mutationOptions());
	const [confirmQuarantine, setConfirmQuarantine] = useState(false);

	const slug = flagged.slug;
	const canUpdate =
		flagged.suggestedAction === "safeUpdate" || flagged.newVersion !== null;
	const updateIsPrimary = flagged.suggestedAction === "safeUpdate";

	async function runUpdate() {
		try {
			const r = await safeUpdate.mutateAsync({
				siteId,
				target: { kind: "plugin", slug },
			});
			start({
				jobId: r.jobId,
				title: `Safe-updating ${flagged.name}`,
				kind: "safeUpdate",
				siteId,
			});
		} catch {
			toast.error("Couldn't start the safe update. Please try again.");
		}
	}

	async function runQuarantine() {
		try {
			const r = await deactivate.mutateAsync({ siteId, slug });
			start({
				jobId: r.jobId,
				title: `Deactivating ${flagged.name}`,
				kind: "wp:plugin",
				siteId,
			});
		} catch {
			toast.error("Couldn't deactivate the plugin. Please try again.");
		}
	}

	return (
		<div className="flex flex-col gap-3 py-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
				<div className="grid gap-1.5">
					<div className="flex flex-wrap items-center gap-2">
						<SeverityDot severity={flagged.severity} />
						<span className="font-medium text-sm">{flagged.name}</span>
						<span className="text-muted-foreground text-xs">
							v{flagged.version}
							{flagged.newVersion ? (
								<span className="ml-1 text-warning">
									→ v{flagged.newVersion}
								</span>
							) : null}
						</span>
					</div>
					<ReasonBadges reasons={flagged.reasons} />
				</div>
				<div className="flex shrink-0 gap-2 self-start">
					{canUpdate ? (
						<Button
							disabled={safeUpdate.isPending}
							onClick={runUpdate}
							size="sm"
							variant={updateIsPrimary ? "default" : "outline"}
						>
							{safeUpdate.isPending
								? "Starting…"
								: actionButtonLabel("safeUpdate")}
						</Button>
					) : null}
					<Button
						disabled={deactivate.isPending}
						onClick={() => setConfirmQuarantine(true)}
						size="sm"
						variant={updateIsPrimary ? "outline" : "default"}
					>
						Deactivate
					</Button>
				</div>
			</div>

			{/* Plain-language WHY: one line per reason so a non-technical operator
			    understands the risk without docs. */}
			<ul className="grid gap-1 text-muted-foreground text-xs">
				{flagged.reasons.map((r) => (
					<li key={r}>• {reasonExplanation(r, flagged)}</li>
				))}
				{flagged.lastUpdated ? (
					<li>
						• Last released {relativeTime(flagged.lastUpdated, new Date())}.
					</li>
				) : null}
			</ul>

			{/* What we'll do + why it's safe. */}
			<p className="text-foreground/80 text-xs">{actionGuidance(flagged)}</p>

			<AlertDialog onOpenChange={setConfirmQuarantine} open={confirmQuarantine}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Deactivate {flagged.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							This turns the plugin off to remove its risk. Any feature it
							provides goes offline until you re-activate it or a safe update
							becomes available. Your content and settings are not deleted.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep it on</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmQuarantine(false);
								runQuarantine();
							}}
						>
							Deactivate
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function RecheckButton({ siteId }: { siteId: string }) {
	const qc = useQueryClient();
	const refresh = useMutation(orpc.refreshInventory.mutationOptions());

	async function handleRecheck() {
		try {
			await refresh.mutateAsync({ siteId });
			toast.success("Re-checking — results refresh in a moment.");
			setTimeout(() => {
				invalidateInventoryRefreshed(qc, siteId);
			}, 2000);
		} catch {
			toast.error("Couldn't re-check right now. Please try again.");
		}
	}

	return (
		<Button
			disabled={refresh.isPending}
			onClick={handleRecheck}
			size="sm"
			variant="outline"
		>
			{refresh.isPending ? "Re-checking…" : "Re-check now"}
		</Button>
	);
}

function CardShell({
	children,
	siteId,
	withRecheck = true,
}: {
	children: React.ReactNode;
	siteId: string;
	withRecheck?: boolean;
}) {
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Radar className="size-4" />
					Security radar
				</CardTitle>
				{withRecheck ? <RecheckButton siteId={siteId} /> : null}
			</CardHeader>
			{children}
		</Card>
	);
}

function CleanState() {
	return (
		<CardContent className="flex flex-col items-center gap-3 py-8 text-center">
			<ShieldCheck className="size-8 text-success" />
			<p className="font-medium text-sm">All clear</p>
			<p className="max-w-md text-muted-foreground text-sm">
				Every active plugin is up to date and actively maintained. The radar
				re-checks automatically each time the inventory refreshes.
			</p>
		</CardContent>
	);
}

function RadarBody({
	radar,
	siteId,
}: {
	radar: SecurityRadar;
	siteId: string;
}) {
	const hasFlags = radar.flagged.length > 0;
	return (
		<CardShell siteId={siteId}>
			<CardContent className="grid gap-3">
				<p className="text-muted-foreground text-sm">
					Watches every active plugin for three risks — out-of-date versions,
					plugins that look unmaintained, and versions with a publicly known
					security flaw. No setup required.
				</p>
				<p
					className={
						hasFlags
							? "font-medium text-foreground text-sm"
							: "text-muted-foreground text-sm"
					}
				>
					{summaryLabel(radar.summary)}
				</p>
				{hasFlags ? (
					<div className="divide-y divide-border rounded-lg border border-border px-4">
						{radar.flagged.map((flagged) => (
							<RadarRow flagged={flagged} key={flagged.slug} siteId={siteId} />
						))}
					</div>
				) : (
					<CleanState />
				)}
			</CardContent>
		</CardShell>
	);
}

/** Insights haven't been collected yet (query returned `null`). */
function NotCollected({ siteId }: { siteId: string }) {
	return (
		<CardShell siteId={siteId} withRecheck={false}>
			<CardContent className="flex flex-col items-center gap-4 py-8 text-center">
				<p className="max-w-md text-muted-foreground text-sm">
					We haven't scanned this site yet. Run a quick inventory refresh and
					the radar will check every active plugin for out-of-date,
					unmaintained, and known-vulnerable versions.
				</p>
				<RecheckButton siteId={siteId} />
			</CardContent>
		</CardShell>
	);
}

function RadarContent({
	data,
	siteId,
}: {
	data: SecurityRadar | null;
	siteId: string;
}) {
	if (data === null) {
		return <NotCollected siteId={siteId} />;
	}
	return <RadarBody radar={data} siteId={siteId} />;
}

export function SecurityRadarCard({ siteId }: { siteId: string }) {
	const query = useQuery(securityRadarQuery(siteId));

	return (
		<QueryBoundary
			errorMessage="Couldn't load the security radar. Re-check or refresh the page."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-48 w-full"
		>
			{query.data === undefined ? null : (
				<RadarContent data={query.data} siteId={siteId} />
			)}
		</QueryBoundary>
	);
}
