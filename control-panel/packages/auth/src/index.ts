import { createDb } from "@control-panel/db";
import {
	account,
	rateLimit,
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

const authSchema = { account, rateLimit, session, user, verification };

export function createAuth() {
	const db = createDb();

	return betterAuth({
		database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
			maxPasswordLength: 128,
		},
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
			storage: "database",
			customRules: {
				"/sign-in/email": { window: 10, max: 5 },
				// Throttle current-password brute force on self-service change.
				"/change-password": { window: 10, max: 5 },
			},
		},
		advanced: {
			defaultCookieAttributes: {
				// Same-origin deployment: the web app and /rpc + /api/auth all live
				// under one domain (BETTER_AUTH_URL === CORS_ORIGIN), so `lax` is
				// correct — cookies still ride same-origin RPC/auth requests and
				// top-level navigations, without the wider CSRF surface `none` opens
				// on a privileged host-mutation panel. `secure` is gated on production
				// so local HTTP dev (NODE_ENV !== "production") can still log in.
				sameSite: "lax",
				secure: env.NODE_ENV === "production",
				httpOnly: true,
			},
		},
		plugins: [admin({ ac, roles, adminRoles: ["admin"] })],
	});
}

export const auth = createAuth();

/**
 * Narrow an unknown error thrown by `auth.api.*` to better-auth's APIError shape
 * without re-exporting the class (which would make this a barrel module). The
 * better-auth library boundary stays inside this package: consumers in
 * packages/api classify failures via this helper instead of importing
 * better-auth themselves. `status` is better-auth's string status code
 * (e.g. "UNPROCESSABLE_ENTITY"); `statusCode` is the numeric HTTP status.
 */
export function asAuthApiError(
	cause: unknown
): { status: string; statusCode: number } | null {
	if (
		cause instanceof Error &&
		cause.name === "APIError" &&
		"status" in cause &&
		typeof (cause as { status: unknown }).status === "string" &&
		"statusCode" in cause &&
		typeof (cause as { statusCode: unknown }).statusCode === "number"
	) {
		const e = cause as Error & { status: string; statusCode: number };
		return { status: e.status, statusCode: e.statusCode };
	}
	return null;
}
