import { z } from "zod";

import type {
	BackupRecord,
	LogLine,
	PerfReport,
	SecurityStatus,
} from "../contract";

export function parseEnvFile(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) {
			continue;
		}
		const eq = line.indexOf("=");
		if (eq === -1) {
			continue;
		}
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		out[key] = value;
	}
	return out;
}

export function hostFromUrl(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

export function parseSmoke(stdout: string): {
	passed: boolean;
	checks: { name: string; ok: boolean }[];
} {
	const checks: { name: string; ok: boolean }[] = [];
	for (const raw of stdout.split("\n")) {
		const line = raw.trim();
		const ok = line.startsWith("ok:");
		const failed = line.startsWith("failed:") || line.startsWith("fail:");
		if (ok || failed) {
			checks.push({ name: line.slice(line.indexOf(":") + 1).trim(), ok });
		}
	}
	return { passed: checks.length > 0 && checks.every((c) => c.ok), checks };
}

const TRAILING_SLASH = /\/$/;
// Real backup dirs are compact `YYYYMMDDTHHMMSSZ`; also accept dashed forms.
const TS_COMPACT = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/;
const TS_DASHED = /(\d{4}-\d{2}-\d{2})[T_](\d{2})[-:](\d{2})[-:](\d{2})/;

function isoFromPath(path: string): string {
	const c = TS_COMPACT.exec(path);
	if (c) {
		return `${c[1]}-${c[2]}-${c[3]}T${c[4]}:${c[5]}:${c[6]}Z`;
	}
	const d = TS_DASHED.exec(path);
	if (d) {
		return `${d[1]}T${d[2]}:${d[3]}:${d[4]}Z`;
	}
	return "";
}

function parseBinLocation(raw: string): BackupRecord["location"] {
	if (raw === "both") {
		return "both";
	}
	if (raw === "offsite") {
		return "offsite";
	}
	return "local";
}

function parseTabLine(trimmed: string): BackupRecord {
	// New TAB-separated format: <path>\t<bytes>\t<location>\t<complete>
	const parts = trimmed.split("\t");
	const path = (parts[0] ?? "").replace(TRAILING_SLASH, "");
	const bytes = Number(parts[1] ?? "0") || 0;
	const sizeMB = Math.round((bytes / 1_048_576) * 10) / 10;
	return {
		id: path,
		location: parseBinLocation(parts[2] ?? "local"),
		sizeMB,
		verified: (parts[3] ?? "") === "complete",
		whenISO: isoFromPath(path),
	};
}

function parsePathLine(path: string): BackupRecord {
	// Back-compat: old bin output — just a plain path, no tabs.
	return {
		id: path,
		location:
			path.includes("/offsite") || path.includes("remote")
				? "offsite"
				: "local",
		sizeMB: 0,
		verified: false,
		whenISO: isoFromPath(path),
	};
}

export function parseBackups(stdout: string): BackupRecord[] {
	const records: BackupRecord[] = [];
	for (const raw of stdout.split("\n")) {
		const trimmed = raw.trim().replace(TRAILING_SLASH, "");
		if (!trimmed) {
			continue;
		}
		records.push(
			trimmed.includes("\t") ? parseTabLine(trimmed) : parsePathLine(trimmed)
		);
	}
	return records.sort((a, b) => (a.whenISO < b.whenISO ? 1 : -1));
}

const checksEnvelope = z.object({
	passed: z.boolean(),
	checks: z.array(z.object({ name: z.string(), ok: z.boolean() })),
});

export function parseChecksJson(stdout: string): {
	passed: boolean;
	checks: { name: string; ok: boolean }[];
} {
	try {
		return checksEnvelope.parse(JSON.parse(stdout.trim()));
	} catch {
		return { passed: false, checks: [] };
	}
}

const monitorEnvelope = z.object({
	status: z.enum(["ok", "warn", "fail"]),
	failures: z.number(),
	warnings: z.number(),
	uptimePercent: z.number(),
	checks: z.array(z.object({ name: z.string(), ok: z.boolean() })),
});

export function parseMonitorJson(stdout: string): {
	status: "ok" | "warn" | "fail";
	failures: number;
	warnings: number;
	uptimePercent: number;
	checks: { name: string; ok: boolean }[];
} {
	try {
		return monitorEnvelope.parse(JSON.parse(stdout.trim()));
	} catch {
		return {
			status: "fail",
			failures: 0,
			warnings: 0,
			uptimePercent: 0,
			checks: [],
		};
	}
}

const perfEnvelope = z.object({
	ttfbMs: z.number(),
	cacheHitPercent: z.number(),
	opcacheHitPercent: z.number(),
	redisHitPercent: z.number(),
});

export function parsePerfJson(stdout: string): PerfReport {
	try {
		return perfEnvelope.parse(JSON.parse(stdout.trim()));
	} catch {
		return {
			ttfbMs: 0,
			cacheHitPercent: 0,
			opcacheHitPercent: 0,
			redisHitPercent: 0,
		};
	}
}

const securityEnvelope = z.object({
	firewall: z.boolean(),
	fail2ban: z.boolean(),
	autoUpdates: z.boolean(),
});

export function parseSecurityStatus(stdout: string): SecurityStatus {
	// A genuine all-off posture is VALID JSON ({"firewall":false,...}) and parses
	// normally. Unparseable/empty output means "couldn't determine" (e.g. the
	// script is missing or the process was killed) — THROW so the procedure
	// rejects and the UI shows its error state, rather than faking an all-off
	// posture that reads as a real (but false) "everything is off".
	return securityEnvelope.parse(JSON.parse(stdout.trim()));
}

export function parseWpUpdateCount(stdout: string): number {
	try {
		const arr = JSON.parse(stdout.trim());
		return Array.isArray(arr) ? arr.length : 0;
	} catch {
		return 0;
	}
}

// compose --timestamps format: <service>-<N>  | <RFC3339> <message>
const COMPOSE_LINE =
	/^([a-zA-Z0-9_-]+?)-\d+\s+\|\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*(.*)/;

// cron runs wp-cron, so its lines are WordPress activity → "wp".
// Infra containers (db/redis/adminer/etc.) have no app source → "system".
// Returns a concrete source for EVERY known service (never null).
function svcToSource(svc: string): LogLine["source"] {
	const s = svc.toLowerCase();
	if (s === "nginx") {
		return "nginx";
	}
	if (s === "wordpress" || s.startsWith("php")) {
		return "php";
	}
	if (s === "wp" || s === "cron" || s.startsWith("wp-")) {
		return "wp";
	}
	return "system";
}

export function parseLogLines(
	stdout: string,
	source: LogLine["source"]
): LogLine[] {
	// `source` seeds carry-forward so continuation lines that arrive before the
	// first matched prefix inherit the requested filter rather than going blank.
	let prevSource: LogLine["source"] = source;
	let prevWhen = "";
	return stdout
		.split("\n")
		.filter((l) => l.trim().length > 0)
		.slice(-200)
		.map((raw, i) => {
			const m = COMPOSE_LINE.exec(raw);
			if (m) {
				// A matched line is a fresh service line: always use its OWN service.
				// NEVER carry forward prevSource here — otherwise a real db/redis line
				// (known-but-infra) would wrongly inherit the previous line's source.
				const when = m[2] ?? "";
				const lineSource = svcToSource(m[1] ?? "");
				prevSource = lineSource;
				prevWhen = when;
				return {
					id: String(i),
					source: lineSource,
					text: m[3] ?? "",
					whenISO: when,
				};
			}
			// Regex MISS — genuine continuation line (e.g. a multi-line stack trace)
			// or unparseable output: carry forward the last known values.
			return {
				id: String(i),
				source: prevSource,
				text: raw.trim(),
				whenISO: prevWhen,
			};
		});
}
