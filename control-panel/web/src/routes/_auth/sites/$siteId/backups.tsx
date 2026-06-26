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
import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BackupBrowser } from "@/components/backups/backup-browser";
import { BackupMenu } from "@/components/backups/backup-menu";
import { OffsiteVerifiedBanner } from "@/components/backups/offsite-verified-banner";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/data/derive";
import { backupsQuery, offsiteVerifiedQuery } from "@/data/queries";
import type { BackupRecord } from "@/data/types";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

export const Route = createFileRoute("/_auth/sites/$siteId/backups")({
	component: BackupsPage,
});

function locationLabel(loc: BackupRecord["location"]): string {
	if (loc === "offsite") {
		return "off-site";
	}
	if (loc === "both") {
		return "local + off-site";
	}
	return "local";
}

/** True when this backup has an off-site (R2) copy that Verify can prove good. */
function hasOffsiteCopy(loc: BackupRecord["location"]): boolean {
	return loc === "offsite" || loc === "both";
}

function BackupsPage() {
	const { siteId } = Route.useParams();
	const queryClient = useQueryClient();
	const { start, isRunning, getStatus } = useOperations();
	const backupRunning = isRunning(siteId, "backup");
	const verifyRunning = isRunning(siteId, "backupVerify");
	const backups = useQuery({
		...backupsQuery(siteId),
		refetchInterval: backupRunning ? 4000 : false,
	});
	const now = new Date();
	const [restoring, setRestoring] = useState<BackupRecord | null>(null);
	const [browsing, setBrowsing] = useState<BackupRecord | null>(null);
	const [verifying, setVerifying] = useState(false);

	const runBackup = useMutation(orpc.backupsRun.mutationOptions());
	const restore = useMutation(orpc.backupsRestore.mutationOptions());
	const verify = useMutation(orpc.backupsVerify.mutationOptions());
	const verifyHandled = useRef(false);

	// When a verify job settles, refresh the off-site badge + the backups list so
	// the operator immediately sees the proven result. Success/failure surfaced.
	useEffect(() => {
		if (!verifying || verifyHandled.current) {
			return;
		}
		const status = getStatus(siteId, "backupVerify");
		if (status === null) {
			return;
		}
		verifyHandled.current = true;
		setVerifying(false);
		queryClient.invalidateQueries({
			queryKey: offsiteVerifiedQuery(siteId).queryKey,
		});
		queryClient.invalidateQueries({ queryKey: backupsQuery(siteId).queryKey });
		if (status === "succeeded") {
			toast.success("Backup verified — it is structurally restorable.");
		} else {
			toast.error(
				status === "canceled"
					? "Verification was canceled."
					: "Verification failed — this copy may not be restorable."
			);
		}
	}, [verifying, getStatus, siteId, queryClient]);

	async function handleBackup(destination: "local" | "both") {
		try {
			const result = await runBackup.mutateAsync({ siteId, destination });
			start({
				jobId: result.jobId,
				title: `Backing up ${siteId}`,
				kind: "backup",
				siteId,
			});
		} catch {
			toast.error("Failed to start backup.");
		}
	}

	async function handleRestore() {
		if (!restoring) {
			return;
		}
		try {
			const result = await restore.mutateAsync({
				siteId,
				backupId: restoring.id,
			});
			start({
				jobId: result.jobId,
				title: `Restoring ${siteId}`,
				kind: "restore",
				siteId,
			});
			setRestoring(null);
		} catch {
			toast.error("Failed to start restore.");
		}
	}

	async function handleVerify(backup: BackupRecord) {
		try {
			const result = await verify.mutateAsync({ siteId, backupId: backup.id });
			verifyHandled.current = false;
			setVerifying(true);
			start({
				jobId: result.jobId,
				title: `Verifying backup from ${relativeTime(backup.whenISO, now)}`,
				kind: "backupVerify",
				siteId,
			});
		} catch {
			toast.error("Failed to start verification.");
		}
	}

	return (
		<>
			<TopBar crumbs={[siteId, "Backups"]} />
			<div className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<BackupMenu
							disabled={runBackup.isPending || backupRunning}
							onSelect={handleBackup}
							siteId={siteId}
						/>
					}
					subtitle="Local and off-site copies, retention and restore."
					title="Backups"
				/>
				<OffsiteVerifiedBanner siteId={siteId} />
				<QueryBoundary
					errorMessage="Couldn't load the backups."
					hasData={Boolean(backups.data)}
					isError={backups.isError}
					isLoading={backups.isLoading}
					onRetry={() => backups.refetch()}
					skeletonClassName="h-40 w-full"
				>
					{backups.data ? (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>When</TableHead>
										<TableHead>Size</TableHead>
										<TableHead>Location</TableHead>
										<TableHead>Verified</TableHead>
										<TableHead>
											<span className="sr-only">Actions</span>
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{backups.data.map((b) => (
										<TableRow key={b.id}>
											<TableCell>{relativeTime(b.whenISO, now)}</TableCell>
											<TableCell>
												{b.sizeMB > 0 ? `${b.sizeMB} MB` : "—"}
											</TableCell>
											<TableCell>
												<Badge variant="outline">
													{locationLabel(b.location)}
												</Badge>
											</TableCell>
											<TableCell>
												{b.verified ? (
													<span className="flex items-center gap-1 text-success">
														<CheckCircle2 className="size-3.5" />
														<span className="sr-only">Verified</span>
													</span>
												) : (
													<span className="text-muted-foreground">
														—<span className="sr-only">Not verified</span>
													</span>
												)}
											</TableCell>
											<TableCell className="text-right">
												<Button
													onClick={() => setBrowsing(b)}
													size="sm"
													variant="ghost"
												>
													Browse…
												</Button>
												<Button
													disabled={
														verifyRunning || !hasOffsiteCopy(b.location)
													}
													onClick={() => handleVerify(b)}
													size="sm"
													title={
														hasOffsiteCopy(b.location)
															? "Prove the off-site copy can be restored"
															: "No off-site copy to verify for this backup"
													}
													variant="ghost"
												>
													{verifyRunning ? "Verifying…" : "Verify"}
												</Button>
												<Button
													disabled={isRunning(siteId, "restore")}
													onClick={() => setRestoring(b)}
													size="sm"
													title={
														isRunning(siteId, "restore")
															? "A restore is already running."
															: "Restore the whole site from this backup"
													}
													variant="ghost"
												>
													Restore…
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
							{backups.data.length === 0 ? (
								<div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground text-sm">
									No backups yet. Use 'Back up now' to create the first one.
								</div>
							) : null}
						</>
					) : null}
				</QueryBoundary>
			</div>

			<SafetyConfirm
				confirmLabel="Restore this backup"
				consequence={
					restoring
						? `This replaces your entire live site with the backup from ${relativeTime(restoring.whenISO, now)} — every file and database table. A fresh backup of the current state is taken first, so you can undo it.`
						: ""
				}
				onConfirm={handleRestore}
				onOpenChange={(open) => !open && setRestoring(null)}
				open={restoring !== null}
				reversible
				title="Restore the whole site"
			/>

			{browsing ? (
				<BackupBrowser
					backupId={browsing.id}
					location={browsing.location}
					onOpenChange={(open) => !open && setBrowsing(null)}
					open={browsing !== null}
					siteId={siteId}
					whenLabel={relativeTime(browsing.whenISO, now)}
				/>
			) : null}
		</>
	);
}
