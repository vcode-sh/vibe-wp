import { asAuthApiError, auth } from "@control-panel/auth";
import { db } from "@control-panel/db";
import { user } from "@control-panel/db/schema/auth";
import { env } from "@control-panel/env/server";
import { ORPCError } from "@orpc/server";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { hostExec } from "../core-bridge/exec";
import { publicProcedure } from "../procedures";

// Mirrors the better-auth server policy (packages/auth: minPasswordLength 8 /
// maxPasswordLength 128). The single source of truth for the policy is
// packages/auth; keep these literals in lockstep with that config.
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

/** Count admin users. Zero admins == the panel still needs its owner. */
async function adminCount(): Promise<number> {
	const [row] = await db
		.select({ c: count() })
		.from(user)
		.where(eq(user.role, "admin"));
	return row?.c ?? 0;
}

// panel.<a>-<b>-<c>-<d>.sslip.io magic-DNS host → reconstruct the IP locally.
const MAGIC_DNS_HOST =
	/^panel\.(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})\.sslip\.io$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

interface PanelAccess {
	host: string;
	ip: string | null;
	isMagicDns: boolean;
	url: string;
}

/**
 * Derive the panel's public address from BETTER_AUTH_URL (the origin the panel
 * is actually served on). When the host is a magic-DNS sslip.io name we recover
 * the IP from the dashed octets with zero host exec. Otherwise we fall back to
 * the same allowlisted read-only IP probe serverInfo-style host reads use. Never
 * returns secrets — only the public URL/host/IP the owner already sees.
 */
async function derivePanelAccess(): Promise<PanelAccess> {
	let host = "";
	try {
		host = new URL(env.BETTER_AUTH_URL).host;
	} catch {
		host = "";
	}
	const bare = host.split(":")[0] ?? host;
	const magic = bare.match(MAGIC_DNS_HOST);
	if (magic) {
		const ip = `${magic[1]}.${magic[2]}.${magic[3]}.${magic[4]}`;
		return { url: env.BETTER_AUTH_URL, host, ip, isMagicDns: true };
	}
	let ip: string | null = null;
	try {
		const probed = (
			await hostExec(["curl", "-fsS", "https://api.ipify.org"])
		).trim();
		ip = IPV4.test(probed) ? probed : null;
	} catch {
		ip = null;
	}
	return { url: env.BETTER_AUTH_URL, host, ip, isMagicDns: false };
}

export const setupRouter = {
	needsSetup: publicProcedure.handler(
		async (): Promise<{ needsSetup: boolean }> => ({
			needsSetup: (await adminCount()) === 0,
		})
	),

	/**
	 * Public read for the onboarding wizard's "Your control panel address" step.
	 * Pre-auth on purpose (the owner is created in the same flow). Returns only
	 * the public URL/host/IP — never any secret.
	 */
	panelAccess: publicProcedure.handler(
		async (): Promise<PanelAccess> => await derivePanelAccess()
	),

	/**
	 * First-run owner creation. THE load-bearing security guard lives here: the
	 * handler re-checks server-side that ZERO admin users exist before creating
	 * anyone, and refuses otherwise. This must NEVER trust the client — the
	 * /setup redirect is UX only. Defense in depth: even if this guard were
	 * bypassed, the auth databaseHooks.user.create.before hook independently
	 * throws FORBIDDEN for any non-first public create, so at most one admin can
	 * ever be minted. The password is never logged.
	 */
	completeSetup: publicProcedure
		.input(
			z.object({
				email: z.string().email(),
				password: z.string().min(MIN_PASSWORD).max(MAX_PASSWORD),
				name: z.string().min(2).max(120).optional(),
			})
		)
		.handler(async ({ input }): Promise<{ ok: true }> => {
			// CRITICAL GUARD: re-run the same admin-count query needsSetup uses.
			// An attacker must never create an admin on an already-set-up panel.
			if ((await adminCount()) > 0) {
				throw new ORPCError("FORBIDDEN", {
					message: "Setup is already complete.",
				});
			}

			try {
				// Create the first user via better-auth. The first-user-becomes-admin
				// hook promotes them to role=admin automatically. better-auth enforces
				// its own password length server-side too. NEVER log the password.
				await auth.api.signUpEmail({
					body: {
						email: input.email,
						password: input.password,
						name: input.name ?? "Owner",
					},
				});
			} catch (cause) {
				const apiError = asAuthApiError(cause);
				if (apiError) {
					// Duplicate email or a closed-registration create-hook rejection:
					// map to a generic conflict/forbidden — never leak which one.
					if (
						apiError.status === "UNPROCESSABLE_ENTITY" ||
						apiError.status === "BAD_REQUEST"
					) {
						throw new ORPCError("CONFLICT", {
							message:
								"That account could not be created. Try a different email.",
						});
					}
					throw new ORPCError("FORBIDDEN", {
						message: "Setup is already complete.",
					});
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Couldn't create the owner account.",
				});
			}

			// Return only an acknowledgement — no tokens, no password echo. The
			// client signs in next on the canonical /api/auth path to set the cookie.
			return { ok: true };
		}),
};
