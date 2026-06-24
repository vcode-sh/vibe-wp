import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { InsightsPlugin, InsightsTheme } from "@/data/types";
import { authClient } from "@/lib/auth-client";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

type WpKind = "plugin" | "theme";
type Row = InsightsPlugin | InsightsTheme;

/** Mutations that return { jobId } and stream into the operations tray. */
function useRowMutations() {
	return {
		pluginActivate: useMutation(orpc.pluginActivate.mutationOptions()),
		pluginDeactivate: useMutation(orpc.pluginDeactivate.mutationOptions()),
		pluginUpdate: useMutation(orpc.pluginUpdate.mutationOptions()),
		pluginDelete: useMutation(orpc.pluginDelete.mutationOptions()),
		pluginAutoUpdate: useMutation(orpc.pluginAutoUpdate.mutationOptions()),
		themeActivate: useMutation(orpc.themeActivate.mutationOptions()),
		themeUpdate: useMutation(orpc.themeUpdate.mutationOptions()),
		themeDelete: useMutation(orpc.themeDelete.mutationOptions()),
		themeAutoUpdate: useMutation(orpc.themeAutoUpdate.mutationOptions()),
		safeUpdate: useMutation(orpc.safeUpdate.mutationOptions()),
	};
}

function isMutable(status: string): boolean {
	// must-use / drop-in plugins cannot be activated/deactivated/deleted via wp-cli.
	return status !== "must-use" && status !== "dropin";
}

export function RowActions({
	siteId,
	kind,
	row,
}: {
	siteId: string;
	kind: WpKind;
	row: Row;
}) {
	const { start } = useOperations();
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";
	const m = useRowMutations();
	const [confirmDelete, setConfirmDelete] = useState(false);

	const slug = row.slug;
	const updatable = row.update_available;
	const active = row.status === "active";
	const mutable = isMutable(row.status);

	async function run(
		mutateAsync: (i: { siteId: string; slug: string }) => Promise<{
			jobId: string;
		}>,
		title: string,
		errMsg: string
	) {
		try {
			const r = await mutateAsync({ siteId, slug });
			start({ jobId: r.jobId, title, kind: `wp:${kind}`, siteId });
		} catch {
			toast.error(errMsg);
		}
	}

	async function runSafe() {
		try {
			const r = await m.safeUpdate.mutateAsync({
				siteId,
				target: { kind, slug },
			});
			start({
				jobId: r.jobId,
				title: `Safe-updating ${slug}`,
				kind: "safeUpdate",
				siteId,
			});
		} catch {
			toast.error("Failed to start safe-update.");
		}
	}

	async function toggleAuto() {
		const enabled = !(row.auto_update === true);
		const mut = kind === "plugin" ? m.pluginAutoUpdate : m.themeAutoUpdate;
		try {
			const r = await mut.mutateAsync({ siteId, slug, enabled });
			start({
				jobId: r.jobId,
				title: `${enabled ? "Enabling" : "Disabling"} auto-update for ${slug}`,
				kind: `wp:${kind}`,
				siteId,
			});
		} catch {
			toast.error("Failed to change auto-update.");
		}
	}

	const updateMut = kind === "plugin" ? m.pluginUpdate : m.themeUpdate;
	const deleteMut = kind === "plugin" ? m.pluginDelete : m.themeDelete;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button size="icon" variant="ghost">
							<MoreHorizontal className="size-4" />
							<span className="sr-only">Actions for {slug}</span>
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					{updatable ? (
						<>
							<DropdownMenuItem
								onClick={() =>
									run(
										updateMut.mutateAsync,
										`Updating ${slug}`,
										"Failed to start update."
									)
								}
							>
								Update
							</DropdownMenuItem>
							<DropdownMenuItem onClick={runSafe}>
								Update safely
							</DropdownMenuItem>
							<DropdownMenuSeparator />
						</>
					) : null}

					{kind === "plugin" && mutable ? (
						<DropdownMenuItem
							onClick={() =>
								run(
									active
										? m.pluginDeactivate.mutateAsync
										: m.pluginActivate.mutateAsync,
									`${active ? "Deactivating" : "Activating"} ${slug}`,
									"Failed to start the action."
								)
							}
						>
							{active ? "Deactivate" : "Activate"}
						</DropdownMenuItem>
					) : null}

					{kind === "theme" && !active ? (
						<DropdownMenuItem
							onClick={() =>
								run(
									m.themeActivate.mutateAsync,
									`Activating ${slug}`,
									"Failed to start the action."
								)
							}
						>
							Activate
						</DropdownMenuItem>
					) : null}

					<DropdownMenuItem onClick={toggleAuto}>
						{row.auto_update === true
							? "Turn off auto-updates"
							: "Turn on auto-updates"}
					</DropdownMenuItem>

					{isAdmin && mutable && !(kind === "theme" && active) ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								onClick={() => setConfirmDelete(true)}
								variant="destructive"
							>
								Delete
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete {row.name}?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes the {kind} from the site. It cannot be reinstalled
							from the panel — only from wp-admin. The site is not backed up
							first.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmDelete(false);
								run(
									deleteMut.mutateAsync,
									`Deleting ${slug}`,
									"Failed to start delete."
								);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
