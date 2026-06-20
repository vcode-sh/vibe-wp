import { createDb } from "@control-panel/db";
import {
	account,
	session,
	user,
	verification,
} from "@control-panel/db/schema/auth";
import { env } from "@control-panel/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

const authSchema = {
	account,
	session,
	user,
	verification,
};

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, {
			provider: "sqlite",

			schema: authSchema,
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: true,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
		},
		plugins: [],
	});
}

export const auth = createAuth();
