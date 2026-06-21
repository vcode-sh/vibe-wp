import { ORPCError } from "@orpc/server";

import { requireAuth } from "./middleware/require-auth";
import { o } from "./orpc/base";

export const publicProcedure = o;
export const protectedProcedure = publicProcedure.use(requireAuth);

const RANK: Record<string, number> = { viewer: 0, operator: 1, admin: 2 };

function requireRole(min: "operator" | "admin") {
	const minRank = RANK[min] ?? -1;
	return requireAuth.concat(({ context, next }) => {
		const role =
			(context.session.user as { role?: string } | undefined)?.role ?? "viewer";
		if ((RANK[role] ?? -1) < minRank) {
			throw new ORPCError("FORBIDDEN");
		}
		return next({ context });
	});
}

export const operatorProcedure = publicProcedure.use(requireRole("operator"));
export const adminProcedure = publicProcedure.use(requireRole("admin"));
