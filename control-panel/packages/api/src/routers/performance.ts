import { z } from "zod";

import type { PerfAdvice, PerfRecommendation } from "../contract";
import { runVibe } from "../core-bridge/exec";
import {
	advisePerf,
	buildPreviewDiff,
	PERF_TUNABLE_KEYS,
} from "../core-bridge/perf-advisor";
import { startPerfApply } from "../core-bridge/perf-apply";
import { parsePerfMeasureJson } from "../core-bridge/perf-measure";
import { findSite } from "../core-bridge/sites";
import { adminProcedure, protectedProcedure } from "../procedures";

/** perf-measure samples over a ~2s window + container exec; allow generous time. */
const MEASURE_TIMEOUT_MS = 120_000;

const PERF_KEY_SET = new Set<string>(PERF_TUNABLE_KEYS);

/**
 * Read the site's current env values for the tunable keys via the non-secret
 * `env` op (each key is in the wrapper's ENV_KEY_ALLOWLIST? — only WP_MEMORY_LIMIT
 * is, so we read what we can and let the measurement fill the rest). The advisor
 * is defensive: a missing env value falls back to the measured figure.
 */
async function readCurrentEnv(
	installDir: string
): Promise<Record<string, string>> {
	const env: Record<string, string> = {};
	// Only WP_MEMORY_LIMIT is in the wrapper's non-secret env allowlist; the rest
	// of the tunables are derived from the measurement snapshot (maxChildren,
	// buffer-pool size, redis maxmemory all come back from perf-measure). Reading
	// a non-allowlisted key would be rejected at the root boundary, so we don't.
	try {
		const { stdout, code } = await runVibe(installDir, "prod", "env", {
			args: ["WP_MEMORY_LIMIT"],
		});
		if (code === 0 && stdout.trim()) {
			env.WP_MEMORY_LIMIT = stdout.trim();
		}
	} catch {
		// best-effort — the advisor falls back to measured figures.
	}
	return env;
}

/** Mirror plugins.ts: resolve the public URL + (local) backup destination. */
async function resolvePerfContext(
	siteId: string
): Promise<{ siteUrl: string; r2: boolean }> {
	const site = await findSite(siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	const { stdout } = await runVibe(site.installDir, "prod", "env", {
		args: ["WP_HOME"],
	});
	return { siteUrl: stdout.trim() || "http://localhost", r2: false };
}

export const performanceRouter = {
	/**
	 * READ/ADVISORY — the shippable surface. Measures, then runs the PURE advisor.
	 * No host mutation. Returns the measurements, the explainable recommendations,
	 * the reserved-vs-85%-cap budget, and a preview diff.
	 */
	perfAdvice: protectedProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input }): Promise<PerfAdvice | null> => {
			const site = await findSite(input.siteId);
			if (!site) {
				return null;
			}
			const measured = await runVibe(site.installDir, "prod", "perfMeasure", {
				timeoutMs: MEASURE_TIMEOUT_MS,
			});
			const measurements = parsePerfMeasureJson(measured.stdout);
			const currentEnv = await readCurrentEnv(site.installDir);
			const advice = advisePerf(
				measurements,
				measurements.host.ramTotalMiB,
				currentEnv
			);
			const { diff, text } = buildPreviewDiff(advice.recommendations);
			return {
				measurements,
				recommendations: advice.recommendations,
				reservedMiB: advice.reservedMiB,
				headroomMiB: advice.headroomMiB,
				capMiB: advice.capMiB,
				previewDiff: diff,
				previewText: text,
			};
		}),

	/**
	 * MUTATING — EXPERIMENTAL, NOT YET VALIDATED on a real VPS. ADMIN-GATED.
	 * Re-derives the recommendations server-side from a fresh measurement so the
	 * applied set is exactly what the advisor (with its 85% RAM cap) produced — the
	 * client never supplies raw values. bin/perf-apply re-asserts the cap + the
	 * fixed key allowlist at the root boundary. Returns { jobId }.
	 */
	perfApply: adminProcedure
		.input(z.object({ siteId: z.string() }))
		.handler(async ({ input, context }): Promise<{ jobId: string }> => {
			const site = await findSite(input.siteId);
			if (!site) {
				throw new Error("Unknown site");
			}
			// Recompute from a fresh measurement — do NOT trust client-supplied values.
			const measured = await runVibe(site.installDir, "prod", "perfMeasure", {
				timeoutMs: MEASURE_TIMEOUT_MS,
			});
			const measurements = parsePerfMeasureJson(measured.stdout);
			const currentEnv = await readCurrentEnv(site.installDir);
			const advice = advisePerf(
				measurements,
				measurements.host.ramTotalMiB,
				currentEnv
			);
			const recommendations: PerfRecommendation[] =
				advice.recommendations.filter((r) => PERF_KEY_SET.has(r.key));
			const { siteUrl, r2 } = await resolvePerfContext(input.siteId);
			return startPerfApply({
				siteId: input.siteId,
				env: "prod",
				recommendations,
				userId: context.session.user.id,
				siteUrl,
				r2,
			});
		}),
};
