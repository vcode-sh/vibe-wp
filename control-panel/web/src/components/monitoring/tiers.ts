/**
 * Pure display-tier logic for the monitoring tiles. Each helper maps a raw
 * value to one of three plain-language severities — "ok" (green), "warn"
 * (amber), "alert" (red) — plus "none" when there is no data yet. Keeping this
 * pure (no JSX, no tokens) makes the green/amber/red thresholds unit-testable
 * and keeps the components purely presentational. The thresholds match the host
 * monitor (bin/lib/monitor.sh: cert warn < 14 days) and add the operator-facing
 * "alert < 3 days" tier the spec asks for.
 */

/** Display severity for a tile. "none" = no sample / not measured yet. */
export type Tier = "ok" | "warn" | "alert" | "none";

/** Cert warn threshold (days). Mirrors VIBE_MONITOR_CERT_WARN_DAYS default. */
export const CERT_WARN_DAYS = 14;
/** Cert alert threshold (days). Renewal is overdue/urgent below this. */
export const CERT_ALERT_DAYS = 3;

/**
 * Cert tier from days-left. null → "none". Expired (negative) or < 3 days →
 * "alert". < 14 days → "warn". Otherwise "ok".
 */
export function certTier(daysLeft: number | null): Tier {
	if (daysLeft === null) {
		return "none";
	}
	if (daysLeft < 0 || daysLeft < CERT_ALERT_DAYS) {
		return "alert";
	}
	if (daysLeft < CERT_WARN_DAYS) {
		return "warn";
	}
	return "ok";
}

/** Human-readable cert label: "valid 42 days", "expires in 2 days", "expired 5 days ago", "—". */
export function certLabel(daysLeft: number | null): string {
	if (daysLeft === null) {
		return "Not measured";
	}
	if (daysLeft < 0) {
		const n = Math.abs(daysLeft);
		return `Expired ${n} day${n === 1 ? "" : "s"} ago`;
	}
	if (daysLeft < CERT_WARN_DAYS) {
		return `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
	}
	return `Valid ${daysLeft} days`;
}

/**
 * Uptime tier from a fraction-of-probes-reachable percentage. null → "none".
 * 100% → "ok". >= 95% → "warn" (a few blips). < 95% → "alert" (sustained
 * downtime). These are panel display tiers, NOT an SLA.
 */
export function uptimeTier(percent: number | null): Tier {
	if (percent === null) {
		return "none";
	}
	if (percent >= 100) {
		return "ok";
	}
	if (percent >= 95) {
		return "warn";
	}
	return "alert";
}

/** DNS tier from the approximate dnsOk flag. null → "none", 1 → "ok", 0 → "alert". */
export function dnsTier(dnsOk: 0 | 1 | null): Tier {
	if (dnsOk === null) {
		return "none";
	}
	return dnsOk === 1 ? "ok" : "alert";
}

/** Plain-language DNS label for the approximate dnsOk flag. */
export function dnsLabel(dnsOk: 0 | 1 | null): string {
	if (dnsOk === null) {
		return "Unknown";
	}
	return dnsOk === 1 ? "Resolving" : "Not resolving";
}

/** Overall status tier from the monitor verdict. */
export function statusTier(status: "ok" | "warn" | "fail" | "unknown"): Tier {
	if (status === "ok") {
		return "ok";
	}
	if (status === "warn") {
		return "warn";
	}
	if (status === "fail") {
		return "alert";
	}
	return "none";
}

/** Tailwind text-color class for a tier (semantic tokens only). */
export function tierTextClass(tier: Tier): string {
	if (tier === "ok") {
		return "text-success";
	}
	if (tier === "warn") {
		return "text-warning";
	}
	if (tier === "alert") {
		return "text-destructive";
	}
	return "text-muted-foreground";
}

/**
 * The worst tier in a set, for an overall roll-up dot. Order:
 * alert > warn > none > ok is NOT right — "none" (no data) must not mask a real
 * problem, so we rank alert > warn > ok > none.
 */
export function worstTier(tiers: Tier[]): Tier {
	const rank: Record<Tier, number> = { alert: 3, warn: 2, ok: 1, none: 0 };
	let worst: Tier = "none";
	for (const t of tiers) {
		if (rank[t] > rank[worst]) {
			worst = t;
		}
	}
	return worst;
}
