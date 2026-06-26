import { env } from "@control-panel/env/server";

import type { ServerInfo } from "../contract";
import { hostExec } from "./exec";
import {
	readSiteOverviewSnapshot,
	type SiteOverviewSnapshot,
} from "./site-overview-cache";
import {
	kickSiteOverviewRefresh,
	shouldRefreshSiteOverview,
} from "./site-overview-refresher";
import { type DetectedSite, detectSites } from "./sites";

const WHITESPACE = /\s+/;
const SERVER_INFO_TTL_MS = 5000;

interface ServerInfoDeps {
	detectSites: () => Promise<DetectedSite[]>;
	hostExec: typeof hostExec;
	kickSiteOverviewRefresh: typeof kickSiteOverviewRefresh;
	nowMs: () => number;
	readSiteOverviewSnapshot: (
		siteId: string
	) => Promise<SiteOverviewSnapshot | null>;
	shouldRefreshSiteOverview: typeof shouldRefreshSiteOverview;
	ttlMs: number;
	vpsLabel?: string;
}

let cached: { expiresAt: number; value: ServerInfo } | null = null;
let inFlight: Promise<ServerInfo> | null = null;

function depsWithDefaults(overrides: Partial<ServerInfoDeps>): ServerInfoDeps {
	return {
		detectSites,
		hostExec,
		kickSiteOverviewRefresh,
		nowMs: () => Date.now(),
		readSiteOverviewSnapshot,
		shouldRefreshSiteOverview,
		ttlMs: SERVER_INFO_TTL_MS,
		vpsLabel: env.PANEL_VPS_LABEL,
		...overrides,
	};
}

function diskPercentFromDf(out: string): number {
	const line = out.trim().split("\n")[1] ?? "";
	const pct = line.split(WHITESPACE)[4] ?? "0%";
	return Number.parseInt(pct.replace("%", ""), 10) || 0;
}

async function cachedSiteHealthy(
	site: DetectedSite,
	deps: ServerInfoDeps
): Promise<boolean> {
	const snapshot = await deps.readSiteOverviewSnapshot(site.id);
	if (deps.shouldRefreshSiteOverview(snapshot)) {
		deps.kickSiteOverviewRefresh(site);
	}
	return snapshot?.payload.status === "good";
}

async function buildServerInfo(deps: ServerInfoDeps): Promise<ServerInfo> {
	const [sites, df, host] = await Promise.all([
		deps.detectSites(),
		deps.hostExec(["df", "-P", "/"]),
		deps.hostExec(["hostname", "-f"]),
	]);
	const statuses = await Promise.all(
		sites.map((site) => cachedSiteHealthy(site, deps))
	);
	return {
		vps: deps.vpsLabel ?? host.trim() ?? "this server",
		siteCount: sites.length,
		diskPercent: diskPercentFromDf(df),
		allHealthy: statuses.every(Boolean),
	};
}

export function clearServerInfoCache(): void {
	cached = null;
	inFlight = null;
}

export function readServerInfo(
	overrides: Partial<ServerInfoDeps> = {}
): Promise<ServerInfo> {
	const deps = depsWithDefaults(overrides);
	const now = deps.nowMs();
	if (cached && cached.expiresAt > now) {
		return Promise.resolve(cached.value);
	}
	if (inFlight) {
		return inFlight;
	}
	inFlight = buildServerInfo(deps)
		.then((value) => {
			cached = { expiresAt: deps.nowMs() + deps.ttlMs, value };
			return value;
		})
		.finally(() => {
			inFlight = null;
		});
	return inFlight;
}
