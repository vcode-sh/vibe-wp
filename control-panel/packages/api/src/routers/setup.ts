import { db } from "@control-panel/db";
import { user } from "@control-panel/db/schema/auth";
import { count, eq } from "drizzle-orm";

import { publicProcedure } from "../procedures";

export const setupRouter = {
	needsSetup: publicProcedure.handler(async (): Promise<{ needsSetup: boolean }> => {
		const [row] = await db
			.select({ c: count() })
			.from(user)
			.where(eq(user.role, "admin"));
		return { needsSetup: (row?.c ?? 0) === 0 };
	}),
};
