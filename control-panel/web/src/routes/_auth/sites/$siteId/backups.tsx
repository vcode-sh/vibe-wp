import { Badge } from "@control-panel/ui/components/badge";
import { Button } from "@control-panel/ui/components/button";
import { Skeleton } from "@control-panel/ui/components/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@control-panel/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { OperationRunner } from "@/components/patterns/operation-runner";
import { PageHeader } from "@/components/patterns/page-header";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { TopBar } from "@/components/top-bar";
import { relativeTime } from "@/data/derive";
import { backupsQuery } from "@/data/queries";
import type { BackupRecord } from "@/data/types";

export const Route = createFileRoute("/_auth/sites/$siteId/backups")({
	component: BackupsPage,
});

function BackupsPage() {
	const { siteId } = Route.useParams();
	const backups = useQuery(backupsQuery(siteId));
	const now = new Date();
	const [restoring, setRestoring] = useState<BackupRecord | null>(null);
	const [runnerOpen, setRunnerOpen] = useState(false);

	return (
		<>
			<TopBar crumbs={[siteId, "Backups"]} />
			<main className="mx-auto grid w-full max-w-6xl gap-4 p-6">
				<PageHeader
					actions={
						<Button onClick={() => setRunnerOpen(true)}>Back up now</Button>
					}
					subtitle="Local and off-site copies, retention and restore."
					title="Backups"
				/>
				{backups.isLoading || !backups.data ? (
					<Skeleton className="h-40 w-full" />
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>When</TableHead>
								<TableHead>Size</TableHead>
								<TableHead>Location</TableHead>
								<TableHead>Verified</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{backups.data.map((b) => (
								<TableRow key={b.id}>
									<TableCell>{relativeTime(b.whenISO, now)}</TableCell>
									<TableCell>{b.sizeMB} MB</TableCell>
									<TableCell>
										<Badge variant="outline">
											{b.location === "offsite" ? "off-site" : "local"}
										</Badge>
									</TableCell>
									<TableCell>{b.verified ? "✓" : "—"}</TableCell>
									<TableCell className="text-right">
										<Button
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
				)}
			</main>

			<SafetyConfirm
				confirmLabel="Restore this backup"
				consequence={
					restoring
						? `This replaces the live site with the backup from ${relativeTime(restoring.whenISO, now)}. We back up the current state first.`
						: ""
				}
				onConfirm={() => {
					toast.success("Restore: starting (mock)…");
					setRestoring(null);
				}}
				onOpenChange={(open) => !open && setRestoring(null)}
				open={restoring !== null}
				reversible
				title="Restore a backup"
			/>

			<OperationRunner
				lines={[
					"Creating database dump…",
					"Archiving wp-content…",
					"Uploading to off-site (R2)…",
					"Verifying archive…",
				]}
				onOpenChange={setRunnerOpen}
				open={runnerOpen}
				title="Backing up acme-blog"
			/>
		</>
	);
}
