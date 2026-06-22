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
import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

const authSchema = { account, session, user, verification };

const ac = createAccessControl({
	...defaultStatements,
	site: ["read", "operate", "manage"],
	server: ["read", "manage"],
	team: ["manage"],
});

const roles = {
	viewer: ac.newRole({ site: ["read"], server: ["read"] }),
	operator: ac.newRole({ site: ["read", "operate"], server: ["read"] }),
	admin: ac.newRole({
		...adminAc.statements,
		site: ["read", "operate", "manage"],
		server: ["read", "manage"],
		team: ["manage"],
	}),
};

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
					before: async (newUser) => {
						const existing = await db
							.select({ id: user.id })
							.from(user)
							.limit(1);
						if (existing.length > 0) {
							throw new APIError("FORBIDDEN", {
								message:
									"Registration is closed. Ask an admin to create your account.",
							});
						}
						return {
							data: {
								...newUser,
								role: "admin",
							},
						};
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
