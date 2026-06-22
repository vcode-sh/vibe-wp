import { eventIterator } from "@orpc/server";
import { z } from "zod";

import type { Job, JobHistoryEntry, JobStatus, StreamEvent } from "../contract";
import { cancelJob, getJob, streamJob } from "../core-bridge/jobs";
import { jobsHistory, writeAudit } from "../core-bridge/jobs-db";
import { adminProcedure, protectedProcedure } from "../procedures";

const streamEventSchema = z.object({
	line: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
	done: z.boolean(),
});

export const operationsRouter = {
	operationsGet: protectedProcedure
		.input(z.object({ jobId: z.string() }))
		.handler(({ input }): Job => {
			const job = getJob(input.jobId);
			if (!job) {
				throw new Error("Unknown job");
			}
			return job;
		}),

	operationsStream: protectedProcedure
		.input(z.object({ jobId: z.string() }))
		.output(eventIterator(streamEventSchema))
		.handler(async function* ({ input }): AsyncGenerator<StreamEvent> {
			for await (const ev of streamJob(input.jobId)) {
				yield ev;
			}
		}),

	operationsCancel: adminProcedure
		.input(z.object({ jobId: z.string() }))
		.handler(async ({ input, context }): Promise<{ canceled: boolean }> => {
			const job = getJob(input.jobId);
			const canceled = cancelJob(input.jobId);
			if (canceled) {
				await writeAudit(
					context.session.user.id,
					"cancel",
					job?.siteId ?? null,
					input.jobId
				);
			}
			return { canceled };
		}),

	operationsList: protectedProcedure
		.input(
			z.object({
				siteId: z.string().optional(),
				limit: z.number().int().min(1).max(100).optional(),
			})
		)
		.handler(async ({ input }): Promise<JobHistoryEntry[]> => {
			const rows = await jobsHistory({
				siteId: input.siteId,
				limit: input.limit,
			});
			return rows.map((r) => ({
				id: r.id,
				siteId: r.siteId,
				kind: r.kind,
				action: r.action,
				actorName: r.actorName,
				actorId: r.actorId,
				status: r.status as JobStatus,
				exitCode: r.exitCode,
				startedAt: r.startedAt.toISOString(),
				finishedAt: r.finishedAt?.toISOString() ?? null,
				durationSeconds:
					r.finishedAt === null
						? null
						: Math.round(
								(r.finishedAt.getTime() - r.startedAt.getTime()) / 1000
							),
			}));
		}),
};
