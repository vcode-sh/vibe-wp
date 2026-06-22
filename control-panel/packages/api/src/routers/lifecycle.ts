import { z } from "zod";

import { startJob } from "../core-bridge/jobs";
import { adminProcedure, operatorProcedure } from "../procedures";

const siteInput = z.object({ siteId: z.string() });

function op(
	siteId: string,
	userId: string,
	vibeOp: "up" | "restart" | "cacheFlush" | "down" | "nginxRecreate",
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
	/**
	 * Force-recreate nginx so its entrypoint re-renders the config from env. Used
	 * after a setting that only nginx honors changes (e.g. NGINX_FASTCGI_CACHE) —
	 * a plain restart would not re-run the entrypoint. Streamed so the operator can
	 * watch it, exactly like a lifecycle up.
	 */
	lifecycleNginxRecreate: operatorProcedure
		.input(siteInput)
		.handler(({ input, context }) =>
			op(
				input.siteId,
				context.session.user.id,
				"nginxRecreate",
				"nginxRecreate"
			)
		),
	lifecycleDown: adminProcedure
		.input(siteInput)
		.handler(({ input, context }) =>
			op(input.siteId, context.session.user.id, "down", "down")
		),
};
