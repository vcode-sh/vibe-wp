import type { SiteOverview } from "../contract";
import {
	buildLiveSiteOverview,
	type SiteOverviewBuildDeps,
} from "./site-overview-builder";
import {
	type SiteOverviewSnapshot,
	writeSiteOverviewSnapshot,
} from "./site-overview-cache";
import type { DetectedSite } from "./sites";

const READ_STALE_MS = 60_000;
const REFRESH_CONCURRENCY = 2;
const inFlight = new Set<string>();

export interface SiteOverviewRefreshDeps extends SiteOverviewBuildDeps {
	writeSnapshot?: (siteId: string, payload: SiteOverview) => Promise<void>;
}

export function shouldRefreshSiteOverview(
	snapshot: SiteOverviewSnapshot | null,
	nowMs = Date.now(),
	staleMs = READ_STALE_MS
): boolean {
	return !snapshot || nowMs - snapshot.refreshedAt.getTime() >= staleMs;
}

export async function refreshSiteOverview(
	site: DetectedSite,
	deps: SiteOverviewRefreshDeps = {}
): Promise<SiteOverview> {
	const payload = await buildLiveSiteOverview(site, deps);
	await (deps.writeSnapshot ?? writeSiteOverviewSnapshot)(site.id, payload);
	return payload;
}

export function kickSiteOverviewRefresh(
	site: DetectedSite,
	opts: {
		deps?: SiteOverviewRefreshDeps;
		onError?: (err: unknown) => void;
	} = {}
): void {
	if (inFlight.has(site.id)) {
		return;
	}
	inFlight.add(site.id);
	refreshSiteOverview(site, opts.deps)
		.catch((err) => {
			opts.onError?.(err);
		})
		.finally(() => {
			inFlight.delete(site.id);
		});
}

export async function refreshSiteOverviewPass(
	sites: DetectedSite[],
	refresh: (site: DetectedSite) => Promise<unknown> = refreshSiteOverview,
	concurrency = REFRESH_CONCURRENCY
): Promise<number> {
	let ok = 0;
	const queue = [...sites];
	const workers = Array.from(
		{ length: Math.max(1, Math.min(concurrency, queue.length || 1)) },
		async () => {
			for (let site = queue.shift(); site; site = queue.shift()) {
				try {
					await refresh(site);
					ok += 1;
				} catch {
					// Best-effort: keep the previous snapshot for this site.
				}
			}
		}
	);
	await Promise.all(workers);
	return ok;
}
