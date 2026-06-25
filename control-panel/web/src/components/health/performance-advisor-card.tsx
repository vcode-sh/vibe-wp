/**
 * PerformanceAdvisorCard — feature #5, the Smart Performance Advisor.
 *
 * Design goal: a non-technical operator can read this card and confidently act
 * without docs. It measures the running stack over a short window, then shows:
 *   - what we measured, in plain words,
 *   - a memory-budget meter (the advisor never reserves >85% of host RAM),
 *   - explainable recommendations — each leads with a plain-language sentence,
 *   - a clear before → after preview.
 *
 * The Apply button is ADMIN-ONLY (the procedure is admin-gated too). On confirm
 * it opens PerfApplyDialog, which spells out the automatic safety net (snapshot
 * → apply → restart → health check → auto-rollback on failure), then fires
 * perfApply and pushes the job into the operations tray. Semantic tokens only —
 * no hardcoded colors.
 */

import { useMutation, useQuery } from "@tanstack/react-query";
import { Gauge, ShieldCheck } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import {
	type PerfApplyChange,
	PerfApplyDialog,
} from "@/components/health/perf-apply-dialog";
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

const RISK_BADGE: Record<Risk, { className: string; label: string }> = {
	low: { label: "Low risk", className: "bg-success text-success-foreground" },
	medium: {
		label: "Worth a look",
		className: "bg-warning text-warning-foreground",
	},
	high: {
		label: "Care needed",
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
				label="Server memory (free / total)"
				value={`${m.host.ramFreeMiB} / ${m.host.ramTotalMiB} MiB`}
			/>
			<MeasurementRow
				label="Visitors served at once (now / max)"
				value={`${m.fpm.active} / ${m.fpm.maxChildren}`}
			/>
			<MeasurementRow
				label="Visitors waiting in line"
				value={String(m.fpm.listenQueue)}
			/>
			<MeasurementRow
				label="Code cache hit rate"
				value={`${m.opcache.hitRatePercent}%`}
			/>
			<MeasurementRow
				label="Object cache evictions (this sample)"
				value={String(m.redis.evictedKeysDelta)}
			/>
			<MeasurementRow
				label="Object cache memory (used / max)"
				value={`${m.redis.usedMemoryMiB} / ${m.redis.maxMemoryMiB} MiB`}
			/>
			<MeasurementRow
				label="Database served from memory"
				value={`${m.innodb.bufferPoolReadRatioPercent}%`}
			/>
			<MeasurementRow
				label="Page cache hit (quick check)"
				value={`${m.fastcgi.hitRatePercent}%`}
			/>
		</div>
	);
}

function RiskBadge({ risk }: { risk: Risk }) {
	const { label, className } = RISK_BADGE[risk];
	return <Badge className={className}>{label}</Badge>;
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
	return (
		<div className="grid gap-1.5 py-3">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium text-sm">{rec.label}</span>
				<RiskBadge risk={rec.risk} />
			</div>
			{rec.plain ? (
				<p className="text-foreground text-sm">{rec.plain}</p>
			) : null}
			<div className="font-mono text-xs">
				<span className="text-muted-foreground">{rec.current}</span>
				<span className="px-1 text-muted-foreground">→</span>
				<span className="font-medium">{rec.suggested}</span>
				<span className="text-muted-foreground"> {rec.unit}</span>
			</div>
			<p className="text-muted-foreground text-xs">Why: {rec.reason}</p>
		</div>
	);
}

