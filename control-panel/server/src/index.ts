import {
	pruneHistory,
	reconcileOrphanedJobs,
} from "@control-panel/api/core-bridge/jobs-db";
import { pruneMonitorSamples } from "@control-panel/api/core-bridge/monitor-history";

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
// alongside the job-history prune. A periodic server-side recorder could be
// added here later so history accrues without a viewer opening the status view;
// it would reuse the already-allowlisted `monitor` op (no new host capability).
await pruneMonitorSamples();

export default createServerApp();
