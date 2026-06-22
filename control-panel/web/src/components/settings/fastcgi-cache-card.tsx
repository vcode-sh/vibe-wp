/**
 * FastcgiCacheCard — toggle the nginx FastCGI page cache (NGINX_FASTCGI_CACHE).
 * The cache is rendered into the nginx config by the image entrypoint, so saving
 * writes on|off to the site env file and then force-recreates the nginx container
 * (`vibe nginx-recreate`) — a plain restart would not re-run the entrypoint. The
 * recreate is surfaced as a streamed lifecycle job so the operator can watch it.
 */
import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteSettingsQuery } from "@/data/queries";
import { useOperations } from "@/lib/operations/operations-provider";
import { orpc } from "@/lib/orpc/client";

export function FastcgiCacheCard({
	siteId,
	initial,
}: {
	siteId: string;
	initial: boolean;
}) {
	const qc = useQueryClient();
	const { start } = useOperations();
	const [enabled, setEnabled] = useState(initial);
	const cacheSet = useMutation(orpc.siteFastcgiCacheSet.mutationOptions());
	const recreate = useMutation(orpc.lifecycleNginxRecreate.mutationOptions());

	async function triggerRecreate() {
		try {
			const result = await recreate.mutateAsync({ siteId });
			start({
				jobId: result.jobId,
				title: `Recreating nginx for ${siteId}`,
				kind: "nginxRecreate",
				siteId,
			});
		} catch {
			toast.error("Failed to start the nginx recreate.");
		}
	}

	async function handleToggle(next: boolean) {
		setEnabled(next);
		try {
			const result = await cacheSet.mutateAsync({ siteId, enabled: next });
			await qc.invalidateQueries(siteSettingsQuery(siteId));
			if (result.recreateRequired) {
				await triggerRecreate();
			}
		} catch {
			setEnabled(!next);
			toast.error("Failed to update the page cache. Admin role required.");
		}
	}

	const pending = cacheSet.isPending || recreate.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">FastCGI page cache</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-1.5">
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor={`fastcgi-cache-${siteId}`}>
							Cache anonymous pages
						</Label>
						<Switch
							checked={enabled}
							disabled={pending}
							id={`fastcgi-cache-${siteId}`}
							onCheckedChange={handleToggle}
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						Serve cached HTML to anonymous GET/HEAD requests in nginx. The skip
						rules (logged-in users, wp-admin, cart/checkout) always apply.
						Toggling recreates the nginx container to re-render its config,
						briefly interrupting traffic.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}
