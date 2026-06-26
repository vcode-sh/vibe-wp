import { env } from "@control-panel/env/server";
import { ORPCError } from "@orpc/server";
import { z } from "zod";

import type {
	PanelDomainApplyResult,
	SecurityStatus,
	ServerInfo,
} from "../contract";
import {
	hostExec,
	runSupportBundle,
	runVibe,
	SUPPORT_BUNDLE_MAX_BYTES,
} from "../core-bridge/exec";
import { launchPanelUpdateJob, startJob } from "../core-bridge/jobs";
import { writeAudit } from "../core-bridge/jobs-db";
import {
	applyPanelDomain,
	panelMagicUrl,
} from "../core-bridge/panel-domain-apply";
import { parseSecurityStatus, parseSmoke } from "../core-bridge/parse";
import { panelDomainSchema } from "../core-bridge/provision-input";
import { readSiteOverviewSnapshot } from "../core-bridge/site-overview-cache";
import {
	kickSiteOverviewRefresh,
	shouldRefreshSiteOverview,
} from "../core-bridge/site-overview-refresher";
import { type DetectedSite, detectSites } from "../core-bridge/sites";
import { adminProcedure, protectedProcedure } from "../procedures";

/** UTC YYYYMMDD-HHMM stamp for the downloaded support-bundle filename. */
function bundleStamp(now = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return (
		`${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
		`-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`
	);
}

const WHITESPACE = /\s+/;

function diskPercentFromDf(out: string): number {
	// `df -P /` second line, 5th column like "41%"
	const line = out.trim().split("\n")[1] ?? "";
	const pct = line.split(WHITESPACE)[4] ?? "0%";
	return Number.parseInt(pct.replace("%", ""), 10) || 0;
}

async function cachedSiteHealthy(site: DetectedSite): Promise<boolean> {
	const snapshot = await readSiteOverviewSnapshot(site.id);
	if (shouldRefreshSiteOverview(snapshot)) {
		kickSiteOverviewRefresh(site);
	}
	return snapshot?.payload.status === "good";
}

export const serverRouter = {
	serverInfo: protectedProcedure.handler(async (): Promise<ServerInfo> => {
		const sites = await detectSites();
		const df = await hostExec(["df", "-P", "/"]);
		const host = (await hostExec(["hostname", "-f"])).trim();
		const statuses = await Promise.all(sites.map(cachedSiteHealthy));
		return {
			vps: env.PANEL_VPS_LABEL ?? host ?? "this server",
			siteCount: sites.length,
			diskPercent: diskPercentFromDf(df),
			allHealthy: statuses.every(Boolean),
		};
	}),

	serverDoctor: protectedProcedure.handler(async () => {
		const sites = await detectSites();
		const site = sites[0];
		if (!site) {
			// No sites yet — return an empty-checks result (nothing running to check).
			return parseSmoke("");
		}
		return parseSmoke(
			(await runVibe(site.installDir, "prod", "doctorRuntime")).stdout
		);
	}),

	securityStatus: protectedProcedure.handler(
		async (): Promise<SecurityStatus> => {
			// Host-level check; runs against the canonical PANEL_HOST_DIR checkout,
			// not a per-site dir — so it works with zero sites.
			const { stdout } = await runVibe(
				env.PANEL_HOST_DIR,
				"prod",
				"securityStatus"
			);
			return parseSecurityStatus(stdout);
		}
	),

	serverHarden: adminProcedure.handler(({ context }) => {
		// Host-level hardening runs against PANEL_HOST_DIR (siteId "server" maps
		// to env.PANEL_HOST_DIR inside startJob).
		return startJob({
			op: "harden",
			siteId: "server",
			env: "prod",
			kind: "harden",
			userId: context.session.user.id,
			action: "harden",
		});
	}),

	/**
	 * Admin-only: generate a REDACTED diagnostics support bundle and return it as
	 * base64 for the browser to save. The host script (bin/support-bundle) emits a
	 * gzip tar with every text member redacted BEFORE archiving — passwords, salts,
	 * API keys and tokens are never included. We carry the bytes as base64 over
	 * oRPC (the wire is JSON, so binary needs encoding) and cap the size defensively
	 * (runSupportBundle rejects archives over SUPPORT_BUNDLE_MAX_BYTES).
	 */
	supportBundleDownload: adminProcedure.handler(
		async ({ context }): Promise<{ base64: string; filename: string }> => {
			let bytes: Uint8Array;
			try {
				bytes = await runSupportBundle();
			} catch (cause) {
				const message =
					cause instanceof Error ? cause.message : "support bundle failed";
				if (message.includes("too large")) {
					throw new ORPCError("PAYLOAD_TOO_LARGE", {
						message: `Support bundle exceeds the ${Math.round(
							SUPPORT_BUNDLE_MAX_BYTES / (1024 * 1024)
						)} MB limit.`,
					});
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Couldn't generate the support bundle.",
				});
			}
			await writeAudit(
				context.session.user.id,
				"support-bundle",
				"server",
				null
			);
			return {
				base64: Buffer.from(bytes).toString("base64"),
				filename: `vibe-wp-support-${bundleStamp()}.tar.gz`,
			};
		}
	),

	/**
	 * Admin-only: update the whole Vibe WP stack + panel from the GUI. Runs
	 * `bin/panel update` (git pull + rebuild + restart) as a STREAMED job, surfaced
	 * in the operations tray. The update detaches itself from the panel process
	 * tree (systemd-run) so the panel's own restart at the end does not kill the
	 * job; the stream follows the update unit's journal, so the client reconnects
	 * and sees completion once the panel is back. Returns { jobId } like serverHarden.
	 */
	serverUpdateStack: adminProcedure.handler(async ({ context }) => {
		const result = await launchPanelUpdateJob({
			userId: context.session.user.id,
		});
		return result;
	}),

	/**
	 * Admin-only: apply a custom CONTROL-PANEL domain (panel.theirsite.com) from
	 * Settings. SAFE + ADDITIVE — the host op only ADDS the custom domain to the
	 * panel's Caddy site ALONGSIDE the always-working magic-DNS host (never
	 * replacing it), validates Caddy before reloading (restore-on-failure), and
	 * adds the custom origin to the panel's trusted origins WITHOUT moving the
	 * primary baseURL/CORS origin — so the owner can never be locked out. The
	 * domain is strictly validated by panelDomainSchema (pre-spawn) and again at
	 * the root boundary (bin/vibe-panel-run). Returns ok/pending so the GUI can
	 * tell the owner whether DNS is ready or still propagating.
	 */
	panelDomainApply: adminProcedure
		.input(z.object({ domain: panelDomainSchema }))
		.handler(async ({ context, input }): Promise<PanelDomainApplyResult> => {
			let result: PanelDomainApplyResult;
			try {
				result = await applyPanelDomain(input.domain, panelMagicUrl());
			} catch {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Couldn't apply the custom domain. Your panel is unchanged.",
				});
			}
			await writeAudit(
				context.session.user.id,
				"panel-domain-apply",
				"server",
				null
			);
			return result;
		}),
};
