/**
 * SecurityScoreCard — per-site security posture, derived from the Insights
 * mu-plugin (WordPress) and the host security-status. Shows a graded score, the
 * summary counts, and a prioritized list of findings. Each finding's `fix` maps
 * to an EXISTING panel action; the Fix control either routes there (debug / core
 * / plugins / host) or, for the two env-backed hardening toggles (XML-RPC /
 * file-edit), runs the applySecurityFix mutation directly with a confirm. `null`
 * from the query means insights aren't collected yet — show the refresh-inventory
 * empty state.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inventoryQuery, securityScoreQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { type client, orpc } from "@/lib/orpc/client";

/** Derived from the typed oRPC client so the type tracks the server without a
 * contract import. `null` = insights not collected yet. */
type SecurityScore = NonNullable<
	Awaited<ReturnType<typeof client.siteSecurityScore>>
>;
type SecurityFinding = SecurityScore["findings"][number];
type Severity = SecurityFinding["severity"];

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const SEVERITY_BADGE: Record<
	Severity,
	{ label: string; variant: BadgeVariant; className: string }
> = {
	critical: { label: "Critical", variant: "destructive", className: "" },
	high: { label: "High", variant: "destructive", className: "" },
	medium: {
		label: "Medium",
		variant: "secondary",
		className: "bg-warning text-warning-foreground",
	},
	low: { label: "Low", variant: "outline", className: "" },
};

function GradeMedallion({ grade }: { grade: SecurityScore["grade"] }) {
	let tone = "bg-success text-success-foreground";
	if (grade === "C") {
		tone = "bg-warning text-warning-foreground";
	} else if (grade === "D" || grade === "F") {
		tone = "bg-destructive text-destructive-foreground";
	}
	return (
		<div
			className={`flex size-16 items-center justify-center rounded-xl font-bold text-3xl ${tone}`}
		>
			{grade}
		</div>
	);
}

function summaryLabel(summary: SecurityScore["summary"]): string {
	const parts: string[] = [];
	if (summary.critical > 0) {
		parts.push(`${summary.critical} critical`);
	}
	if (summary.high > 0) {
		parts.push(`${summary.high} high`);
	}
	if (summary.medium > 0) {
		parts.push(`${summary.medium} medium`);
	}
	if (summary.low > 0) {
		parts.push(`${summary.low} low`);
	}
	return parts.length > 0 ? parts.join(" · ") : "No findings";
}

function SeverityBadge({ severity }: { severity: Severity }) {
	const { label, variant, className } = SEVERITY_BADGE[severity];
	return (
		<Badge className={className} variant={variant}>
			{label}
		</Badge>
	);
}

/** Copy for the two env-backed one-click hardening fixes. */
const SECURITY_FIX_COPY: Record<
	"disableXmlRpc" | "disableFileEdit",
	{ confirm: string; success: string }
> = {
	disableXmlRpc: {
		confirm:
			"Disable XML-RPC for this site? This stops pingback DDoS amplification and XML-RPC brute-forcing. Apps that rely on XML-RPC (some legacy mobile/Jetpack flows) will stop working.",
		success: "XML-RPC will be disabled. Restart the site to apply it.",
	},
	disableFileEdit: {
		confirm:
			"Disable the dashboard theme/plugin file editor for this site? This sets DISALLOW_FILE_EDIT — an admin-account compromise can no longer edit server code from wp-admin.",
		success: "File editor will be disabled. Restart the site to apply it.",
	},
};

/**
 * One-click hardening control for the two env-backed fixes (XML-RPC / file-edit).
 * Writes the env key via applySecurityFix, then — since the value is only honored
 * when the container renders wp-config / the MU plugin at start — offers a
 * "Restart now" action that fires the streamed lifecycleRestart job. The score
 * only reflects the change on the NEXT insights collection after the restart, so
 * the operator should press "Re-check" once the restart finishes.
 */
function SecurityFixButton({
	siteId,
	fix,
}: {
	siteId: string;
	fix: "disableXmlRpc" | "disableFileEdit";
}) {
	const qc = useQueryClient();
	const { start } = useOperations();
	const apply = useMutation(orpc.applySecurityFix.mutationOptions());
	const restart = useMutation(orpc.lifecycleRestart.mutationOptions());
	const copy = SECURITY_FIX_COPY[fix];

	async function triggerRestart() {
		try {
			const result = await restart.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: `Restarting ${siteId}`,
				kind: "restart",
				siteId,
			});
		} catch {
			toast.error("Failed to restart the site.");
		}
	}

	async function handleFix() {
		// biome-ignore lint/suspicious/noAlert: a host-changing fix needs an explicit operator confirm.
		if (!window.confirm(copy.confirm)) {
			return;
		}
		try {
			const result = await apply.mutateAsync({ siteId, fix });
			await qc.invalidateQueries(securityScoreQuery(siteId));
			if (result.restartRequired) {
				toast.success(copy.success, {
					action: {
						label: "Restart now",
						onClick: () => {
							triggerRestart();
						},
					},
				});
			} else {
				toast.success(copy.success);
			}
		} catch {
			toast.error("Failed to apply the fix. Operator role required.");
		}
	}

	return (
		<Button
			disabled={apply.isPending || restart.isPending}
			onClick={handleFix}
			size="sm"
			variant="outline"
		>
			{apply.isPending ? "Applying…" : "Fix"}
		</Button>
	);
}

