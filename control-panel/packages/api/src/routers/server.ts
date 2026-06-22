import { env } from "@control-panel/env/server";
import { ORPCError } from "@orpc/server";

import type { ServerInfo } from "../contract";
import { hostExec, runVibe } from "../core-bridge/exec";
import { startJob } from "../core-bridge/jobs";
import { parseSmoke } from "../core-bridge/parse";
import { detectSites } from "../core-bridge/sites";
import { adminProcedure, protectedProcedure } from "../procedures";

const WHITESPACE = /\s+/;

function diskPercentFromDf(out: string): number {
	// `df -P /` second line, 5th column like "41%"
	const line = out.trim().split("\n")[1] ?? "";
	const pct = line.split(WHITESPACE)[4] ?? "0%";
	return Number.parseInt(pct.replace("%", ""), 10) || 0;
}

export const serverRouter = {
	serverInfo: protectedProcedure.handler(async (): Promise<ServerInfo> => {
		const sites = await detectSites();
		const df = await hostExec(["df", "-P", "/"]);
		const host = (await hostExec(["hostname", "-f"])).trim();
		const statuses = await Promise.all(
			sites.map(async (s) => {
				const { stdout, code } = await runVibe(s.installDir, "prod", "smoke", {
					timeoutMs: 90_000,
				});
				return code === 0 && parseSmoke(stdout).passed;
			})
		);
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
			throw new ORPCError("NOT_FOUND");
		}
		return parseSmoke(
			(await runVibe(site.installDir, "prod", "doctorRuntime")).stdout
		);
	}),

	serverHarden: adminProcedure.handler(async ({ context }) => {
		const sites = await detectSites();
		const site = sites[0];
		if (!site) {
			throw new ORPCError("NOT_FOUND");
		}
		return startJob({
			op: "harden",
			siteId: site.id,
			env: "prod",
			kind: "harden",
			userId: context.session.user.id,
			action: "harden",
		});
	}),
};
