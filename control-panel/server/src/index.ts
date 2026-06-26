import {
	pruneHistory,
	reconcileOrphanedJobs,
} from "@control-panel/api/core-bridge/jobs-db";
import { pruneMonitorSamples } from "@control-panel/api/core-bridge/monitor-history";
import {
	resolveRecorderIntervalMs,
	startMonitorRecorder,
} from "@control-panel/api/core-bridge/monitor-recorder";
import {
	resolveOverviewRefreshIntervalMs,
	startSiteOverviewOperationRefresher,
	startSiteOverviewRecorder,
} from "@control-panel/api/core-bridge/site-overview-recorder";
import { env } from "@control-panel/env/server";

import { createServerApp } from "./app";

// Flip any 'running' rows left over from a previous process to 'failed'.
// Must run before the app starts accepting requests so the UI never sees
// phantom active jobs from a prior session.
await reconcileOrphanedJobs();

// Prune old terminal job rows and orphaned audit_log entries once at startup.
// A periodic timer (e.g. setInterval at midnight) could be added later if
// panels accumulate enough traffic to need mid-session pruning.
await pruneHistory();

// Prune monitor history older than its retention window (90 days) at startup,
// alongside the job-history prune.
await pruneMonitorSamples();

// Start the periodic monitor recorder so uptime/cert/DNS history accrues without
// a viewer opening the status view. It reuses the already-allowlisted `monitor`
// op (no new host capability), records an immediate first pass, then repeats on
// the configured interval. Set PANEL_MONITOR_RECORD_MINUTES=0/off to disable.
startMonitorRecorder({
	intervalMs: resolveRecorderIntervalMs(env.PANEL_MONITOR_RECORD_MINUTES),
	onError: (err) => {
		// Best-effort background work: log and keep the loop alive. Never throw out
		// of a timer tick (an unhandled rejection there would crash the process).
		console.error("[monitor-recorder] pass failed:", err);
	},
});

// Keep the expensive dashboard overview cache warm. Reads return the persisted
// snapshot immediately; this loop and operation-finish events refresh it.
startSiteOverviewRecorder({
	intervalMs: resolveOverviewRefreshIntervalMs(
		env.PANEL_OVERVIEW_REFRESH_MINUTES
	),
	onError: (err) => {
		console.error("[site-overview-recorder] pass failed:", err);
	},
});

startSiteOverviewOperationRefresher({
	onError: (err) => {
		console.error("[site-overview-recorder] operation refresh failed:", err);
	},
});

export default createServerApp();
