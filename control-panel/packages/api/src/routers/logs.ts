import { eventIterator } from "@orpc/server";
import { z } from "zod";

import type { LogLine, StreamEvent } from "../contract";
import { runVibe, STREAM_TIMEOUT_MS, streamVibe } from "../core-bridge/exec";
import { parseLogLines } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { protectedProcedure } from "../procedures";

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
		.handler(async function* ({ input }): AsyncGenerator<StreamEvent> {
			const site = await findSite(input.siteId);
			if (!site) {
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
				// Kill the `logs -f` process group when the client disconnects.
				proc.kill();
			}
		}),
};
