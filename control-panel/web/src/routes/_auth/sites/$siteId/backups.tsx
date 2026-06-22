import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@control-panel/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BackupMenu } from "@/components/backups/backup-menu";
import { PageHeader } from "@/components/patterns/page-header";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/data/derive";
import { backupsQuery } from "@/data/queries";
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

function BackupsPage() {
	const { siteId } = Route.useParams();
	const { start, isRunning } = useOperations();
	const backupRunning = isRunning(siteId, "backup");
	const backups = useQuery({
		...backupsQuery(siteId),
		refetchInterval: backupRunning ? 4000 : false,
	});
	const now = new Date();
	const [restoring, setRestoring] = useState<BackupRecord | null>(null);

	const runBackup = useMutation(orpc.backupsRun.mutationOptions());
	const restore = useMutation(orpc.backupsRestore.mutationOptions());

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
													disabled={isRunning(siteId, "restore")}
													onClick={() => setRestoring(b)}
													size="sm"
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
						? `This replaces the live site with the backup from ${relativeTime(restoring.whenISO, now)}. We back up the current state first.`
						: ""
				}
				onConfirm={handleRestore}
				onOpenChange={(open) => !open && setRestoring(null)}
				open={restoring !== null}
				reversible
				title="Restore a backup"
			/>
		</>
	);
}
