import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FileList, TableList } from "@/components/backups/backup-item-list";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { backupContentsQuery } from "@/data/queries";
import type { BackupContents, BackupRecord } from "@/data/types";
import { authClient } from "@/lib/auth-client";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

interface PendingItem {
	kind: "file" | "table";
	name: string;
}

type RestorePhase = "running" | "succeeded" | "failed" | "canceled";

interface RestoreState {
	item: PendingItem;
	phase: RestorePhase;
}

function consequenceFor(item: PendingItem): string {
	if (item.kind === "table") {
		return `This replaces the live database table "${item.name}" with the copy stored in this backup. Before anything changes, we save the current table to a pre-restore safety copy inside the backup folder, so you can undo it. Other tables and your files are untouched.`;
	}
	return `This replaces the live file wp-content/${item.name} with the copy stored in this backup. Before anything changes, we save the current file to a pre-restore safety copy, so you can undo it. Nothing else on the site is touched.`;
}

export function BackupBrowser({
	siteId,
	backupId,
	location,
	whenLabel,
	open,
	onOpenChange,
}: {
	siteId: string;
	backupId: string;
	location: BackupRecord["location"];
	whenLabel: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";
	const { start, isRunning, getStatus } = useOperations();
	const [pending, setPending] = useState<PendingItem | null>(null);
	const [restore, setRestore] = useState<RestoreState | null>(null);
	const handledRef = useRef(false);

	const contents = useQuery({
		...backupContentsQuery(siteId, backupId),
		enabled: open,
	});
	const data: BackupContents | undefined = contents.data;

	const restoreItem = useMutation(orpc.restoreBackupItem.mutationOptions());
	const restoreDisabled = isRunning(siteId, "restoreItem");
	const canRestore = Boolean(isAdmin) && !restoreDisabled;

	// Watch the item-restore job to its terminal state so the operator gets a
	// clear, honest success/failure result instead of the dialog vanishing.
	useEffect(() => {
		if (restore?.phase !== "running" || handledRef.current) {
			return;
		}
		const status = getStatus(siteId, "restoreItem");
		if (status === null) {
			return;
		}
		handledRef.current = true;
		// getStatus only ever returns a TERMINAL status (succeeded/failed/canceled),
		// which is exactly our terminal RestorePhase set — adopt it directly.
		const phase = status as RestorePhase;
		setRestore((prev) => (prev ? { ...prev, phase } : prev));
		if (phase === "succeeded") {
			toast.success("Item restored from the backup.");
		} else {
			toast.error(
				phase === "canceled"
					? "Restore was canceled."
					: "Restore failed — the live item was left unchanged."
			);
		}
	}, [restore, getStatus, siteId]);

	async function handleRestoreItem() {
		if (!pending) {
			return;
		}
		const item = pending;
		try {
			const result = await restoreItem.mutateAsync({
				siteId,
				backupId,
				kind: item.kind,
				name: item.name,
			});
			handledRef.current = false;
			setRestore({ item, phase: "running" });
			start({
				jobId: result.jobId,
				title: `Restoring ${item.kind} ${item.name}`,
				kind: "restoreItem",
				siteId,
			});
			setPending(null);
		} catch {
			toast.error("Failed to start item restore.");
		}
	}

	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={open}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Browse backup</DialogTitle>
						<DialogDescription>
							From {whenLabel} (
							{location === "both" ? "local + off-site" : location}). Pick a
							single file or table to restore — the rest of your site is left
							exactly as it is.
						</DialogDescription>
					</DialogHeader>

					{contents.isLoading ? (
						<p className="py-8 text-center text-muted-foreground text-sm">
							Reading what's inside this backup…
						</p>
					) : null}
					{contents.isError ? (
						<div className="py-8 text-center text-sm">
							<p className="text-destructive">
								Couldn't read this backup's contents.
							</p>
							<Button
								className="mt-2"
								onClick={() => contents.refetch()}
								size="sm"
								variant="outline"
							>
								Try again
							</Button>
						</div>
					) : null}

					{data ? (
						<Tabs className="w-full" defaultValue="files">
							<TabsList>
								<TabsTrigger value="files">
									Files ({data.files.length}
									{data.truncated ? "+" : ""})
								</TabsTrigger>
								<TabsTrigger value="tables">
									Tables ({data.tables.length})
								</TabsTrigger>
							</TabsList>

							<TabsContent value="files">
								<FileList
									canRestore={canRestore}
									files={data.files}
									onRestore={(name) => setPending({ kind: "file", name })}
									truncated={data.truncated}
								/>
							</TabsContent>

							<TabsContent value="tables">
								<TableList
									canRestore={canRestore}
									onRestore={(name) => setPending({ kind: "table", name })}
									tables={data.tables}
								/>
							</TabsContent>
						</Tabs>
					) : null}

					{restore?.phase === "running" ? (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<span className="size-2 animate-pulse rounded-full bg-warning" />
							Restoring {restore.item.kind} "{restore.item.name}"… follow it in
							the operations tray.
						</p>
					) : null}
					{restore?.phase === "succeeded" ? (
						<p className="flex items-center gap-2 text-sm">
							<CheckCircle2 className="size-4 text-success" />
							<span className="text-success">
								Restored {restore.item.kind} "{restore.item.name}". The previous
								version was saved to a pre-restore safety copy.
							</span>
						</p>
					) : null}
					{restore?.phase === "failed" || restore?.phase === "canceled" ? (
						<p className="flex items-center gap-2 text-sm">
							<XCircle className="size-4 text-destructive" />
							<span className="text-destructive">
								Restore of {restore.item.kind} "{restore.item.name}" did not
								complete — your live site was left unchanged.
							</span>
						</p>
					) : null}

					{data && !isAdmin ? (
						<p className="text-muted-foreground text-xs">
							Viewing is open to your role, but restoring a single item needs an
							admin. Ask an admin to restore, or browse to confirm what's
							inside.
						</p>
					) : null}
				</DialogContent>
			</Dialog>

			<SafetyConfirm
				confirmLabel={`Restore this ${pending?.kind ?? "item"}`}
				consequence={pending ? consequenceFor(pending) : ""}
				onConfirm={handleRestoreItem}
				onOpenChange={(o) => !o && setPending(null)}
				open={pending !== null}
				reversible
				title={`Restore one ${pending?.kind ?? "item"}`}
			/>
		</>
	);
}
