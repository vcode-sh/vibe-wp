import { orpc } from "@/lib/orpc/client";

const backgroundRealtimeOptions = {
	refetchInterval: 60_000,
	refetchOnWindowFocus: true,
	staleTime: 15_000,
} as const;

export const needsSetupQuery = () => orpc.needsSetup.queryOptions();

export const panelAccessQuery = () => orpc.panelAccess.queryOptions();

export const sitesQuery = () => ({
	...orpc.sitesList.queryOptions(),
	...backgroundRealtimeOptions,
});

export const serverInfoQuery = () => ({
	...orpc.serverInfo.queryOptions(),
	...backgroundRealtimeOptions,
});

export const siteOverviewQuery = (siteId: string) => ({
	...orpc.siteOverview.queryOptions({ input: { siteId } }),
	...backgroundRealtimeOptions,
});

export const healthQuery = (siteId: string) => ({
	...orpc.healthReport.queryOptions({ input: { siteId } }),
	...backgroundRealtimeOptions,
});

export const backupsQuery = (siteId: string) =>
	orpc.backupsList.queryOptions({ input: { siteId } });

export const backupContentsQuery = (siteId: string, backupId: string) =>
	orpc.listBackupContents.queryOptions({ input: { siteId, backupId } });

export const offsiteVerifiedQuery = (siteId: string) =>
	orpc.offsiteVerified.queryOptions({ input: { siteId } });

export interface LogParams {
	cache?:
		| "all"
		| "HIT"
		| "MISS"
		| "BYPASS"
		| "EXPIRED"
		| "STALE"
		| "UPDATING"
		| "REVALIDATED";
	filter?: string;
	filterMode?: "text" | "regex";
	service?: "nginx" | "php" | "wp" | "mariadb" | "redis" | "access" | "all";
	severity?: "all" | "error" | "warn" | "info" | "debug";
	tail?: "100" | "500" | "2000";
}

export const logsQuery = (siteId: string, params: LogParams = {}) =>
	orpc.logsRecent.queryOptions({
		input: {
			siteId,
			cache: params.cache ?? "all",
			service: params.service ?? "all",
			severity: params.severity ?? "all",
			tail: params.tail ?? "500",
			...(params.filter ? { filter: params.filter } : {}),
			filterMode: params.filterMode ?? "text",
		},
	});

export const stagingQuery = (siteId: string) =>
	orpc.stagingInfo.queryOptions({ input: { siteId } });

export const stagingSyncPlanQuery = (
	siteId: string,
	direction: "refreshFromProd" | "pushFilesToLive"
) =>
	orpc.stagingSyncPlan.queryOptions({
		input: { direction, siteId },
	});

export const siteStatusQuery = (siteId: string) =>
	orpc.siteStatus.queryOptions({ input: { siteId } });

export const updatesAvailableQuery = (siteId: string) => ({
	...orpc.updatesAvailable.queryOptions({ input: { siteId } }),
	...backgroundRealtimeOptions,
});

export const backupConfigQuery = (siteId: string) =>
	orpc.backupConfigGet.queryOptions({ input: { siteId } });

export const notifyConfigQuery = (siteId: string) =>
	orpc.notifyConfigGet.queryOptions({ input: { siteId } });

export const smtpConfigQuery = (siteId: string) =>
	orpc.smtpConfigGet.queryOptions({ input: { siteId } });

export const logRotationConfigQuery = () =>
	orpc.logRotationConfigGet.queryOptions();

export const siteSettingsQuery = (siteId: string) =>
	orpc.siteSettingsGet.queryOptions({ input: { siteId } });

export const healthPerfQuery = (siteId: string) =>
	orpc.healthPerf.queryOptions({ input: { siteId } });

export const securityStatusQuery = () => orpc.securityStatus.queryOptions();

export const securityConfigQuery = () => orpc.securityConfigGet.queryOptions();

export const devInfoQuery = (siteId: string) =>
	orpc.devInfo.queryOptions({ input: { siteId } });

export const operationsListQuery = (opts?: {
	siteId?: string;
	limit?: number;
}) => orpc.operationsList.queryOptions({ input: opts ?? {} });

export const inventoryQuery = (siteId: string) => ({
	...orpc.siteInventory.queryOptions({ input: { siteId } }),
	...backgroundRealtimeOptions,
});

export const securityScoreQuery = (siteId: string) => ({
	...orpc.siteSecurityScore.queryOptions({ input: { siteId } }),
	...backgroundRealtimeOptions,
});

export const securityRadarQuery = (siteId: string) => ({
	...orpc.securityRadar.queryOptions({ input: { siteId } }),
	...backgroundRealtimeOptions,
});

export const perfAdviceQuery = (siteId: string) =>
	orpc.perfAdvice.queryOptions({ input: { siteId } });

export const sharedDbStatusQuery = () => orpc.sharedDbStatus.queryOptions();

/** Advisory DNS preflight for the create-site wizard (domain must be valid). */
export const dnsPreflightQuery = (domain: string) =>
	orpc.dnsPreflight.queryOptions({ input: { domain } });

/**
 * Setup-gated DNS preflight for the onboarding custom-panel-domain expander.
 * Public (the owner doesn't exist yet) but server-side it only runs while the
 * panel still needs setup. Used pre-auth on the /setup panel-address step.
 */
export const setupPanelDnsPreflightQuery = (domain: string) =>
	orpc.setupPanelDnsPreflight.queryOptions({ input: { domain } });

export const monitoringHistoryQuery = (siteId: string, sinceDays = 7) => ({
	...orpc.monitoringHistory.queryOptions({ input: { siteId, sinceDays } }),
	...backgroundRealtimeOptions,
});

export const monitoringSummaryQuery = () =>
	orpc.monitoringSummary.queryOptions();

export const monitoringOverviewQuery = () => ({
	...orpc.monitoringOverview.queryOptions(),
	...backgroundRealtimeOptions,
});
