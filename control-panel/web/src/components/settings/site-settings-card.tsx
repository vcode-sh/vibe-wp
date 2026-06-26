/**
 * SiteSettingsCard — the "Site" tab: env-driven per-site runtime settings.
 *
 * Cleanly supported here (each maps onto a value the runtime actually honors):
 *  - Health monitor on/off  → systemd timer (vibe-wp-monitor-<slug>-prod)
 *  - WP debug log / display  → WP_DEBUG_LOG / WP_DEBUG_DISPLAY (DebugFlagsCard)
 *  - Script debug            → SCRIPT_DEBUG (DebugFlagsCard)
 *  - PHP version             → WORDPRESS_IMAGE (PhpVersionCard); rebuild applies
 *  - FastCGI page cache      → NGINX_FASTCGI_CACHE (FastcgiCacheCard); recreate applies
 *  - www alias               → host Caddy snippet (WwwAliasCard); hot reload applies
 */
import { Label } from "@control-panel/ui/components/label";
import { Switch } from "@control-panel/ui/components/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QueryBoundary } from "@/components/patterns/query-boundary";
import { DebugFlagsCard } from "@/components/settings/debug-flags-card";
import { FastcgiCacheCard } from "@/components/settings/fastcgi-cache-card";
import { PhpVersionCard } from "@/components/settings/php-version-card";
import { SiteSecurityGuardCard } from "@/components/settings/site-security-guard-card";
import { WwwAliasCard } from "@/components/settings/www-alias-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteSettingsQuery } from "@/data/queries";
import { orpc } from "@/lib/orpc/client";

interface Settings {
	backupSchedule: string;
	debugDisplay: boolean;
	debugLog: boolean;
	disableXmlRpc: boolean;
	disallowFileEdit: boolean;
	fastcgiCache: boolean;
	monitorEnabled: boolean;
	scriptDebug: boolean;
	wordpressImage: string;
	wwwAlias: boolean;
}

export function SiteSettingsCard({ siteId }: { siteId: string }) {
	const query = useQuery(siteSettingsQuery(siteId));
	return (
		<QueryBoundary
			errorMessage="Couldn't load site settings."
			hasData={query.data !== undefined}
			isError={query.isError}
			isLoading={query.isLoading}
			onRetry={() => query.refetch()}
			skeletonClassName="h-64 w-full"
		>
			{query.data?.settings ? (
				<SiteSettingsForm settings={query.data.settings} siteId={siteId} />
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="text-sm">Site settings</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Site not found, or its runtime is unavailable.
						</p>
					</CardContent>
				</Card>
			)}
		</QueryBoundary>
	);
}

function MonitorCard({
	siteId,
	initial,
}: {
	siteId: string;
	initial: boolean;
}) {
	const qc = useQueryClient();
	const [monitor, setMonitor] = useState(initial);
	const monitorSet = useMutation(orpc.siteMonitorSet.mutationOptions());

	async function handleMonitor(next: boolean) {
		setMonitor(next);
		try {
			await monitorSet.mutateAsync({ siteId, enabled: next });
			await qc.invalidateQueries(siteSettingsQuery(siteId));
			toast.success(
				next ? "Health monitor enabled." : "Health monitor disabled."
			);
		} catch {
			setMonitor(!next);
			toast.error("Failed to update the monitor. Admin role required.");
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Health monitoring</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-1.5">
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor={`monitor-${siteId}`}>Hourly health monitor</Label>
						<Switch
							checked={monitor}
							id={`monitor-${siteId}`}
							onCheckedChange={handleMonitor}
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						Run hourly health checks (uptime, disk, TLS, backups) and send
						alerts on the configured channels.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

function SiteSettingsForm({
	siteId,
	settings,
}: {
	siteId: string;
	settings: Settings;
}) {
	return (
		<div className="grid gap-4">
			<MonitorCard initial={settings.monitorEnabled} siteId={siteId} />
			<DebugFlagsCard
				initial={{
					debugLog: settings.debugLog,
					debugDisplay: settings.debugDisplay,
					scriptDebug: settings.scriptDebug,
				}}
				siteId={siteId}
			/>
			<PhpVersionCard currentImage={settings.wordpressImage} siteId={siteId} />
			<FastcgiCacheCard initial={settings.fastcgiCache} siteId={siteId} />
			<SiteSecurityGuardCard
				initial={{
					disableXmlRpc: settings.disableXmlRpc,
					disallowFileEdit: settings.disallowFileEdit,
				}}
				siteId={siteId}
			/>
			<WwwAliasCard initial={settings.wwwAlias} siteId={siteId} />
		</div>
	);
}
