import { subscribeOperationLifecycleEvents } from "./job-events";
import { deleteSiteOverviewSnapshot } from "./site-overview-cache";
import {
	kickSiteOverviewRefresh,
	refreshSiteOverviewPass,
} from "./site-overview-refresher";
import { type DetectedSite, detectSites, findSite } from "./sites";

const MIN_INTERVAL_MIN = 1;
const MAX_INTERVAL_MIN = 24 * 60;

export interface OverviewRecorderHandle {
	stop: () => void;
}

export function resolveOverviewRefreshIntervalMs(
	raw: string | undefined
): number {
	if (!raw) {
		return 0;
	}
	const trimmed = raw.trim().toLowerCase();
	if (trimmed === "" || trimmed === "0" || trimmed === "off") {
		return 0;
	}
	const minutes = Number(trimmed);
	if (!Number.isFinite(minutes) || minutes <= 0) {
		return 0;
	}
	const clamped = Math.min(
		Math.max(Math.trunc(minutes), MIN_INTERVAL_MIN),
		MAX_INTERVAL_MIN
	);
	return clamped * 60 * 1000;
}

export function startSiteOverviewRecorder(opts: {
	intervalMs: number;
	listSites?: () => Promise<DetectedSite[]>;
	onError?: (err: unknown) => void;
	refreshPass?: (sites: DetectedSite[]) => Promise<unknown>;
}): OverviewRecorderHandle {
	if (opts.intervalMs <= 0) {
		return { stop: () => undefined };
	}
	const listSites = opts.listSites ?? detectSites;
	const refreshPass = opts.refreshPass ?? refreshSiteOverviewPass;
	let running = false;

	const tick = (): Promise<void> => {
		if (running) {
			return Promise.resolve();
		}
		running = true;
		return listSites()
			.then((sites) => refreshPass(sites).then(() => undefined))
			.catch((err) => {
				opts.onError?.(err);
			})
			.finally(() => {
				running = false;
			});
	};

	tick().catch(() => undefined);
	const timer = setInterval(() => {
		tick().catch(() => undefined);
	}, opts.intervalMs);
	(timer as { unref?: () => void }).unref?.();
	return { stop: () => clearInterval(timer) };
}

export function startSiteOverviewOperationRefresher(
	opts: { onError?: (err: unknown) => void } = {}
): OverviewRecorderHandle {
	let stopped = false;
	const iterator = subscribeOperationLifecycleEvents();

	const loop = async (): Promise<void> => {
		for await (const event of iterator) {
			if (stopped) {
				return;
			}
			if (event.phase !== "finish" || !event.status) {
				continue;
			}
			if (event.kind === "removeSite") {
				await deleteSiteOverviewSnapshot(event.siteId);
				continue;
			}
			if (event.siteId === "server") {
				continue;
			}
			const site = await findSite(event.siteId);
			if (site) {
				kickSiteOverviewRefresh(site, { onError: opts.onError });
			}
		}
	};

	loop().catch((err) => {
		if (!stopped) {
			opts.onError?.(err);
		}
	});

	return {
		stop: () => {
			stopped = true;
			const stopPromise = iterator.return?.(undefined);
			stopPromise?.catch((err) => {
				opts.onError?.(err);
			});
		},
	};
}