/** Maps a finding's `fix` to an existing route, or to the one-click hardening
 * mutation (XML-RPC / file-edit). `null` fixes are informational (Site Health) —
 * no control. */
function FixAffordance({
	finding,
	siteId,
}: {
	finding: SecurityFinding;
	siteId: string;
}) {
	const fix = finding.fix;
	if (fix === null) {
		return (
			<span className="text-muted-foreground text-xs">
				Review in Site Health
			</span>
		);
	}

	if (fix.kind === "disableDebugDisplay") {
		return (
			<Button
				render={<Link params={{ siteId }} to="/sites/$siteId/settings" />}
				size="sm"
				variant="outline"
			>
				Fix in Settings
			</Button>
		);
	}

	if (fix.kind === "updateCore" || fix.kind === "updatePlugins") {
		return (
			<Button
				render={<Link params={{ siteId }} to="/sites/$siteId/inventory" />}
				size="sm"
				variant="outline"
			>
				Fix in Updates
			</Button>
		);
	}

	if (fix.kind === "hardenHost") {
		return (
			<Button render={<Link to="/server" />} size="sm" variant="outline">
				Harden server
			</Button>
		);
	}

	// disableXmlRpc / disableFileEdit — env-backed one-click hardening toggles.
	return <SecurityFixButton fix={fix.kind} siteId={siteId} />;
}

function FindingRow({
	finding,
	siteId,
}: {
	finding: SecurityFinding;
	siteId: string;
}) {
	return (
		<div className="flex items-start justify-between gap-4 py-3">
			<div className="grid gap-1">
				<div className="flex items-center gap-2">
					<SeverityBadge severity={finding.severity} />
					<span className="font-medium text-sm">{finding.title}</span>
				</div>
				<p className="text-muted-foreground text-xs">{finding.detail}</p>
			</div>
			<div className="shrink-0 self-center">
				<FixAffordance finding={finding} siteId={siteId} />
			</div>
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
				qc.invalidateQueries(securityScoreQuery(siteId));
			}, 2000);
		} catch {
			toast.error("Failed to re-check security.");
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

function ScoreBody({
	score,
	siteId,
}: {
	score: SecurityScore;
	siteId: string;
}) {
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
				<CardTitle className="flex items-center gap-2 text-sm">
					<ShieldCheck className="size-4" />
					Security
				</CardTitle>
				<RecheckButton siteId={siteId} />
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="flex items-center gap-4">
					<GradeMedallion grade={score.grade} />
					<div className="grid gap-0.5">
						<span className="font-semibold text-2xl">
							{score.score}
							<span className="text-base text-muted-foreground">/100</span>
						</span>
						<span className="text-muted-foreground text-sm">
							{summaryLabel(score.summary)}
						</span>
					</div>
				</div>

				{score.findings.length > 0 ? (
					<div className="divide-y divide-border rounded-lg border border-border px-4">
						{score.findings.map((finding) => (
							<FindingRow finding={finding} key={finding.id} siteId={siteId} />
						))}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">
						No security findings — this site looks well-hardened.
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
					<ShieldCheck className="size-4" />
					Security
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col items-center gap-4 py-8 text-center">
				<p className="text-muted-foreground text-sm">
					Security insights aren't collected yet — refresh the inventory to
					compute this site's score.
				</p>
				<RecheckButton siteId={siteId} />
			</CardContent>
		</Card>
	);
}

function SecurityScoreContent({
	data,
	siteId,
}: {
	data: SecurityScore | null;
	siteId: string;
}) {
	if (data === null) {
		return <NotCollected siteId={siteId} />;
	}
	return <ScoreBody score={data} siteId={siteId} />;
}

export function SecurityScoreCard({ siteId }: { siteId: string }) {
	const query = useQuery(securityScoreQuery(siteId));

	return (
		<QueryBoundary
			errorMessage="Couldn't load the security score."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-64 w-full"
		>
			{query.data === undefined ? null : (
				<SecurityScoreContent data={query.data} siteId={siteId} />
			)}
		</QueryBoundary>
	);
}
