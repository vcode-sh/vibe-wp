import { env } from "@control-panel/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import {
	account,
	accountRelations,
	rateLimit,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
} from "./schema/auth";
import { backupConfig } from "./schema/backups";
import { auditLog, jobs } from "./schema/jobs";
import { notifyConfig } from "./schema/notify";
import { smtpConfig } from "./schema/smtp";

const schema = {
	account,
	accountRelations,
	rateLimit,
	session,
	sessionRelations,
	user,
	userRelations,
	verification,
	auditLog,
	jobs,
	backupConfig,
	notifyConfig,
	smtpConfig,
};

export function createDb() {
	const client = createClient({
		url: env.DATABASE_URL,
	});

	return drizzle({ client, schema });
}

export const db = createDb();
