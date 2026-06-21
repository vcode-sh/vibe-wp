import { requireAuth } from "./middleware/require-auth";
import { o } from "./orpc/base";

export const publicProcedure = o;
export const protectedProcedure = publicProcedure.use(requireAuth);
