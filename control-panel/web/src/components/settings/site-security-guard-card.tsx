import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteSettingsQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";
import { invalidateSecurityFixSaved } from "@/lib/realtime/immediate-invalidation";

export function SiteSecurityGuardCard({
	siteId,
	initial,
}: {
	initial: { disableXmlRpc: boolean; disallowFileEdit: boolean };
	siteId: string;
}) {
	const qc = useQueryClient();
	const { start } = useOperations();
	const [disableXmlRpc, setDisableXmlRpc] = useState(initial.disableXmlRpc);
	const [disallowFileEdit, setDisallowFileEdit] = useState(
		initial.disallowFileEdit
	);
	const save = useMutation(orpc.siteSecuritySet.mutationOptions());
	const restart = useMutation(orpc.lifecycleRestart.mutationOptions());

	async function triggerRestart() {
		try {
			const result = await restart.mutateAsync({ siteId });
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

	async function handleSave() {
		try {
			const result = await save.mutateAsync({
				siteId,
				disableXmlRpc,
				disallowFileEdit,
			});
			await qc.invalidateQueries(siteSettingsQuery(siteId));
			await invalidateSecurityFixSaved(qc, siteId);
			if (result.restartRequired) {
				toast.success("Site guard saved. Restart the site to apply it.", {
					action: { label: "Restart now", onClick: triggerRestart },
				});
			}
		} catch {
			toast.error("Failed to save site guard. Admin role required.");
		}
	}

	const changed =
		disableXmlRpc !== initial.disableXmlRpc ||
		disallowFileEdit !== initial.disallowFileEdit;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Site guard</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div className="flex items-center justify-between gap-4">
					<Label htmlFor={`disable-xmlrpc-${siteId}`}>Block XML-RPC</Label>
					<Switch
						checked={disableXmlRpc}
						id={`disable-xmlrpc-${siteId}`}
						onCheckedChange={setDisableXmlRpc}
					/>
				</div>
				<div className="flex items-center justify-between gap-4">
					<Label htmlFor={`file-edit-${siteId}`}>Disable file editor</Label>
					<Switch
						checked={disallowFileEdit}
						id={`file-edit-${siteId}`}
						onCheckedChange={setDisallowFileEdit}
					/>
				</div>
				<Button
					className="justify-self-start"
					disabled={save.isPending || !changed}
					onClick={handleSave}
				>
					{save.isPending ? "Saving..." : "Save site guard"}
				</Button>
				<p className="text-muted-foreground text-xs">
					These per-site controls are enforced by the WordPress runtime and take
					effect after a container restart.
				</p>
			</CardContent>
		</Card>
	);
}
