import { env } from "@control-panel/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import {
	account,
	accountRelations,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
} from "./schema/auth";

const schema = {
	account,
	accountRelations,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
};

export function createDb() {
	const client = createClient({
		url: env.DATABASE_URL,
	});

	return drizzle({ client, schema });
}

export const db = createDb();
