/**
 * Pure extractors that turn a `parseMonitorJson` result into the structured,
 * persistable fields of a monitor sample. NO DB / NO IO so this is fully
 * unit-testable.
 *
 * SOURCING NOTE (the OPEN DECISION, option A — parse-from-names): the current
 * `monitor --json` op does NOT expose certDaysLeft / httpStatus / dnsOk as
 * structured JSON fields, and there is NO dedicated DNS check. To avoid changing
 * the monitor COLLECTION logic, these fields are recovered here:
 *   - First, from OPTIONAL structured JSON fields if a future bin/monitor build
 *     adds them (`certDaysLeft` / `httpStatus` / `dnsOk` on the envelope).
 *   - Otherwise, by regex over the existing check `name` strings produced by
 *     bin/lib/monitor.sh (stable, English, LC_ALL=C-safe phrasings).
 *
 * `dnsOk` is APPROXIMATE: with no real DNS check, it is derived from HTTP
 * reachability (a name that fails to resolve makes the HTTP check fail). It is
 * surfaced to the contract/UI labelled as approximate. See risks #4 in the spec.
 */

/** The subset of a parseMonitorJson result this module consumes. */
export interface MonitorParsed {
	/** Optional structured enrichments (only present if bin/monitor adds them). */
	certDaysLeft?: number | null;
	checks: { name: string; ok: boolean }[];
	dnsOk?: boolean | null;
	failures: number;
	httpStatus?: number | null;
	status: "ok" | "warn" | "fail";
	uptimePercent: number;
	warnings: number;
}

/** The flat, persistable shape of one monitor sample (pre-id, pre-ts). */
export interface MonitorSampleFields {
	certDaysLeft: number | null;
	dnsOk: number | null;
	failures: number;
	httpStatus: number | null;
	status: "ok" | "warn" | "fail";
	up: number;
	warnings: number;
}

// "HTTP uptime: https://example.com returned 200"
const HTTP_RETURNED = /returned\s+(\d{3})\b/;
// "TLS certificate: host valid for 42 day(s)" / "expires in 7 day(s)"
const CERT_VALID = /valid for\s+(\d+)\s+day/;
const CERT_EXPIRES = /expires in\s+(\d+)\s+day/;
// "TLS certificate: host expired 3 day(s) ago"
const CERT_EXPIRED = /expired\s+(\d+)\s+day/;

/** Reachability: `up` is binary — derived from the HTTP-uptime check. */
export function deriveUp(parsed: MonitorParsed): number {
	// uptimePercent is 100 only when the HTTP check passed (see bin/monitor),
	// otherwise 0. Treat >= 100 as reachable. Fall back to the named HTTP check
	// when uptimePercent is absent/unexpected.
	if (parsed.uptimePercent >= 100) {
		return 1;
	}
	const http = parsed.checks.find((c) =>
		c.name.toLowerCase().startsWith("http uptime")
	);
	return http?.ok ? 1 : 0;
}

/** Last HTTP status code, from the structured field or the check-name regex. */
export function deriveHttpStatus(parsed: MonitorParsed): number | null {
	if (typeof parsed.httpStatus === "number") {
		return parsed.httpStatus;
	}
	const http = parsed.checks.find((c) =>
		c.name.toLowerCase().startsWith("http uptime")
	);
	if (!http) {
		return null;
	}
	const m = HTTP_RETURNED.exec(http.name);
	return m ? Number(m[1]) : null;
}

/** TLS days-to-expiry (negative = expired), from the field or the check name. */
export function deriveCertDaysLeft(parsed: MonitorParsed): number | null {
	if (typeof parsed.certDaysLeft === "number") {
		return parsed.certDaysLeft;
	}
	const cert = parsed.checks.find((c) =>
		c.name.toLowerCase().startsWith("tls certificate")
	);
	if (!cert) {
		return null;
	}
	const expired = CERT_EXPIRED.exec(cert.name);
	if (expired) {
		return -Number(expired[1]);
	}
	const valid = CERT_VALID.exec(cert.name);
	if (valid) {
		return Number(valid[1]);
	}
	const expires = CERT_EXPIRES.exec(cert.name);
	if (expires) {
		return Number(expires[1]);
	}
	// A skipped/unparseable cert check (e.g. "no public domain") yields null.
	return null;
}

/**
 * DNS-ok flag. APPROXIMATE today: no dedicated DNS check exists, so a name that
 * fails to resolve manifests as a failed HTTP check. We therefore derive dnsOk
 * from HTTP reachability unless a real structured `dnsOk` is present. Returns
 * null only when there is no HTTP signal at all.
 */
export function deriveDnsOk(parsed: MonitorParsed): number | null {
	if (typeof parsed.dnsOk === "boolean") {
		return parsed.dnsOk ? 1 : 0;
	}
	const http = parsed.checks.find((c) =>
		c.name.toLowerCase().startsWith("http uptime")
	);
	if (!http) {
		return null;
	}
	// A reachable site necessarily resolved; an unreachable one MAY be a DNS
	// failure or a server error — flagged approximate at the contract/UI layer.
	return http.ok ? 1 : 0;
}

/** Compose all derived fields into the flat persistable shape. */
export function extractSampleFields(
	parsed: MonitorParsed
): MonitorSampleFields {
	return {
		status: parsed.status,
		up: deriveUp(parsed),
		httpStatus: deriveHttpStatus(parsed),
		certDaysLeft: deriveCertDaysLeft(parsed),
		dnsOk: deriveDnsOk(parsed),
		failures: parsed.failures,
		warnings: parsed.warnings,
	};
}

/** Epoch-ms cutoff for a `sinceDays` window, clamped to 1..90 days. */
export function sinceCutoffMs(sinceDays: number, now = Date.now()): number {
	const days = Math.min(Math.max(Math.trunc(sinceDays), 1), 90);
	return now - days * 24 * 60 * 60 * 1000;
}

/**
 * Uptime percentage over a set of samples = fraction of samples whose `up` is 1,
 * rounded to one decimal. This is an HONEST "fraction of probes that were
 * reachable", NOT a fabricated SLA. Returns null for an empty set.
 */
export function uptimePercentOver(samples: { up: number }[]): number | null {
	if (samples.length === 0) {
		return null;
	}
	const upCount = samples.reduce((n, s) => n + (s.up ? 1 : 0), 0);
	return Math.round((upCount / samples.length) * 1000) / 10;
}
