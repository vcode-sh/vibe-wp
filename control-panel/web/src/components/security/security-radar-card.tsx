/**
 * SecurityRadarCard — per-site vulnerability + abandoned-plugin radar. Lists the
 * ACTIVE plugins the radar flagged (outdated | abandoned | cve) with reason
 * badges, last-updated age, and per-row remediation:
 *   - "Update" runs the EXISTING safe-update mutation (snapshot + TTFB probe +
 *     rollback) — preferred when an update exists.
 *   - "Deactivate" (quarantine) runs the EXISTING pluginDeactivate mutation,
 *     behind a confirm dialog because it can take a feature offline.
 * Both reuse the operations tray exactly like inventory-actions.tsx. `null` from
 * the query = insights not collected yet → the refresh-inventory empty state.
 * The CVE column stays dark until an operator configures a feed (PANEL_VULN_FEED_URL).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Radar } from "lucide-react";
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
import { inventoryQuery, securityRadarQuery } from "@/data/queries";
import type { FlaggedPlugin, SecurityRadar } from "@/data/types";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

type RadarReason = FlaggedPlugin["reasons"][number];

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const REASON_BADGE: Record<
	RadarReason,
	{ label: string; variant: BadgeVariant; className: string }
> = {
	outdated: {
		label: "Outdated",
		variant: "secondary",
		className: "bg-warning text-warning-foreground",
	},
	abandoned: {
		label: "Abandoned",
		variant: "secondary",
		className: "bg-warning text-warning-foreground",
	},
	cve: { label: "Known CVE", variant: "destructive", className: "" },
};

function ReasonBadges({ reasons }: { reasons: RadarReason[] }) {
	return (
		<div className="flex flex-wrap gap-1">
			{reasons.map((r) => {
				const { label, variant, className } = REASON_BADGE[r];
				return (
					<Badge className={className} key={r} variant={variant}>
						{label}
					</Badge>
				);
			})}
		</div>
	);
}

function summaryLabel(summary: SecurityRadar["summary"]): string {
	const parts: string[] = [];
	if (summary.cve > 0) {
		parts.push(`${summary.cve} with known CVEs`);
	}
	if (summary.outdated > 0) {
		parts.push(`${summary.outdated} outdated`);
	}
	if (summary.abandoned > 0) {
		parts.push(`${summary.abandoned} abandoned`);
	}
	return parts.length > 0 ? parts.join(" · ") : "Nothing flagged";
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

	async function runUpdate() {
		try {
			const r = await safeUpdate.mutateAsync({
				siteId,
				target: { kind: "plugin", slug },
			});
			start({
				jobId: r.jobId,
				title: `Safe-updating ${slug}`,
				kind: "safeUpdate",
				siteId,
			});
		} catch {
			toast.error("Failed to start safe-update.");
		}
	}

	async function runQuarantine() {
		try {
			const r = await deactivate.mutateAsync({ siteId, slug });
			start({
				jobId: r.jobId,
				title: `Quarantining (deactivating) ${slug}`,
				kind: "wp:plugin",
				siteId,
			});
		} catch {
			toast.error("Failed to quarantine the plugin.");
		}
	}

	return (
		<div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
			<div className="grid gap-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-medium text-sm">{flagged.name}</span>
					<span className="text-muted-foreground text-xs">
						{flagged.version}
						{flagged.newVersion ? (
							<span className="ml-1 text-warning">→ {flagged.newVersion}</span>
						) : null}
					</span>
				</div>
				<ReasonBadges reasons={flagged.reasons} />
				{flagged.cves.length > 0 ? (
					<p className="text-destructive text-xs">
						{flagged.cves.map((c) => c.id).join(", ")}
					</p>
				) : null}
				{flagged.lastUpdated ? (
					<p className="text-muted-foreground text-xs">
						Last updated {relativeTime(flagged.lastUpdated, new Date())}
					</p>
				) : null}
			</div>
			<div className="flex shrink-0 gap-2 self-start sm:self-center">
				{canUpdate ? (
					<Button
						disabled={safeUpdate.isPending}
						onClick={runUpdate}
						size="sm"
						variant="outline"
					>
						Update
					</Button>
				) : null}
				<Button
					disabled={deactivate.isPending}
					onClick={() => setConfirmQuarantine(true)}
					size="sm"
					variant="outline"
				>
					Deactivate
				</Button>
			</div>

			<AlertDialog onOpenChange={setConfirmQuarantine} open={confirmQuarantine}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Quarantine {flagged.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							This deactivates the plugin to remove its attack surface. Any
							feature it provides goes offline until it is re-activated or
							safely updated.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
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
			setTimeout(() => {
				qc.invalidateQueries(inventoryQuery(siteId));
				qc.invalidateQueries(securityRadarQuery(siteId));
			}, 2000);
		} catch {
			toast.error("Failed to re-check the radar.");
		}
	}

	return (
		<Button
			disabled={refresh.isPending}
			onClick={handleRecheck}
			size="sm"
			variant="outline"
		>
			{refresh.isPending ? "Re-checking…" : "Re-check"}
		</Button>
	);
}

function RadarBody({
	radar,
	siteId,
}: {
	radar: SecurityRadar;
	siteId: string;
}) {
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Radar className="size-4" />
					Vulnerability radar
				</CardTitle>
				<RecheckButton siteId={siteId} />
			</CardHeader>
			<CardContent className="grid gap-2">
				<p className="text-muted-foreground text-sm">
					{summaryLabel(radar.summary)}
				</p>
				{radar.flagged.length > 0 ? (
					<div className="divide-y divide-border rounded-lg border border-border px-4">
						{radar.flagged.map((flagged) => (
							<RadarRow flagged={flagged} key={flagged.slug} siteId={siteId} />
						))}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">
						No flagged plugins — every active plugin is current and maintained.
					</p>
				)}
			</CardContent>
		</Card>
	);
}

/** Insights haven't been collected yet (query returned `null`). */
function NotCollected({ siteId }: { siteId: string }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					<Radar className="size-4" />
					Vulnerability radar
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col items-center gap-4 py-8 text-center">
				<p className="text-muted-foreground text-sm">
					Insights aren't collected yet — refresh the inventory to scan for
					risky plugins.
				</p>
				<RecheckButton siteId={siteId} />
			</CardContent>
		</Card>
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
			errorMessage="Couldn't load the vulnerability radar."
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
