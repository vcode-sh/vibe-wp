/**
 * PerformanceAdvisorCard — feature #5. The shippable surface is read-only: a
 * windowed measurements grid, the deterministic advisor recommendations (with a
 * risk badge per row using SEMANTIC tokens — no hardcoded colors), a preview
 * diff, and the reserved-vs-85%-RAM-cap meter.
 *
 * The Apply button is ADMIN-ONLY and clearly labeled EXPERIMENTAL / not yet
 * validated. The procedure is adminProcedure (so non-admins get FORBIDDEN
 * anyway); the button is also hidden for non-admins. On confirm it fires
 * perfApply and pushes { jobId } into the operations tray (same start() pattern
 * as inventory-actions.tsx).
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { perfAdviceQuery } from "@/data/queries";
import { authClient } from "@/lib/auth-client";
import { useOperations } from "@/lib/operations/operations-provider";
import { type client, orpc } from "@/lib/orpc/client";

type PerfAdvice = NonNullable<Awaited<ReturnType<typeof client.perfAdvice>>>;
type Recommendation = PerfAdvice["recommendations"][number];
type Risk = Recommendation["risk"];

const RISK_CLASS: Record<Risk, string> = {
	low: "text-success",
	medium: "text-warning",
	high: "text-destructive",
};

const RISK_BADGE: Record<Risk, { label: string; className: string }> = {
	low: { label: "Low risk", className: "bg-success text-success-foreground" },
	medium: {
		label: "Medium risk",
		className: "bg-warning text-warning-foreground",
	},
	high: {
		label: "High risk",
		className: "bg-destructive text-destructive-foreground",
	},
};

function MeasurementRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-2 py-1 text-sm">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-medium tabular-nums">{value}</span>
		</div>
	);
}

function MeasurementsGrid({ m }: { m: PerfAdvice["measurements"] }) {
	return (
		<div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
			<MeasurementRow
				label="Host RAM total / free"
				value={`${m.host.ramTotalMiB} / ${m.host.ramFreeMiB} MiB`}
			/>
			<MeasurementRow
				label="FPM active / max"
				value={`${m.fpm.active} / ${m.fpm.maxChildren}`}
			/>
			<MeasurementRow
				label="FPM listen queue"
				value={String(m.fpm.listenQueue)}
			/>
			<MeasurementRow
				label="OPcache hit / OOM restarts"
				value={`${m.opcache.hitRatePercent}% / ${m.opcache.oomRestarts}`}
			/>
			<MeasurementRow
				label="Redis evicted (window)"
				value={String(m.redis.evictedKeysDelta)}
			/>
			<MeasurementRow
				label="Redis used / max"
				value={`${m.redis.usedMemoryMiB} / ${m.redis.maxMemoryMiB} MiB`}
			/>
			<MeasurementRow
				label="InnoDB read ratio"
				value={`${m.innodb.bufferPoolReadRatioPercent}%`}
			/>
			<MeasurementRow
				label="FastCGI hit (coarse)"
				value={`${m.fastcgi.hitRatePercent}%`}
			/>
		</div>
	);
}

function RiskBadge({ risk }: { risk: Risk }) {
	const { label, className } = RISK_BADGE[risk];
	return <Badge className={className}>{label}</Badge>;
}

function RecommendationsTable({ recs }: { recs: Recommendation[] }) {
	if (recs.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				No tuning recommendations — this site is well-balanced for its current
				load and RAM.
			</p>
		);
	}
	return (
		<div className="divide-y divide-border rounded-lg border border-border px-4">
			{recs.map((r) => (
				<div className="grid gap-1 py-3" key={r.key}>
					<div className="flex items-center justify-between gap-2">
						<span className="font-medium text-sm">{r.label}</span>
						<RiskBadge risk={r.risk} />
					</div>
					<div className="font-mono text-xs">
						<span className="text-muted-foreground">{r.current}</span>
						<span className={`px-1 ${RISK_CLASS[r.risk]}`}>→</span>
						<span className="font-medium">{r.suggested}</span>
						<span className="text-muted-foreground"> {r.unit}</span>
					</div>
					<p className="text-muted-foreground text-xs">{r.reason}</p>
				</div>
			))}
		</div>
	);
}

function CapMeter({ advice }: { advice: PerfAdvice }) {
	const cap = Math.max(advice.capMiB, 1);
	const pct = Math.min(100, Math.round((advice.reservedMiB / cap) * 100));
	const over = advice.headroomMiB < 0;
	const barClass = over ? "bg-destructive" : "bg-success";
	return (
		<div className="grid gap-1">
			<div className="flex items-center justify-between text-xs">
				<span className="text-muted-foreground">
					Reserved memory vs 85% RAM cap
				</span>
				<span
					className={`font-medium tabular-nums ${over ? "text-destructive" : ""}`}
				>
					{advice.reservedMiB} / {advice.capMiB} MiB
				</span>
			</div>
			<div className="h-2 w-full overflow-hidden rounded-full bg-muted">
				<div className={`h-full ${barClass}`} style={{ width: `${pct}%` }} />
			</div>
			{over ? (
				<p className="text-destructive text-xs">
					Over budget — the advisor proposes downward changes only.
				</p>
			) : null}
		</div>
	);
}

function PreviewDiff({ text }: { text: string }) {
	return (
		<pre className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
			{text}
		</pre>
	);
}

function ApplyButton({
	siteId,
	disabled,
}: {
	siteId: string;
	disabled: boolean;
}) {
	const { start } = useOperations();
	const apply = useMutation(orpc.perfApply.mutationOptions());
	const [confirm, setConfirm] = useState(false);

	async function run() {
		setConfirm(false);
		try {
			const r = await apply.mutateAsync({ siteId });
			start({
				jobId: r.jobId,
				title: "Applying performance tuning (experimental)",
				kind: "perfApply",
				siteId,
			});
		} catch {
			toast.error("Failed to start performance apply.");
		}
	}

	return (
		<>
			<Button
				disabled={disabled || apply.isPending}
				onClick={() => setConfirm(true)}
				size="sm"
				variant="outline"
			>
				Apply (experimental — not yet validated)
			</Button>
			<AlertDialog onOpenChange={setConfirm} open={confirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Apply performance tuning?</AlertDialogTitle>
						<AlertDialogDescription>
							This is EXPERIMENTAL and has not yet been validated on a real VPS.
							It writes the suggested tunables, then recreates the WordPress and
							database containers — a brief restart/downtime. A snapshot is
							taken first and the change auto-rolls back if the site fails its
							post-apply smoke check. The 85% RAM cap is re-checked on the host
							before anything is written.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={run}>
							Apply &amp; restart stack
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

function AdvisorBody({
	advice,
	siteId,
}: {
	advice: PerfAdvice;
	siteId: string;
}) {
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle className="flex items-center gap-2 text-sm">
					<Gauge className="size-4" />
					Performance advisor
					<Badge className="bg-warning text-warning-foreground">
						Experimental
					</Badge>
				</CardTitle>
				{isAdmin && advice.recommendations.length > 0 ? (
					<ApplyButton disabled={false} siteId={siteId} />
				) : null}
			</CardHeader>
			<CardContent className="grid gap-4">
				<MeasurementsGrid m={advice.measurements} />
				<CapMeter advice={advice} />
				<div className="grid gap-2">
					<span className="font-medium text-sm">Recommendations</span>
					<RecommendationsTable recs={advice.recommendations} />
				</div>
				{advice.recommendations.length > 0 ? (
					<div className="grid gap-2">
						<span className="font-medium text-sm">Preview diff</span>
						<PreviewDiff text={advice.previewText} />
						<p className="text-muted-foreground text-xs">
							Applying is advisory and experimental. The advisor never proposes
							a set whose total reserved memory exceeds 85% of host RAM.
						</p>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

export function PerformanceAdvisorCard({ siteId }: { siteId: string }) {
	const [enabled, setEnabled] = useState(false);
	const query = useQuery({ ...perfAdviceQuery(siteId), enabled });

	if (!enabled) {
		return (
			<Card>
				<CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
					<CardTitle className="flex items-center gap-2 text-sm">
						<Gauge className="size-4" />
						Performance advisor
						<Badge className="bg-warning text-warning-foreground">
							Experimental
						</Badge>
					</CardTitle>
					<Button onClick={() => setEnabled(true)} size="sm" variant="outline">
						Analyze performance
					</Button>
				</CardHeader>
				<CardContent className="text-muted-foreground text-sm">
					Samples FPM, OPcache, Redis, InnoDB and host RAM over a short window,
					then suggests explainable, RAM-budgeted tuning. Read-only — applying
					is admin-only and experimental.
				</CardContent>
			</Card>
		);
	}

	if (query.isLoading) {
		return (
			<Card>
				<CardContent className="py-8 text-center text-muted-foreground text-sm">
					Measuring performance over a short window…
				</CardContent>
			</Card>
		);
	}
	if (query.isError || !query.data) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center gap-3 py-8 text-center">
					<p className="text-muted-foreground text-sm">
						Couldn't measure this site's performance.
					</p>
					<Button onClick={() => query.refetch()} size="sm" variant="outline">
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}
	return <AdvisorBody advice={query.data} siteId={siteId} />;
}
