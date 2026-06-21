import { queryOptions } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc/client";
import { healthFor, logsFor, serverInfo, stagingFor } from "./fixtures";

const settle = <T>(value: T): Promise<T> =>
	new Promise((resolve) => setTimeout(() => resolve(value), 150));

export const sitesQuery = () => orpc.sitesList.queryOptions();

export const serverInfoQuery = () =>
	queryOptions({ queryKey: ["server"], queryFn: () => settle(serverInfo) });

export const siteOverviewQuery = (siteId: string) =>
	orpc.siteOverview.queryOptions({ input: { siteId } });

export const healthQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "health"],
		queryFn: () => settle(healthFor(siteId)),
	});

export const backupsQuery = (siteId: string) =>
	orpc.backupsList.queryOptions({ input: { siteId } });

export const logsQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "logs"],
		queryFn: () => settle(logsFor(siteId)),
	});

export const stagingQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "staging"],
		queryFn: () => settle(stagingFor(siteId)),
	});
