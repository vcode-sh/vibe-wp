import { useMutation, useQuery } from "@tanstack/react-query";
import { File, Folder, Table2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SafetyConfirm } from "@/components/patterns/safety-confirm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { backupContentsQuery } from "@/data/queries";
import type { BackupContents, BackupFileEntry } from "@/data/types";
import { authClient } from "@/lib/auth-client";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

interface PendingItem {
	kind: "file" | "table";
	name: string;
}

function formatBytes(bytes: number): string {
	if (bytes <= 0) {
		return "—";
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1_048_576) {
		return `${Math.round(bytes / 1024)} KB`;
	}
	return `${Math.round((bytes / 1_048_576) * 10) / 10} MB`;
}

/** Group files by their top-level directory for a shallow, scannable tree. */
function groupFiles(files: BackupFileEntry[]): [string, BackupFileEntry[]][] {
	const groups = new Map<string, BackupFileEntry[]>();
	for (const f of files) {
		const slash = f.path.indexOf("/");
		const top = slash === -1 ? "(root)" : f.path.slice(0, slash);
		const list = groups.get(top) ?? [];
		list.push(f);
		groups.set(top, list);
	}
	return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function ItemRow({
	label,
	meta,
	icon,
	canRestore,
	onRestore,
}: {
	label: string;
	meta?: string;
	icon: React.ReactNode;
	canRestore: boolean;
	onRestore: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2 py-1 pl-6 text-sm">
			<span className="flex min-w-0 items-center gap-2">
				{icon}
				<span className="truncate" title={label}>
					{label}
				</span>
			</span>
			<span className="flex shrink-0 items-center gap-3">
				{meta ? (
					<span className="text-muted-foreground text-xs">{meta}</span>
				) : null}
				{canRestore ? (
					<Button onClick={onRestore} size="sm" variant="ghost">
						Restore this item…
					</Button>
				) : null}
			</span>
		</div>
	);
}

export function BackupBrowser({
	siteId,
	backupId,
	whenLabel,
	open,
	onOpenChange,
}: {
	siteId: string;
	backupId: string;
	whenLabel: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";
	const { start, isRunning } = useOperations();
	const [pending, setPending] = useState<PendingItem | null>(null);

	const contents = useQuery({
		...backupContentsQuery(siteId, backupId),
		enabled: open,
	});
	const data: BackupContents | undefined = contents.data;
	const grouped = useMemo(() => groupFiles(data?.files ?? []), [data?.files]);

	const restoreItem = useMutation(orpc.restoreBackupItem.mutationOptions());

	async function handleRestoreItem() {
		if (!pending) {
			return;
		}
		try {
			const result = await restoreItem.mutateAsync({
				siteId,
				backupId,
				kind: pending.kind,
				name: pending.name,
			});
			start({
				jobId: result.jobId,
				title: `Restoring ${pending.kind} ${pending.name}`,
				kind: "restoreItem",
				siteId,
			});
			setPending(null);
			onOpenChange(false);
		} catch {
			toast.error("Failed to start item restore.");
		}
	}

	const restoreDisabled = isRunning(siteId, "restoreItem");

	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={open}>
				<DialogContent className="max-w-3xl">
					<DialogHeader>
						<DialogTitle>Browse backup</DialogTitle>
						<DialogDescription>
							{whenLabel} — restore a single file or table.
						</DialogDescription>
					</DialogHeader>

					{contents.isLoading ? (
						<p className="py-8 text-center text-muted-foreground text-sm">
							Reading backup contents…
						</p>
					) : null}
					{contents.isError ? (
						<p className="py-8 text-center text-destructive text-sm">
							Couldn't read this backup's contents.
						</p>
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
								{data.truncated ? (
									<Badge className="mb-2" variant="secondary">
										Listing capped — large file tree
									</Badge>
								) : null}
								<ScrollArea className="h-80 rounded-md border border-border">
									<div className="p-2">
										{grouped.map(([dir, files]) => (
											<div className="mb-2" key={dir}>
												<span className="flex items-center gap-2 font-medium text-sm">
													<Folder className="size-4 text-muted-foreground" />
													{dir}
												</span>
												{files.map((f) => (
													<ItemRow
														canRestore={Boolean(isAdmin) && !restoreDisabled}
														icon={
															<File className="size-3.5 shrink-0 text-muted-foreground" />
														}
														key={f.path}
														label={f.path}
														meta={formatBytes(f.bytes)}
														onRestore={() =>
															setPending({ kind: "file", name: f.path })
														}
													/>
												))}
											</div>
										))}
										{data.files.length === 0 ? (
											<p className="p-4 text-center text-muted-foreground text-sm">
												No files in this backup.
											</p>
										) : null}
									</div>
								</ScrollArea>
							</TabsContent>

							<TabsContent value="tables">
								<ScrollArea className="h-80 rounded-md border border-border">
									<div className="p-2">
										{data.tables.map((t) => (
											<ItemRow
												canRestore={Boolean(isAdmin) && !restoreDisabled}
												icon={
													<Table2 className="size-3.5 shrink-0 text-muted-foreground" />
												}
												key={t}
												label={t}
												onRestore={() => setPending({ kind: "table", name: t })}
											/>
										))}
										{data.tables.length === 0 ? (
											<p className="p-4 text-center text-muted-foreground text-sm">
												No tables in this backup.
											</p>
										) : null}
									</div>
								</ScrollArea>
							</TabsContent>
						</Tabs>
					) : null}

					{data && !isAdmin ? (
						<p className="text-muted-foreground text-xs">
							Restoring a single item requires an admin role.
						</p>
					) : null}
				</DialogContent>
			</Dialog>

			<SafetyConfirm
				confirmLabel="Restore this item"
				consequence={
					pending
						? `This replaces the live ${pending.kind} "${pending.name}" with the copy from this backup. We back up the current state first.`
						: ""
				}
				onConfirm={handleRestoreItem}
				onOpenChange={(o) => !o && setPending(null)}
				open={pending !== null}
				reversible
				title={`Restore a ${pending?.kind ?? "item"}`}
			/>
		</>
	);
}
