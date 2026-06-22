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
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { ac, roles } from "./access";

const authSchema = { account, session, user, verification };

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: { enabled: true },
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		user: {
			additionalFields: {
				role: { type: "string", input: false, defaultValue: "viewer" },
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (newUser, context) => {
						const existing = await db
							.select({ id: user.id })
							.from(user)
							.limit(1);
						// First user bootstraps the owner account as admin.
						if (existing.length === 0) {
							return { data: { ...newUser, role: "admin" } };
						}
						// After bootstrap, only admin-initiated creates are allowed.
						// `/admin/create-user` already enforces an authenticated admin
						// caller; any other path (e.g. public `/sign-up/email`) or a
						// missing context is treated as anonymous and rejected.
						if (context?.path === "/admin/create-user") {
							return {
								data: { ...newUser, role: newUser.role ?? "viewer" },
							};
						}
						throw new APIError("FORBIDDEN", {
							message:
								"Registration is closed. Ask an admin to create your account.",
						});
					},
				},
			},
		},
		rateLimit: {
			enabled: true,
			customRules: { "/sign-in/email": { window: 10, max: 5 } },
		},
		advanced: {
			defaultCookieAttributes: {
				sameSite: "none",
				secure: true,
				httpOnly: true,
			},
		},
		plugins: [admin({ ac, roles, adminRoles: ["admin"] })],
	});
}

export const auth = createAuth();
