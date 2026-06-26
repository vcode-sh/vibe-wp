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
import { backupVerification } from "./schema/backup-verification";
import { backupConfig } from "./schema/backups";
import { auditLog, jobs } from "./schema/jobs";
import { monitorSamples } from "./schema/monitoring";
import { notifyConfig } from "./schema/notify";
import { siteOverviewCache } from "./schema/site-overview-cache";
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
	backupVerification,
	notifyConfig,
	siteOverviewCache,
	smtpConfig,
	monitorSamples,
};

export function createDb() {
	const client = createClient({
		url: env.DATABASE_URL,
	});

	return drizzle({ client, schema });
}

export const db = createDb();
