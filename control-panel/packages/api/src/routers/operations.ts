import { eventIterator } from "@orpc/server";
import { z } from "zod";

import type { Job, StreamEvent } from "../contract";
import { getJob, streamJob } from "../core-bridge/jobs";
import { protectedProcedure } from "../procedures";

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
};
