import { ORPCError } from "@orpc/server";
import { z } from "zod";
import type { LogLine } from "../contract";
import {
	extractCache,
	isAccessLine,
	maskAccessPii,
	maskMariadbPii,
} from "../core-bridge/log-pii";

export const LOG_SERVICE = z.enum([
	"nginx",
	"php",
	"wp",
	"mariadb",
	"redis",
	"access",
	"all",
]);
export const LOG_TAIL = z.enum(["100", "500", "2000"]);
export type PanelService = z.infer<typeof LOG_SERVICE>;

// Panel source → docker compose SERVICE NAME. null = no service filter (all).
// access shares the nginx container (post-filtered to access-format lines).
const panelToDockerService: Record<PanelService, string | null> = {
	nginx: "nginx",
	php: "wordpress",
	wp: "cron",
	mariadb: "db",
	redis: "redis",
	access: "nginx",
	all: null,
};

/** Positional host args [service-or-"all", tail] for runVibe/streamVibe. */
export function hostArgs(service: PanelService, tail: string): string[] {
	return [panelToDockerService[service] ?? "all", tail];
}

/** Seed source for parseLogLines (matters only for pre-match continuation lines). */
export function mapServiceToSource(service: PanelService): LogLine["source"] {
	if (service === "all") {
		return "system";
	}
	if (service === "access") {
		return "access";
	}
	return service;
}

/** Split the shared nginx stream: nginx tab = error lines, access tab = access lines. */
export function applySourceFilter(
	lines: LogLine[],
	service: PanelService
): LogLine[] {
	if (service === "nginx") {
		return lines.filter((l) => !isAccessLine(l.text));
	}
	if (service === "access") {
		return lines.filter((l) => isAccessLine(l.text));
	}
	return lines;
}

/** Apply source-specific PII masking + cache extraction + access retagging. */
export function decorateLines(
	lines: LogLine[],
	service: PanelService
): LogLine[] {
	return lines.map((l) => {
		const next: LogLine = { ...l };
		if (service === "access") {
			next.source = "access";
		}
		if (isAccessLine(next.text)) {
			next.cache = extractCache(next.text);
			next.text = maskAccessPii(next.text);
		}
		if (next.source === "mariadb") {
			next.text = maskMariadbPii(next.text);
		}
		return next;
	});
}

export function applyTextFilter(lines: LogLine[], filter: string): LogLine[] {
	let re: RegExp | null = null;
	try {
		re = new RegExp(filter, "i");
	} catch {
		re = null;
	}
	const needle = filter.toLowerCase();
	return lines.filter((l) =>
		re ? re.test(l.text) : l.text.toLowerCase().includes(needle)
	);
}

const DB_LINE_PREFIX = /^\s*db-\d+\s*\|/;

/**
 * Mask a single RAW live-stream line (docker compose logs output, no timestamps,
 * prefixed `<service>-N | …`). Mirrors decorateLines for the streaming path:
 * client IPs are masked on access-format lines (so an operator tailing nginx/all
 * never sees visitor IPs), and SQL/user@host is masked on db-service lines.
 */
export function maskStreamLine(raw: string, service: PanelService): string {
	let line = raw;
	if (isAccessLine(line)) {
		line = maskAccessPii(line);
	}
	if (service === "mariadb" || DB_LINE_PREFIX.test(line)) {
		line = maskMariadbPii(line);
	}
	return line;
}

export const SENSITIVE_SOURCES = new Set<string>(["access", "mariadb"]);

/** Enforce admin for access/mariadb (operator procedure can't gate per-source). */
export function assertSourceAllowed(
	service: string,
	role: string | undefined
): void {
	if (SENSITIVE_SOURCES.has(service) && role !== "admin") {
		throw new ORPCError("FORBIDDEN", {
			message: "Access and database logs require an admin role.",
		});
	}
}