function RecommendationsList({ recs }: { recs: Recommendation[] }) {
	if (recs.length === 0) {
		return (
			<div className="flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
				<ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
				<p className="text-foreground">
					Nothing to change — this site is already well-balanced for its current
					traffic and the memory it has. Re-run the analysis after a busy spell
					or after adding plugins to check again.
				</p>
			</div>
		);
	}
	return (
		<div className="divide-y divide-border rounded-lg border border-border px-4">
			{recs.map((r) => (
				<RecommendationRow key={r.key} rec={r} />
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
		<div className="grid gap-1.5">
			<div className="flex items-center justify-between text-xs">
				<span className="text-muted-foreground">
					Memory reserved vs the 85% safety budget
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
			<p className="text-muted-foreground text-xs">
				{over
					? "Over budget — the advisor only proposes safe reductions until this fits."
					: "The advisor never lets the stack reserve more than 85% of server memory, leaving room for the operating system."}
			</p>
		</div>
	);
}

function recsToChanges(recs: Recommendation[]): PerfApplyChange[] {
	return recs.map((r) => ({
		key: r.key,
		label: r.label,
		from: r.current,
		to: r.suggested,
		unit: r.unit,
	}));
}

function ApplySection({
	siteId,
	changes,
}: {
	changes: PerfApplyChange[];
	siteId: string;
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
				title: "Applying performance tuning",
				kind: "perfApply",
				siteId,
			});
			toast.success(
				"Applying performance tuning — watch the operations tray for progress."
			);
		} catch {
			toast.error("Couldn't start performance tuning. Please try again.");
		}
	}

	return (
		<div className="grid gap-3">
			<div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
				<ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
				<p className="text-muted-foreground">
					Applying is safe: we snapshot the site first, restart it briefly to
					pick up the new settings, then health-check it. If the check fails,
					the previous settings are restored for you automatically.
				</p>
			</div>
			<div>
				<Button
					disabled={apply.isPending}
					onClick={() => setConfirm(true)}
					size="sm"
				>
					{apply.isPending ? "Starting…" : "Apply recommendations"}
				</Button>
			</div>
			<PerfApplyDialog
				changes={changes}
				onConfirm={run}
				onOpenChange={setConfirm}
				open={confirm}
			/>
		</div>
	);
}

function AdvisorHeader({ action }: { action?: ReactNode }) {
	return (
		<CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
			<CardTitle className="flex items-center gap-2 text-sm">
				<Gauge className="size-4" />
				Performance advisor
			</CardTitle>
			{action}
		</CardHeader>
	);
}

function ApplyArea({ advice, siteId }: { advice: PerfAdvice; siteId: string }) {
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";

	if (advice.recommendations.length === 0) {
		return null;
	}
	if (!isAdmin) {
		return (
			<p className="text-muted-foreground text-sm">
				An administrator can apply these recommendations from this panel.
			</p>
		);
	}
	return (
		<ApplySection
			changes={recsToChanges(advice.recommendations)}
			siteId={siteId}
		/>
	);
}

function AdvisorBody({
	advice,
	siteId,
}: {
	advice: PerfAdvice;
	siteId: string;
}) {
	return (
		<Card>
			<AdvisorHeader />
			<CardContent className="grid gap-5">
				<div className="grid gap-2">
					<span className="font-medium text-sm">What we measured</span>
					<MeasurementsGrid m={advice.measurements} />
				</div>
				<CapMeter advice={advice} />
				<div className="grid gap-2">
					<span className="font-medium text-sm">Recommendations</span>
					<RecommendationsList recs={advice.recommendations} />
				</div>
				<ApplyArea advice={advice} siteId={siteId} />
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
				<AdvisorHeader
					action={
						<Button
							onClick={() => setEnabled(true)}
							size="sm"
							variant="outline"
						>
							Analyze performance
						</Button>
					}
				/>
				<CardContent className="text-muted-foreground text-sm">
					Checks how this site is using its workers, caches, database and memory
					over a short window, then suggests safe, plain-language tuning. It
					only reads — nothing changes until an administrator chooses to apply.
				</CardContent>
			</Card>
		);
	}

	if (query.isLoading) {
		return (
			<Card>
				<AdvisorHeader />
				<CardContent className="py-8 text-center text-muted-foreground text-sm">
					Measuring this site over a few seconds…
				</CardContent>
			</Card>
		);
	}
	if (query.isError || !query.data) {
		return (
			<Card>
				<AdvisorHeader />
				<CardContent className="flex flex-col items-center gap-3 py-8 text-center">
					<p className="text-muted-foreground text-sm">
						Couldn't measure this site's performance just now. The site itself
						is unaffected — this only reads metrics.
					</p>
					<Button onClick={() => query.refetch()} size="sm" variant="outline">
						Try again
					</Button>
				</CardContent>
			</Card>
		);
	}
	return <AdvisorBody advice={query.data} siteId={siteId} />;
}
