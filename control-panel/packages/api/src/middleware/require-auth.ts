import { ORPCError } from "@orpc/server";

import { o } from "../orpc/base";

export const requireAuth = o.middleware(({ context, next }) => {
	if (!context.session?.user) {
		throw new ORPCError("UNAUTHORIZED");
	}

	return next({
		context: {
			session: context.session,
		},
	});
});
