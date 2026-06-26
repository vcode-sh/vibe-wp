import type { StagingSyncPlan } from "@control-panel/api/core-bridge/sync-plan";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { stagingSyncPlanQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

type Direction = "refreshFromProd" | "pushFilesToLive";

function countLabel(plan: StagingSyncPlan | undefined) {
	const rewrite = plan?.urlRewrite;
	if (!rewrite?.required) {
		return rewrite?.preview ?? "No URL rewrite is planned.";
	}
	if (rewrite.estimatedOccurrences === null) {
		return "URL rewrite count unavailable; the plan is revalidated before apply.";
	}
	return `${rewrite.estimatedOccurrences} URL replacement(s) planned.`;
}

function conflictLabel(plan: StagingSyncPlan | undefined) {
	if (!plan || plan.conflicts.length === 0) {
		return null;
	}
	return `Blocked: ${plan.conflicts.join(", ")}`;
}

function SyncAction({
	buttonLabel,
	description,
	direction,
	icon,
	pendingLabel,
	siteId,
	title,
	variant,
}: {
	buttonLabel: string;
	description: string;
	direction: Direction;
	icon: ReactNode;
	pendingLabel: string;
	siteId: string;
	title: string;
	variant?: "default" | "outline";
}) {
	const [confirming, setConfirming] = useState(false);
	const planQuery = useQuery(stagingSyncPlanQuery(siteId, direction));
	const apply = useMutation(orpc.stagingSyncApplyPlan.mutationOptions());
	const { start, isRunning } = useOperations();
	const plan = planQuery.data;
	const jobKind =
		direction === "refreshFromProd" ? "refresh" : "stagingPushToLive";
	const running = apply.isPending || isRunning(siteId, jobKind);
	const blocked = !plan?.canApply || planQuery.isError;

	async function applyPlan() {
		if (!plan) {
			return;
		}
		try {
			const result = await apply.mutateAsync({
				direction,
				planId: plan.planId,
				siteId,
			});
			start({
				jobId: result.jobId,
				kind: jobKind,
				siteId,
				title:
					direction === "refreshFromProd"
						? "Copying live to staging..."
						: "Publishing staging to live...",
			});
			setConfirming(false);
		} catch {
			toast.error("The sync plan could not be applied. Refresh and try again.");
		}
	}

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border p-4">
			<div className="flex items-start gap-3">
				<span aria-hidden className="mt-0.5 text-muted-foreground">
					{icon}
				</span>
				<div className="grid gap-1">
					<span className="font-medium text-sm">{title}</span>
					<span className="text-muted-foreground text-sm">{description}</span>
				</div>
			</div>
			<div className="grid gap-2 rounded-md bg-muted px-3 py-2 text-xs">
				<span className="text-muted-foreground">
					{planQuery.isLoading ? "Building dry-run plan..." : countLabel(plan)}
				</span>
				{plan?.backup.required ? (
					<span className="flex items-start gap-2 text-muted-foreground">
						<ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
						Live backup is required before any change.
					</span>
				) : null}
				{conflictLabel(plan) ? (
					<span className="font-medium text-destructive">
						{conflictLabel(plan)}
					</span>
				) : null}
			</div>
			<Button
				className="self-start"
				disabled={running || blocked || planQuery.isLoading}
				onClick={() => setConfirming(true)}
				variant={variant}
			>
				{running ? pendingLabel : buttonLabel}
			</Button>
			<SafetyConfirm
				confirmLabel={buttonLabel}
				consequence={
					plan?.urlRewrite.preview ??
					"The plan is revalidated against the current server state before the job starts."
				}
				onConfirm={applyPlan}
				onOpenChange={setConfirming}
				open={confirming}
				reversible={direction === "refreshFromProd"}
				title={title}
			/>
		</div>
	);
}

function NoStagingCard({ onAdd }: { onAdd: () => void }) {
	return (
		<Card>
			<CardContent className="flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
				<div className="grid gap-1">
					<span className="font-medium text-sm">No staging site yet</span>
					<span className="max-w-prose text-muted-foreground text-sm">
						Staging is a private, search-engine-hidden copy of this site. Add
						one to test plugin updates, theme changes, or content before they go
						live.
					</span>
				</div>
				<Button onClick={onAdd}>Add staging</Button>
			</CardContent>
		</Card>
	);
}

export function StagingSyncCard({
	noindex,
	onAdd,
	siteId,
	url,
}: {
	noindex: boolean;
	onAdd: () => void;
	siteId: string;
	url: string | null;
}) {
	if (!url) {
		return <NoStagingCard onAdd={onAdd} />;
	}
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					{url}
					{noindex ? <Badge variant="outline">noindex</Badge> : null}
				</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-3 sm:grid-cols-2">
				<SyncAction
					buttonLabel="Copy live to staging"
					description="Overwrite staging with a fresh live database and files."
					direction="refreshFromProd"
					icon={<ArrowDownToLine className="size-5" />}
					pendingLabel="Copying..."
					siteId={siteId}
					title="Refresh staging from live"
				/>
				<SyncAction
					buttonLabel="Publish staging to live"
					description="Replace live plugins, themes, and mu-plugins with the tested staging files."
					direction="pushFilesToLive"
					icon={<ArrowUpFromLine className="size-5" />}
					pendingLabel="Publishing..."
					siteId={siteId}
					title="Publish staging to live"
					variant="outline"
				/>
			</CardContent>
		</Card>
	);
}
