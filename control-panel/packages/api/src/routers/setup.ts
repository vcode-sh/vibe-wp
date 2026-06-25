import { promises as dns } from "node:dns";
import { asAuthApiError, auth } from "@control-panel/auth";
import { db } from "@control-panel/db";
import { user } from "@control-panel/db/schema/auth";
import { env } from "@control-panel/env/server";
import { ORPCError } from "@orpc/server";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import type {
	DnsPreflightResult,
	PanelAccess,
	PanelDomainApplyResult,
} from "../contract";
import { hostExec } from "../core-bridge/exec";
import {
	applyPanelDomain,
	panelMagicUrl,
} from "../core-bridge/panel-domain-apply";
import { panelDomainSchema } from "../core-bridge/provision-input";
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

/**
 * The applied custom panel domain (host only) + its https URL, read from the
 * panel's own PANEL_EXTRA_TRUSTED_ORIGIN env var. Both null until one is applied.
 * Never a secret — it is the public address the owner chose.
 */
function deriveCustomDomain(): {
	customDomain: string | null;
	customUrl: string | null;
} {
	const origin = env.PANEL_EXTRA_TRUSTED_ORIGIN;
	if (!origin) {
		return { customDomain: null, customUrl: null };
	}
	try {
		const host = new URL(origin).host.split(":")[0] ?? null;
		return host
			? { customDomain: host, customUrl: origin }
			: { customDomain: null, customUrl: null };
	} catch {
		return { customDomain: null, customUrl: null };
	}
}

/**
 * Derive the panel's public address from BETTER_AUTH_URL (the origin the panel
 * is actually served on). When the host is a magic-DNS sslip.io name we recover
 * the IP from the dashed octets with zero host exec. Otherwise we fall back to
 * the same allowlisted read-only IP probe serverInfo-style host reads use. Also
 * surfaces any applied custom domain (PANEL_EXTRA_TRUSTED_ORIGIN). Never returns
 * secrets — only the public URL/host/IP the owner already sees.
 */
async function derivePanelAccess(): Promise<PanelAccess> {
	const custom = deriveCustomDomain();
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
		return { url: env.BETTER_AUTH_URL, host, ip, isMagicDns: true, ...custom };
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
	return { url: env.BETTER_AUTH_URL, host, ip, isMagicDns: false, ...custom };
}

/** Resolve A records for a domain. Never throws — empty array on any failure. */
async function resolveA(domain: string): Promise<string[]> {
	try {
		return await dns.resolve4(domain);
	} catch {
		return [];
	}
}

/**
 * Pure: derive the {ok,message} a DNS preflight shows for a panel domain. Mirrors
 * preflight.ts compareDnsResult but phrased for the panel-address step (a soft,
 * never-blocking advisory — the apply succeeds at the Caddy/auth level regardless).
 */
function comparePanelDns(
	domain: string,
	resolvedIps: string[],
	expectedIp: string | null
): DnsPreflightResult {
	const resolvedIp = resolvedIps[0] ?? null;
	if (!expectedIp) {
		return {
			domain,
			expectedIp: null,
			ok: false,
			message:
				"Couldn't detect this server's IP to compare — you can still apply the domain; it'll secure once DNS points here.",
			resolvedIp,
		};
	}
	if (resolvedIps.length === 0) {
		return {
			domain,
			expectedIp,
			ok: false,
			message: `${domain} doesn't point here yet — create an A record to ${expectedIp}. You can still apply now; it secures automatically once DNS propagates.`,
			resolvedIp: null,
		};
	}
	if (resolvedIps.includes(expectedIp)) {
		return {
			domain,
			expectedIp,
			ok: true,
			message: `${domain} points to this server (${expectedIp}) — ready to apply.`,
			resolvedIp: expectedIp,
		};
	}
	return {
		domain,
		expectedIp,
		ok: false,
		message: `${domain} points to ${resolvedIps.join(", ")}, not this server (${expectedIp}). Update the A record to ${expectedIp} — or apply anyway if it's behind a proxy (e.g. Cloudflare).`,
		resolvedIp,
	};
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
	 * the public URL/host/IP/customDomain — never any secret.
	 */
	panelAccess: publicProcedure.handler(
		async (): Promise<PanelAccess> => await derivePanelAccess()
	),

	/**
	 * Setup-gated DNS preflight for the onboarding "custom panel domain" expander.
	 * Public because the owner doesn't exist yet — but it ONLY runs while the panel
	 * still needs setup (adminCount === 0). It is read-only (a DNS lookup + the
	 * already-allowlisted IP read), never blocks, and once an owner exists the
	 * Settings page uses the authenticated dnsPreflight instead.
	 */
	setupPanelDnsPreflight: publicProcedure
		.input(z.object({ domain: panelDomainSchema }))
		.handler(async ({ input }): Promise<DnsPreflightResult> => {
			if ((await adminCount()) > 0) {
				throw new ORPCError("FORBIDDEN", {
					message: "Setup is already complete.",
				});
			}
			const domain = input.domain;
			const access = await derivePanelAccess();
			const resolvedIps = await resolveA(domain);
			return comparePanelDns(domain, resolvedIps, access.ip);
		}),

	/**
	 * Setup-gated custom-domain apply for onboarding. THE load-bearing guard (like
	 * completeSetup): re-check server-side that ZERO admins exist and REFUSE
	 * otherwise — an attacker must never repoint the panel domain on an already-
	 * set-up panel via this public surface. Once an owner exists this is admin-only
	 * via the Settings `panelDomainApply` procedure. SAFE + ADDITIVE: the host op
	 * only ADDS the custom domain alongside the magic-DNS host (which always keeps
	 * working) and validates Caddy before reloading.
	 */
	setupPanelDomainApply: publicProcedure
		.input(z.object({ domain: panelDomainSchema }))
		.handler(async ({ input }): Promise<PanelDomainApplyResult> => {
			if ((await adminCount()) > 0) {
				throw new ORPCError("FORBIDDEN", {
					message: "Setup is already complete.",
				});
			}
			try {
				return await applyPanelDomain(input.domain, panelMagicUrl());
			} catch {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Couldn't apply the custom domain. Your panel is unchanged.",
				});
			}
		}),

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
