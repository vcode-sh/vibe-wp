/**
 * SecurityScoreCard — per-site security posture, derived from the Insights
 * mu-plugin (WordPress) and the host security-status. Shows a graded score, the
 * summary counts, and a prioritized list of findings. Each finding's `fix` maps
 * to an EXISTING panel action; the Fix control either routes there (debug / core
 * / plugins / host) or, for the two env-backed hardening toggles (XML-RPC /
 * file-edit), runs the applySecurityFix mutation directly behind a confirm
 * dialog and then offers a one-click "Restart now". `null` from the query means
 * insights aren't collected yet — show the refresh-inventory empty state.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
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
import { securityScoreQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { type client, orpc } from "@/lib/orpc/client";
import {
	invalidateInventoryRefreshed,
	invalidateSecurityFixSaved,
} from "@/lib/realtime/immediate-invalidation";

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

/** Plain-language caption for each grade — keeps the score legible for a
 * non-technical operator who doesn't know what "A" vs "C" implies. */
const GRADE_CAPTION: Record<SecurityScore["grade"], string> = {
	A: "Well hardened",
	B: "Good — a few things to tidy",
	C: "Fair — worth fixing",
	D: "Weak — fix soon",
	F: "At risk — fix now",
};

/** The two env-backed one-click hardening fixes. */
type SecurityFixKind = "disableXmlRpc" | "disableFileEdit";

/**
 * Confirm-dialog + toast copy for each env-backed one-click hardening fix. Each
 * spells out what changes (`what`) and reassures the operator it is safe and
 * reversible (`safe`) before anything is written, plus the success-toast line.
 */
const SECURITY_FIX_COPY: Record<
	SecurityFixKind,
	{ title: string; what: string; safe: string; success: string }
> = {
	disableXmlRpc: {
		title: "Disable XML-RPC?",
		what: "This switches off WordPress XML-RPC, blocks pingback requests, and removes the X-Pingback header that advertises it — stopping pingback DDoS amplification and XML-RPC password brute-forcing.",
		safe: "Safe for almost every site. Only turn it back on if you use the WordPress mobile app, Jetpack, or a remote-publishing tool that still needs XML-RPC.",
		success: "XML-RPC will be disabled. Restart the site to apply it.",
	},
	disableFileEdit: {
		title: "Disable the theme & plugin file editor?",
		what: "This sets DISALLOW_FILE_EDIT, hiding the built-in code editor under Appearance and Plugins in wp-admin so a stolen admin login can't run code on your server.",
		safe: "Recommended. You can still edit files over SFTP or in the panel — this only removes the in-dashboard editor.",
		success: "File editor will be disabled. Restart the site to apply it.",
	},
};

/**
 * One-click hardening control for the two env-backed fixes (XML-RPC / file-edit).
 * A confirm dialog spells out exactly what changes before anything is written;
 * applySecurityFix then writes the env key. Because the value is only honored
 * when the container renders wp-config / the MU plugin at start, the success
 * toast offers a "Restart now" action that fires the streamed lifecycleRestart
 * job, and the control then flips to an inline "Applied — Restart now" hint so
 * the operator always knows the next step. The score only reflects the change on
 * the next insights collection after the restart, so they can press "Re-check"
 * once the restart finishes.
 */
function SecurityFixButton({
	siteId,
	fix,
}: {
	siteId: string;
	fix: SecurityFixKind;
}) {
	const qc = useQueryClient();
	const { start } = useOperations();
	const apply = useMutation(orpc.applySecurityFix.mutationOptions());
	const restart = useMutation(orpc.lifecycleRestart.mutationOptions());
	const [open, setOpen] = useState(false);
	const [applied, setApplied] = useState(false);
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
			toast.error("Couldn't restart the site. Restart it from the site menu.");
		}
	}

	async function handleConfirm() {
		setOpen(false);
		try {
			const result = await apply.mutateAsync({ siteId, fix });
			setApplied(true);
			await invalidateSecurityFixSaved(qc, siteId);
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
			toast.error("Couldn't apply the fix. Admin role required.");
		}
	}

	if (applied) {
		return (
			<div className="flex items-center gap-2">
				<span className="text-success text-xs">Applied</span>
				<Button
					disabled={restart.isPending}
					onClick={() => triggerRestart()}
					size="sm"
					variant="outline"
				>
					{restart.isPending ? "Restarting…" : "Restart now"}
				</Button>
			</div>
		);
	}

	return (
		<>
			<Button
				disabled={apply.isPending}
				onClick={() => setOpen(true)}
				size="sm"
			>
				{apply.isPending ? "Applying…" : "Fix"}
			</Button>
			<AlertDialog onOpenChange={setOpen} open={open}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle className="flex items-center gap-2">
							{copy.title}
							<Badge variant="outline">Reversible</Badge>
						</AlertDialogTitle>
						<AlertDialogDescription>{copy.what}</AlertDialogDescription>
					</AlertDialogHeader>
					<p className="text-muted-foreground text-xs">{copy.safe}</p>
					<p className="text-muted-foreground text-xs">
						The site needs a quick restart to apply this — we'll offer a
						one-click restart right after.
					</p>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction autoFocus onClick={handleConfirm}>
							Apply fix
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
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
				invalidateInventoryRefreshed(qc, siteId);
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
						<span className="font-medium text-sm">
							{GRADE_CAPTION[score.grade]}
						</span>
						<span className="text-muted-foreground text-xs">
							{summaryLabel(score.summary)}
						</span>
					</div>
				</div>

				{score.findings.length > 0 ? (
					<>
						<p className="text-muted-foreground text-xs">
							Each item below is something you can improve. Use the button on
							the right to fix it — we explain what changes before anything
							happens.
						</p>
						<div className="divide-y divide-border rounded-lg border border-border px-4">
							{score.findings.map((finding) => (
								<FindingRow
									finding={finding}
									key={finding.id}
									siteId={siteId}
								/>
							))}
						</div>
					</>
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
