import {
	pruneHistory,
	reconcileOrphanedJobs,
} from "@control-panel/api/core-bridge/jobs-db";

import { createServerApp } from "./app";

// Flip any 'running' rows left over from a previous process to 'failed'.
// Must run before the app starts accepting requests so the UI never sees
// phantom active jobs from a prior session.
await reconcileOrphanedJobs();

// Prune old terminal job rows and orphaned audit_log entries once at startup.
// A periodic timer (e.g. setInterval at midnight) could be added later if
// panels accumulate enough traffic to need mid-session pruning.
await pruneHistory();

export default createServerApp();
