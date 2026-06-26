import { eventIterator, ORPCError } from "@orpc/server";
import { z } from "zod";

import type { LogLine, StreamEvent } from "../contract";
import { runVibe, STREAM_TIMEOUT_MS, streamVibe } from "../core-bridge/exec";
import { parseLogLines } from "../core-bridge/parse";
import { findSite } from "../core-bridge/sites";
import { adminProcedure, operatorProcedure } from "../procedures";
import {
	applyLogFilters,
	applySourceFilter,
	assertSourceAllowed,
	decorateLines,
	hostArgs,
	LOG_CACHE_FILTER,
	LOG_FILTER_MODE,
	LOG_SERVICE,
	LOG_SEVERITY_FILTER,
	LOG_TAIL,
	mapServiceToSource,
	maskStreamLine,
	passesStreamFilters,
	passesStreamSourceFilter,
} from "./logs-helpers";

const GLOBAL_MAX = 8;
const PER_USER_MAX = 3;
const FOLLOW_TAIL = "200";

let globalActiveStreams = 0;
const perUserActiveStreams = new Map<string, number>();

const logStreamSchema = z.object({
	line: z.string(),
	status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
	done: z.boolean(),
});

function roleOf(context: { session: { user: unknown } }): string | undefined {
	return (context.session.user as { role?: string } | undefined)?.role;
}

function pipeline(
	stdout: string,
	input: {
		service: z.infer<typeof LOG_SERVICE>;
		tail: string;
		cache?: z.infer<typeof LOG_CACHE_FILTER>;
		filter?: string;
		filterMode?: z.infer<typeof LOG_FILTER_MODE>;
		severity?: z.infer<typeof LOG_SEVERITY_FILTER>;
	}
): LogLine[] {
	let lines = parseLogLines(
		stdout,
		mapServiceToSource(input.service),
		Number(input.tail)
	);
	lines = applySourceFilter(lines, input.service);
	lines = decorateLines(lines, input.service);
	lines = applyLogFilters(lines, input);
	return lines.slice(-Number(input.tail));
}

export const logsRouter = {
	logsRecent: operatorProcedure
		.input(
			z.object({
				siteId: z.string(),
				service: LOG_SERVICE.default("all"),
				tail: LOG_TAIL.default("500"),
				cache: LOG_CACHE_FILTER.default("all"),
				filter: z.string().max(200).optional(),
				filterMode: LOG_FILTER_MODE.default("text"),
				severity: LOG_SEVERITY_FILTER.default("all"),
			})
		)
		.handler(async ({ input, context }): Promise<LogLine[]> => {
			assertSourceAllowed(input.service, roleOf(context));
			const site = await findSite(input.siteId);
			if (!site) {
				return [];
			}
			const { stdout } = await runVibe(site.installDir, "prod", "logsRecent", {
				args: hostArgs(input.service, input.tail),
			});
			return pipeline(stdout, input);
		}),

	logsFollow: operatorProcedure
		.input(
			z.object({
				siteId: z.string(),
				service: LOG_SERVICE.default("all"),
				cache: LOG_CACHE_FILTER.default("all"),
				filter: z.string().max(200).optional(),
				filterMode: LOG_FILTER_MODE.default("text"),
				severity: LOG_SEVERITY_FILTER.default("all"),
			})
		)
		.output(eventIterator(logStreamSchema))
		.handler(async function* ({ input, context }): AsyncGenerator<StreamEvent> {
			assertSourceAllowed(input.service, roleOf(context));
			const userId = context.session.user.id;

			if (
				globalActiveStreams >= GLOBAL_MAX ||
				(perUserActiveStreams.get(userId) ?? 0) >= PER_USER_MAX
			) {
				throw new ORPCError("TOO_MANY_REQUESTS", {
					message: "Too many concurrent log streams. Close one and retry.",
				});
			}

			// Resolve the site BEFORE reserving a slot. findSite spawns a host
			// process and can reject; reserving first would leak a slot on throw
			// because the decrement only runs once we enter the try/finally below.
			const site = await findSite(input.siteId);
			if (!site) {
				return;
			}

			globalActiveStreams += 1;
			perUserActiveStreams.set(
				userId,
				(perUserActiveStreams.get(userId) ?? 0) + 1
			);

			const { proc, lines } = streamVibe(
				site.installDir,
				"prod",
				"logsFollow",
				{
					timeoutMs: STREAM_TIMEOUT_MS,
					args: hostArgs(input.service, FOLLOW_TAIL),
				}
			);
			try {
				for await (const raw of lines) {
					if (raw.length === 0) {
						continue;
					}
					if (!passesStreamSourceFilter(raw, input.service)) {
						continue;
					}
					const masked = maskStreamLine(raw, input.service);
					if (!passesStreamFilters(masked, input)) {
						// Server-side filters keep wire traffic low and match recent/export.
						continue;
					}
					yield { line: masked, status: "running", done: false };
				}
				yield { line: "", status: "succeeded", done: true };
			} finally {
				// Kill the `logs -f` process group when the client disconnects or the
				// generator is finalized via .return() on early consumer abort. This
				// decrement is paired 1:1 with the single increment above and runs on
				// normal end, throw, and early disconnect.
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

	logsExport: adminProcedure
		.input(
			z.object({
				siteId: z.string(),
				service: LOG_SERVICE.default("all"),
				tail: LOG_TAIL.default("2000"),
				cache: LOG_CACHE_FILTER.default("all"),
				filter: z.string().max(200).optional(),
				filterMode: LOG_FILTER_MODE.default("text"),
				severity: LOG_SEVERITY_FILTER.default("all"),
			})
		)
		.handler(
			async ({ input }): Promise<{ lines: LogLine[]; filename: string }> => {
				const site = await findSite(input.siteId);
				if (!site) {
					return { lines: [], filename: "logs.txt" };
				}
				const { stdout } = await runVibe(
					site.installDir,
					"prod",
					"logsExport",
					{
						args: hostArgs(input.service, input.tail),
						timeoutMs: 30_000,
					}
				);
				const lines = pipeline(stdout, {
					service: input.service,
					tail: input.tail,
					cache: input.cache,
					filter: input.filter,
					filterMode: input.filterMode,
					severity: input.severity,
				});
				return {
					lines,
					filename: `logs-${input.siteId}-${input.service}-${input.tail}.txt`,
				};
			}
		),
};
