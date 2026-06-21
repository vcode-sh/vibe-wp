import { queryOptions } from "@tanstack/react-query";

import {
	backupsFor,
	healthFor,
	logsFor,
	overviewFor,
	serverInfo,
	siteSummaries,
	stagingFor,
} from "./fixtures";

const settle = <T>(value: T): Promise<T> =>
	new Promise((resolve) => setTimeout(() => resolve(value), 150));

export const sitesQuery = () =>
	queryOptions({ queryKey: ["sites"], queryFn: () => settle(siteSummaries) });

export const serverInfoQuery = () =>
	queryOptions({ queryKey: ["server"], queryFn: () => settle(serverInfo) });

export const siteOverviewQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "overview"],
		queryFn: () => settle(overviewFor(siteId)),
	});

export const healthQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "health"],
		queryFn: () => settle(healthFor(siteId)),
	});

export const backupsQuery = (siteId: string) =>
	queryOptions({
		queryKey: ["site", siteId, "backups"],
		queryFn: () => settle(backupsFor(siteId)),
	});

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
