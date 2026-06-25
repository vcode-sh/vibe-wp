import { z } from "zod";
import type { CveRef } from "../contract";
import type { VulnFeed } from "./security-radar";

/**
 * Strict parser for the `vuln-feed-fetch` host op output. The feed is an
 * UNTRUSTED external source, so the payload is treated like any other host op
 * stdout: capped at a max size and validated against a strict schema before it
 * can influence the radar. The DEFAULT is OFF — when no feed is configured the
 * op prints `{}` and parseVulnFeed returns an empty map (no CVE rows).
 */

const MAX_BYTES = 256 * 1024;

const CveRow = z.object({
	id: z.string().max(128),
	severity: z.enum(["critical", "high", "medium", "low"]),
	// Constraint tokens like "<5.3.1"; bounded count + length. Empty array = all versions.
	affected_versions: z.array(z.string().max(64)).max(50),
	fixed_in: z.string().max(64).nullable(),
	source_url: z.string().max(2048).nullable(),
});

// A map of slug -> rows. Slugs are bounded; the whole map is bounded too.
const FeedSchema = z.record(z.string().max(200), z.array(CveRow).max(200));

/**
 * Parse the feed op's stdout into a {slug: CveRef[]} map. Throws on
 * oversize/malformed input. An empty object (the default-OFF no-op output) is a
 * valid, empty feed. Blank stdout is also treated as an empty feed (the op may
 * print nothing when unconfigured).
 */
export function parseVulnFeed(stdout: string): VulnFeed {
	if (stdout.length > MAX_BYTES) {
		throw new Error(`vuln-feed payload too large (> ${MAX_BYTES} bytes)`);
	}
	const trimmed = stdout.trim();
	if (trimmed === "") {
		return {};
	}
	const parsed = FeedSchema.parse(JSON.parse(trimmed));
	// Re-key into a plain record typed as CveRef[] (schema already validated shape).
	const out: VulnFeed = {};
	for (const [slug, rows] of Object.entries(parsed)) {
		out[slug] = rows as CveRef[];
	}
	return out;
}
