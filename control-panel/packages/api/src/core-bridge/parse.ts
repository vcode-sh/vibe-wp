import { z } from "zod";

import type { BackupRecord, LogLine, PerfReport } from "../contract";

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

export function parseBackups(stdout: string): BackupRecord[] {
	const records: BackupRecord[] = [];
	for (const raw of stdout.split("\n")) {
		const path = raw.trim().replace(TRAILING_SLASH, "");
		if (!path) {
			continue;
		}
		records.push({
			id: path,
			location:
				path.includes("/offsite") || path.includes("remote")
					? "offsite"
					: "local",
			sizeMB: 0,
			verified: true,
			whenISO: isoFromPath(path),
		});
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

export function parseLogLines(
	stdout: string,
	source: LogLine["source"]
): LogLine[] {
	return stdout
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.slice(-200)
		.map((text, i) => ({
			id: String(i),
			source,
			text,
			whenISO: new Date(0).toISOString(),
		}));
}
