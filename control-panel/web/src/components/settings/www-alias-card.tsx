/**
 * WwwAliasCard — add or remove the host Caddy `www.<domain>` alias for a site.
 *
 * The alias lives in the host Caddy site snippet (not the site env), so toggling
 * calls the panel's siteWwwAliasSet procedure, which edits only the snippet's
 * address line and HOT-reloads Caddy. There is no restart/recreate to surface.
 *
 * www requires a DNS record for www.<domain>: without it, certificate issuance
 * and serving for the www host will fail. We surface that as a NON-blocking hint
 * — the operator owns DNS, and the op deliberately does not gate on it.
 */
import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orpc } from "@/lib/orpc/client";
import { invalidateSiteWwwAliasSaved } from "@/lib/realtime/immediate-invalidation";

export function WwwAliasCard({
	siteId,
	initial,
}: {
	siteId: string;
	initial: boolean;
}) {
	const qc = useQueryClient();
	const [enabled, setEnabled] = useState(initial);
	const wwwSet = useMutation(orpc.siteWwwAliasSet.mutationOptions());

	async function handleToggle(next: boolean) {
		setEnabled(next);
		try {
			await wwwSet.mutateAsync({ siteId, enabled: next });
			await invalidateSiteWwwAliasSaved(qc, siteId);
			toast.success(next ? "www alias enabled." : "www alias disabled.");
		} catch {
			setEnabled(!next);
			toast.error("Failed to update the www alias. Admin role required.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">www alias</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-1.5">
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor={`www-alias-${siteId}`}>
							Serve www.&lt;domain&gt;
						</Label>
						<Switch
							checked={enabled}
							disabled={wwwSet.isPending}
							id={`www-alias-${siteId}`}
							onCheckedChange={handleToggle}
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						Serve the www host alongside the apex from the same Caddy block and
						hot-reload Caddy (no downtime). Requires a DNS record pointing
						www.&lt;domain&gt; at this server — without it, certificate issuance
						and serving for the www host will fail.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
