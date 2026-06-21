import { db } from "@control-panel/db";
import { jobs } from "@control-panel/db/schema/jobs";
import { eq } from "drizzle-orm";

import type { JobStatus } from "../contract";

export async function persistJobStart(
	jobId: string,
	kind: string,
	siteId: string
): Promise<void> {
	await db.insert(jobs).values({
		id: jobId,
		kind,
		siteId,
		status: "running" satisfies JobStatus,
	});
}

export async function persistJobFinish(
	jobId: string,
	status: JobStatus,
	exitCode: number | null
): Promise<void> {
	await db
		.update(jobs)
		.set({
			status,
			exitCode,
			finishedAt: new Date(),
		})
		.where(eq(jobs.id, jobId));
}
