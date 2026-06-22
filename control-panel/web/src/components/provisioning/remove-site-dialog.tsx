import { Checkbox } from "@control-panel/ui/components/checkbox";
import { Label } from "@control-panel/ui/components/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

/**
 * Destructive "Remove site" affordance. The confirm requires typing the site's
 * domain (or slug) exactly, plus an explicit purge checkbox to also delete the
 * local install directory and Docker volumes. Purge does NOT touch off-site
 * (R2) backups. Admin-only on the server (adminProcedure).
 */
export function RemoveSiteCard({
	siteId,
	confirmText,
}: {
	siteId: string;
	confirmText: string;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { start, getStatus } = useOperations();
	const remove = useMutation(orpc.removeSite.mutationOptions());
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [purge, setPurge] = useState(false);
	const [removing, setRemoving] = useState(false);
	const handledRef = useRef(false);

	const matches =
		typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

	function reset() {
		setTyped("");
		setPurge(false);
	}

	// Gate on the remove job's terminal status: only refresh the sites list and
	// navigate away on success; on failure/cancel surface an error and stay.
	// Reads the current status (no transition race) and fires at most once.
	useEffect(() => {
		if (!removing || handledRef.current) {
			return;
		}
		const status = getStatus(siteId, "removeSite");
		if (status === null) {
			return;
		}
		handledRef.current = true;
		setRemoving(false);
		if (status === "succeeded") {
			queryClient.invalidateQueries({
				queryKey: orpc.sitesList.queryOptions().queryKey,
			});
			navigate({ to: "/sites" });
			return;
		}
		const label = status === "canceled" ? "was canceled" : "failed";
		toast.error(`Removing ${confirmText} ${label}.`);
	}, [removing, getStatus, siteId, confirmText, navigate, queryClient]);

	async function handleRemove() {
		if (!matches) {
			return;
		}
		try {
			const result = await remove.mutateAsync({ siteId, purge });
			handledRef.current = false;
			setRemoving(true);
			start({
				jobId: result.jobId,
				title: `Remove ${confirmText}`,
				kind: "removeSite",
				siteId,
			});
			setOpen(false);
			reset();
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Failed to start removing the site."
			);
		}
	}

	return (
		<>
			<Card className="border-destructive/40">
				<CardHeader className="pb-3">
					<CardTitle className="text-base text-destructive">
						Remove this site
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center justify-between gap-3">
					<p className="max-w-prose text-muted-foreground text-sm">
						Tears down this site's containers and configuration. Optionally also
						deletes its local data and Docker volumes. Admin access required.
					</p>
					<Button onClick={() => setOpen(true)} variant="destructive">
						<Trash2 className="mr-1.5 size-3.5" />
						Remove site
					</Button>
				</CardContent>
			</Card>

			<Dialog
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) {
						reset();
					}
				}}
				open={open}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Remove {confirmText}</DialogTitle>
						<DialogDescription>
							This stops and removes the site. To confirm, type{" "}
							<span className="font-mono font-semibold text-foreground">
								{confirmText}
							</span>{" "}
							below.
						</DialogDescription>
					</DialogHeader>

					<div className="grid gap-3">
						<Input
							autoCapitalize="none"
							autoComplete="off"
							onChange={(e) => setTyped(e.target.value)}
							placeholder={confirmText}
							spellCheck={false}
							value={typed}
						/>
						<Label className="items-start gap-2 rounded-md border border-destructive/40 p-3">
							<Checkbox
								checked={purge}
								onCheckedChange={(next) => setPurge(next === true)}
							/>
							<span className="grid gap-0.5">
								<span className="font-medium text-destructive">
									Also delete local data &amp; Docker volumes (purge)
								</span>
								<span className="text-muted-foreground text-xs">
									Irreversible. Deletes the install directory, containers and
									volumes. Off-site (R2) backups are kept — prune them
									separately.
								</span>
							</span>
						</Label>
					</div>

					<DialogFooter>
						<Button onClick={() => setOpen(false)} variant="outline">
							Cancel
						</Button>
						<Button
							disabled={!matches || remove.isPending || removing}
							onClick={handleRemove}
							variant="destructive"
						>
							{purge ? "Remove & purge" : "Remove site"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
