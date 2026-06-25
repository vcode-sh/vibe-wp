import { useMutation } from "@tanstack/react-query";
import { Power, PowerOff, RefreshCw, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { siteOverviewQuery, siteStatusQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { useInvalidateOnJobDone } from "@/lib/operations/use-invalidate-on-job-done";
import { orpc } from "@/lib/orpc/client";

// Role gating: `role` is stored as an additionalFields on the better-auth user
// but the web authClient is created without inferAdditionalFields, so it is not
// typed on session.user client-side. Controls are therefore rendered for all
// authenticated users. The server enforces roles: operatorProcedure rejects
// viewers, adminProcedure rejects both viewers and operators. Errors surface
// via toast. If inferAdditionalFields is wired up in the future, replace the
// `true` constants below with real role checks.

interface SiteControlsProps {
	siteId: string;
}

export function SiteControls({ siteId }: SiteControlsProps) {
	const { start, isRunning } = useOperations();
	const [confirmDown, setConfirmDown] = useState(false);
	// Start/Stop/Restart/Flush change the running state — refresh the status dot
	// and overview hero when the job finishes so they don't show a stale verdict
	// (e.g. a green dot after a Stop).
	useInvalidateOnJobDone(
		siteId,
		["up", "down", "restart", "cacheFlush"],
		[siteStatusQuery(siteId).queryKey, siteOverviewQuery(siteId).queryKey]
	);

	const lifecycleUp = useMutation(orpc.lifecycleUp.mutationOptions());
	const lifecycleRestart = useMutation(orpc.lifecycleRestart.mutationOptions());
	const lifecycleCacheFlush = useMutation(
		orpc.lifecycleCacheFlush.mutationOptions()
	);
	const lifecycleDown = useMutation(orpc.lifecycleDown.mutationOptions());

	const upRunning = isRunning(siteId, "up");
	const restartRunning = isRunning(siteId, "restart");
	const cacheFlushRunning = isRunning(siteId, "cacheFlush");
	const downRunning = isRunning(siteId, "down");
	const anyRunning =
		upRunning || restartRunning || cacheFlushRunning || downRunning;

	async function handleUp() {
		try {
			const result = await lifecycleUp.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: `Starting ${siteId}`,
				kind: "up",
				siteId,
			});
		} catch {
			toast.error("Failed to start the site.");
		}
	}

	async function handleRestart() {
		try {
			const result = await lifecycleRestart.mutateAsync({ siteId });
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

	async function handleCacheFlush() {
		try {
			const result = await lifecycleCacheFlush.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: `Flushing cache for ${siteId}`,
				kind: "cacheFlush",
				siteId,
			});
		} catch {
			toast.error("Failed to flush the cache.");
		}
	}

	async function handleDown() {
		try {
			const result = await lifecycleDown.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: `Stopping ${siteId}`,
				kind: "down",
				siteId,
			});
			setConfirmDown(false);
		} catch {
			toast.error("Failed to stop the site. Admin role required.");
			setConfirmDown(false);
		}
	}

	return (
		<>
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">Site controls</CardTitle>
					<CardDescription>
						Lifecycle operations for this site. Stop requires admin access.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex flex-wrap gap-2">
						<Button
							disabled={anyRunning || lifecycleUp.isPending}
							onClick={handleUp}
							size="sm"
							variant="outline"
						>
							<Power className="mr-1.5 size-3.5" />
							Start
						</Button>

						<Button
							disabled={anyRunning || lifecycleRestart.isPending}
							onClick={handleRestart}
							size="sm"
							variant="outline"
						>
							<RefreshCw className="mr-1.5 size-3.5" />
							Restart
						</Button>

						<Button
							disabled={anyRunning || lifecycleCacheFlush.isPending}
							onClick={handleCacheFlush}
							size="sm"
							variant="outline"
						>
							<Zap className="mr-1.5 size-3.5" />
							Flush cache
						</Button>

						<Button
							disabled={anyRunning || lifecycleDown.isPending}
							onClick={() => setConfirmDown(true)}
							size="sm"
							variant="destructive"
						>
							<PowerOff className="mr-1.5 size-3.5" />
							Stop
						</Button>
					</div>
				</CardContent>
			</Card>

			<SafetyConfirm
				confirmLabel="Stop the site"
				consequence={`This brings down all containers for ${siteId}. The site will be unavailable until restarted. You need admin access.`}
				onConfirm={handleDown}
				onOpenChange={(open) => !open && setConfirmDown(false)}
				open={confirmDown}
				reversible
				title="Stop this site"
			/>
		</>
	);
}
