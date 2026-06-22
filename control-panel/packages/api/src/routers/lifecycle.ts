import { z } from "zod";

import { startJob } from "../core-bridge/jobs";
import { adminProcedure, operatorProcedure } from "../procedures";

const siteInput = z.object({ siteId: z.string() });

function op(
	siteId: string,
	userId: string,
	vibeOp: "up" | "restart" | "cacheFlush" | "down",
	kind: string
) {
	return startJob({
		op: vibeOp,
		siteId,
		env: "prod",
		kind,
		userId,
		action: kind,
	});
}

export const lifecycleRouter = {
	lifecycleUp: operatorProcedure
		.input(siteInput)
		.handler(({ input, context }) =>
			op(input.siteId, context.session.user.id, "up", "up")
		),
	lifecycleRestart: operatorProcedure
		.input(siteInput)
		.handler(({ input, context }) =>
			op(input.siteId, context.session.user.id, "restart", "restart")
		),
	lifecycleCacheFlush: operatorProcedure
		.input(siteInput)
		.handler(({ input, context }) =>
			op(input.siteId, context.session.user.id, "cacheFlush", "cacheFlush")
		),
	lifecycleDown: adminProcedure
		.input(siteInput)
		.handler(({ input, context }) =>
			op(input.siteId, context.session.user.id, "down", "down")
		),
};
