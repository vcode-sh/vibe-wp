import { reconcileOrphanedJobs } from "@control-panel/api/core-bridge/jobs-db";

import { createServerApp } from "./app";

// Flip any 'running' rows left over from a previous process to 'failed'.
// Must run before the app starts accepting requests so the UI never sees
// phantom active jobs from a prior session.
await reconcileOrphanedJobs();

export default createServerApp();
