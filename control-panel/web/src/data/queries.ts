import { orpc } from "@/lib/orpc/client";

export const sitesQuery = () => orpc.sitesList.queryOptions();

export const serverInfoQuery = () => orpc.serverInfo.queryOptions();

export const siteOverviewQuery = (siteId: string) =>
	orpc.siteOverview.queryOptions({ input: { siteId } });

export const healthQuery = (siteId: string) =>
	orpc.healthReport.queryOptions({ input: { siteId } });

export const backupsQuery = (siteId: string) =>
	orpc.backupsList.queryOptions({ input: { siteId } });

export const logsQuery = (siteId: string) =>
	orpc.logsRecent.queryOptions({ input: { siteId, source: "nginx" } });

export const stagingQuery = (siteId: string) =>
	orpc.stagingInfo.queryOptions({ input: { siteId } });

export const siteStatusQuery = (siteId: string) =>
	orpc.siteStatus.queryOptions({ input: { siteId } });
