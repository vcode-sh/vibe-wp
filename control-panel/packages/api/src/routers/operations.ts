import { eventIterator, ORPCError } from "@orpc/server";
import { z } from "zod";

import type {
	Job,
	JobHistoryEntry,
	JobStatus,
	OperationLifecycleEvent,
	StreamEvent,
} from "../contract";
import { subscribeOperationLifecycleEvents } from "../core-bridge/job-events";
import { cancelJob, getJob, streamJob } from "../core-bridge/jobs";
import { jobsHistory, writeAudit } from "../core-bridge/jobs-db";
import { adminProcedure, protectedProcedure } from "../procedures";

const streamEventSchema = z.object({
	line: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
	done: z.boolean(),
});

const operationLifecycleEventSchema = z.object({
	jobId: z.string(),
	kind: z.string(),
	phase: z.enum(["start", "finish"]),
	siteId: z.string(),
	status: z
		.enum(["queued", "running", "succeeded", "failed", "canceled"])
		.optional(),
});

export const operationsRouter = {
	operationsGet: protectedProcedure
		.input(z.object({ jobId: z.string() }))
		.handler(({ input }): Job => {
			const job = getJob(input.jobId);
			if (!job) {
				// Unknown or evicted (past FINALIZED_TTL_MS) — surface a typed
				// NOT_FOUND like the other read handlers, not an opaque 500.
				throw new ORPCError("NOT_FOUND");
			}
			return job;
		}),

	operationsStream: protectedProcedure
		.input(z.object({ jobId: z.string() }))
		.output(eventIterator(streamEventSchema))
		.handler(async function* ({ input }): AsyncGenerator<StreamEvent> {
			// An evicted-job reconnect (past FINALIZED_TTL_MS) has no registry
			// entry; streamJob would throw a plain Error inside the generator and
			// oRPC would mask it as a 500. Guard the lookup and surface NOT_FOUND so
			// the client sees a typed error like every other read handler. The
			// try/catch also covers the narrow race where eviction fires between
			// the guard and the streamJob call.
			let stream: AsyncIterable<StreamEvent>;
			try {
				stream = streamJob(input.jobId);
			} catch {
				throw new ORPCError("NOT_FOUND");
			}
			for await (const ev of stream) {
				yield ev;
			}
		}),

	operationsEvents: protectedProcedure
		.input(z.object({}))
		.output(eventIterator(operationLifecycleEventSchema))
		.handler(async function* (): AsyncGenerator<OperationLifecycleEvent> {
			for await (const event of subscribeOperationLifecycleEvents()) {
				yield event;
			}
		}),

	operationsCancel: adminProcedure
		.input(z.object({ jobId: z.string() }))
		.handler(async ({ input, context }): Promise<{ canceled: boolean }> => {
			const job = getJob(input.jobId);
			if (!job) {
				// Unknown or evicted (past FINALIZED_TTL_MS) — cancelJob would throw a
				// plain Error here, which oRPC masks as an opaque 500. Surface the same
				// typed NOT_FOUND as operationsGet/operationsStream instead.
				throw new ORPCError("NOT_FOUND");
			}
			const canceled = cancelJob(input.jobId);
			if (canceled) {
				await writeAudit(
					context.session.user.id,
					"cancel",
					job.siteId,
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
