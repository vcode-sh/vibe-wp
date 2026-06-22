import { Checkbox } from "@control-panel/ui/components/checkbox";
import { Label } from "@control-panel/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
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
 * domain (or slug) exactly, plus an explicit purge checkbox to also delete all
 * data and backups. Admin-only on the server (adminProcedure).
 */
export function RemoveSiteCard({
	siteId,
	confirmText,
}: {
	siteId: string;
	confirmText: string;
}) {
	const navigate = useNavigate();
	const { start } = useOperations();
	const remove = useMutation(orpc.removeSite.mutationOptions());
	const [open, setOpen] = useState(false);
	const [typed, setTyped] = useState("");
	const [purge, setPurge] = useState(false);

	const matches =
		typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

	function reset() {
		setTyped("");
		setPurge(false);
	}

	async function handleRemove() {
		if (!matches) {
			return;
		}
		try {
			const result = await remove.mutateAsync({ siteId, purge });
			start({
				jobId: result.jobId,
				title: `Remove ${confirmText}`,
				kind: "removeSite",
				siteId,
			});
			setOpen(false);
			reset();
			navigate({ to: "/sites" });
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
						deletes all of its data and backups. Admin access required.
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
									Also delete all data and backups (purge)
								</span>
								<span className="text-muted-foreground text-xs">
									Irreversible. Local and off-site backups are deleted too.
								</span>
							</span>
						</Label>
					</div>

					<DialogFooter>
						<Button onClick={() => setOpen(false)} variant="outline">
							Cancel
						</Button>
						<Button
							disabled={!matches || remove.isPending}
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
