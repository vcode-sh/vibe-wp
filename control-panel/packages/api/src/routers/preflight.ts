import { promises as dns } from "node:dns";

import { z } from "zod";

import type { DnsPreflightResult } from "../contract";
import { runHeadlessRequest } from "../core-bridge/provision";
import { domainSchema } from "../core-bridge/provision-input";
import { operatorProcedure } from "../procedures";

/**
 * DNS preflight for the create-site wizard. ADVISORY ONLY: it checks whether the
 * chosen domain's A record(s) already point at this VPS so the wizard can warn
 * (and gate the Create button) before the operator commits. The installer's own
 * dns-preflight task re-validates during the real plan run, so an operator
 * "Create anyway" override never bypasses real safety — it only lets them
 * proceed while DNS is still propagating.
 *
 * No host command is spawned for the lookup: node:dns/promises resolve4 is a
 * library DNS query (UDP via the resolver), not a shell exec, so it does NOT
 * need the host-exec chokepoint/allowlist. The VPS's own public IP comes from
 * the ALREADY-allowlisted installer `--headless-json` detect bridge.
 */

/** Pure: derive the user-facing {ok,message} from resolved A records + our IP. */
export function compareDnsResult(
	domain: string,
	resolvedIps: string[],
	expectedIp: string | null
): DnsPreflightResult {
	const resolvedIp = resolvedIps[0] ?? null;
	// Egress blocked / detection failed → soft warning, never a hard block.
	if (!expectedIp) {
		return {
			domain,
			expectedIp: null,
			ok: false,
			message:
				"Couldn't detect this server's IP to compare, so DNS can't be checked here — you can still create the site.",
			resolvedIp,
		};
	}
	if (resolvedIps.length === 0) {
		return {
			domain,
			expectedIp,
			ok: false,
			message: `DNS for ${domain} doesn't point here yet — set an A record to ${expectedIp}. It can take a while to propagate.`,
			resolvedIp: null,
		};
	}
	// Membership, not equality: a domain can have several A records (NAT, failover,
	// round-robin). Match the installer's grep-any-resolved-IP behaviour.
	if (resolvedIps.includes(expectedIp)) {
		return {
			domain,
			expectedIp,
			ok: true,
			message: `DNS for ${domain} points to this VPS (${expectedIp}).`,
			resolvedIp: expectedIp,
		};
	}
	return {
		domain,
		expectedIp,
		ok: false,
		message: `DNS for ${domain} points to ${resolvedIps.join(", ")}, not this VPS (${expectedIp}). Set an A record to ${expectedIp}, or if it's behind a CDN/proxy (e.g. Cloudflare), create anyway — propagation and proxies can hide the real IP.`,
		resolvedIp,
	};
}

/** Resolve A records for a domain. Never throws — empty array on any failure. */
async function resolveA(domain: string): Promise<string[]> {
	try {
		return await dns.resolve4(domain);
	} catch {
		// NXDOMAIN / SERVFAIL / timeout / not-yet-propagated all land here.
		return [];
	}
}

interface DetectedIpCache {
	expiresAt: number;
	ip: string | null;
}

const IP_CACHE_TTL_MS = 5 * 60 * 1000;
let detectedIpCache: DetectedIpCache | null = null;

/** Test seam: reset the in-module public-IP cache. */
export function resetDetectedIpCache(): void {
	detectedIpCache = null;
}

function readPublicIp(host: unknown): string | null {
	if (host && typeof host === "object" && "publicIp" in host) {
		const ip = (host as { publicIp?: unknown }).publicIp;
		return typeof ip === "string" && ip.length > 0 ? ip : null;
	}
	return null;
}

/**
 * This VPS's public IP via the allowlisted installer detect bridge, cached for
 * IP_CACHE_TTL_MS so a Re-check button doesn't re-probe egress on every click.
 * Returns null (never throws) when detection fails or the binary is missing
 * (e.g. local dev), so the wizard degrades to a soft warning instead of wedging.
 */
async function detectPublicIp(): Promise<string | null> {
	const now = Date.now();
	if (detectedIpCache && detectedIpCache.expiresAt > now) {
		return detectedIpCache.ip;
	}
	let ip: string | null = null;
	try {
		const res = await runHeadlessRequest({ kind: "detect" });
		if (res.kind === "detect") {
			ip = readPublicIp(res.host);
		}
	} catch {
		ip = null;
	}
	detectedIpCache = { ip, expiresAt: now + IP_CACHE_TTL_MS };
	return ip;
}

export const preflightRouter = {
	dnsPreflight: operatorProcedure
		.input(z.object({ domain: domainSchema }))
		.handler(async ({ input }): Promise<DnsPreflightResult> => {
			const domain = input.domain.trim().toLowerCase();
			const [resolvedIps, expectedIp] = await Promise.all([
				resolveA(domain),
				detectPublicIp(),
			]);
			return compareDnsResult(domain, resolvedIps, expectedIp);
		}),
};
