/**
 * ServerMaintenanceCard — two admin-only server maintenance actions:
 *
 *   1. Download support bundle — a one-click, REDACTED diagnostics archive
 *      (recent panel + site logs, doctor & security status, versions, non-secret
 *      config). The procedure returns base64 of a gzip tar; we decode it to a
 *      Blob and trigger a browser download (mirrors logs.tsx downloadLogs). All
 *      passwords, API keys, salts and tokens are stripped server-side.
 *
 *   2. Update Vibe WP — behind a confirm dialog, runs `bin/panel update` (git
 *      pull + rebuild + restart) as a streamed job surfaced in the operations
 *      tray. The panel briefly restarts, so the operator may be signed out for a
 *      few seconds; the streamed log survives the restart (journal-backed) and
 *      the tray reconnects to report completion.
 *
 * Both are gated on `session.user.role === "admin"`; the card renders nothing for
 * non-admins (the procedures are adminProcedure too, so this is UX, not the
 * security boundary).
 */

import { useMutation } from "@tanstack/react-query";
import { DownloadCloud, RefreshCw } from "lucide-react";
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
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

const PANEL_UPDATE_KIND = "panel-update";

/** Decode the base64 archive into a Blob and trigger a browser download. */
function saveBundle(base64: string, filename: string): void {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	const url = URL.createObjectURL(
		new Blob([bytes], { type: "application/gzip" })
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

export function ServerMaintenanceCard() {
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user.role === "admin";
	const { start, isRunning } = useOperations();
	const [confirmUpdate, setConfirmUpdate] = useState(false);

	const bundle = useMutation(orpc.supportBundleDownload.mutationOptions());
	const update = useMutation(orpc.serverUpdateStack.mutationOptions());

	if (!isAdmin) {
		return null;
	}

	const updating = isRunning("server", PANEL_UPDATE_KIND);

	async function handleDownload() {
		try {
			const res = await bundle.mutateAsync({});
			saveBundle(res.base64, res.filename);
			toast.success("Support bundle downloaded.");
		} catch {
			toast.error("Couldn't generate the support bundle. Please try again.");
		}
	}

	async function handleUpdate() {
		setConfirmUpdate(false);
		try {
			const result = await update.mutateAsync({});
			start({
				jobId: result.jobId,
				title: "Updating Vibe WP…",
				kind: PANEL_UPDATE_KIND,
				siteId: "server",
			});
		} catch {
			toast.error("Couldn't start the update. Please try again.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Diagnostics &amp; maintenance</CardTitle>
				<CardDescription>
					Tools for troubleshooting and keeping Vibe WP up to date.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-6">
				<div className="grid gap-2">
					<div className="font-medium text-sm">Support bundle</div>
					<p className="text-muted-foreground text-sm">
						Downloads a single file with recent panel &amp; site logs, the
						doctor &amp; security checks, version info, and non-secret
						configuration. All passwords, API keys, salts and tokens are
						stripped out, so it is safe to share when asking for help.
					</p>
					<div>
						<Button
							disabled={bundle.isPending}
							onClick={handleDownload}
							variant="outline"
						>
							<DownloadCloud aria-hidden className="size-4" />
							{bundle.isPending ? "Preparing…" : "Download support bundle"}
						</Button>
					</div>
				</div>

				<div className="grid gap-2 border-border border-t pt-6">
					<div className="font-medium text-sm">Update Vibe WP</div>
					<p className="text-muted-foreground text-sm">
						Pulls the latest code, rebuilds the panel and stack, and briefly
						restarts the panel. You may be signed out for a few seconds — that
						is normal. The progress appears in the operations tray.
					</p>
					<div>
						<Button
							disabled={update.isPending || updating}
							onClick={() => setConfirmUpdate(true)}
							variant="outline"
						>
							<RefreshCw
								aria-hidden
								className={`size-4 ${updating ? "animate-spin" : ""}`}
							/>
							{updating ? "Updating…" : "Update Vibe WP"}
						</Button>
					</div>
				</div>
			</CardContent>

			<AlertDialog onOpenChange={setConfirmUpdate} open={confirmUpdate}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Update Vibe WP now?</AlertDialogTitle>
						<AlertDialogDescription>
							This pulls the latest code, rebuilds the panel and stack, and
							briefly restarts the panel — you may be signed out for a few
							seconds. The update continues in the background even while the
							panel restarts. Continue?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction autoFocus onClick={handleUpdate}>
							Update now
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	);
}
