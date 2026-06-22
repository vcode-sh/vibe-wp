import { eventIterator, ORPCError } from "@orpc/server";
import { z } from "zod";

import type { LogLine, StreamEvent } from "../contract";
import { runVibe, STREAM_TIMEOUT_MS, streamVibe } from "../core-bridge/exec";
import { parseLogLines } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

const GLOBAL_MAX = 8;
const PER_USER_MAX = 3;

let globalActiveStreams = 0;
const perUserActiveStreams = new Map<string, number>();

const logStreamSchema = z.object({
	line: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
	done: z.boolean(),
});

export const logsRouter = {
	logsRecent: protectedProcedure
		.input(
			z.object({ siteId: z.string(), source: z.enum(["nginx", "php", "wp"]) })
		)
		.handler(async ({ input }): Promise<LogLine[]> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return [];
			}
			return parseLogLines(
				(await runVibe(site.installDir, "prod", "logsRecent")).stdout,
				input.source
			);
		}),

	logsFollow: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.output(eventIterator(logStreamSchema))
		.handler(async function* ({ input, context }): AsyncGenerator<StreamEvent> {
			const userId = context.session.user.id;

			if (
				globalActiveStreams >= GLOBAL_MAX ||
				(perUserActiveStreams.get(userId) ?? 0) >= PER_USER_MAX
			) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Too many concurrent log streams. Close one and retry.",
				});
			}

			globalActiveStreams += 1;
			perUserActiveStreams.set(
				userId,
				(perUserActiveStreams.get(userId) ?? 0) + 1
			);

			const site = await findSite(input.siteId);
			if (!site) {
				globalActiveStreams -= 1;
				const prev = perUserActiveStreams.get(userId) ?? 1;
				if (prev <= 1) {
					perUserActiveStreams.delete(userId);
				} else {
					perUserActiveStreams.set(userId, prev - 1);
				}
				return;
			}

			const { proc, lines } = streamVibe(
				site.installDir,
				"prod",
				"logsFollow",
				{ timeoutMs: STREAM_TIMEOUT_MS }
			);
			try {
				for await (const line of lines) {
					if (line.length > 0) {
						yield { line, status: "running", done: false };
					}
				}
				yield { line: "", status: "succeeded", done: true };
			} finally {
				// Kill the `logs -f` process group when the client disconnects or the
				// generator is garbage-collected via .return() on early consumer abort.
				proc.kill();
				globalActiveStreams -= 1;
				const prev = perUserActiveStreams.get(userId) ?? 1;
				if (prev <= 1) {
					perUserActiveStreams.delete(userId);
				} else {
					perUserActiveStreams.set(userId, prev - 1);
				}
			}
		}),
};
