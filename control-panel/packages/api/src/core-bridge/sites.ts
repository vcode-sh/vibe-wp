import { env } from "@control-panel/env/server";

import { hostFromUrl, parseEnvFile } from "./parse";

const STRIP_BIN_VIBE = /\/bin\/vibe$/;

export interface DetectedSite {
	domain: string;
	hasStaging: boolean;
	id: string;
	installDir: string;
	slug: string;
}

async function readFileSafe(path: string): Promise<string> {
	try {
		return await Bun.file(path).text();
	} catch {
		return "";
	}
}

export async function detectSites(): Promise<DetectedSite[]> {
	const roots = env.PANEL_SITES_ROOTS.split(":").filter(Boolean).join(" ");
	const proc = Bun.spawn(
		[
			"sh",
			"-lc",
			`for root in ${roots}; do [ -d "$root" ] && find "$root" -maxdepth 4 -type f -path '*/bin/vibe' 2>/dev/null; done`,
		],
		{ stdout: "pipe" }
	);
	const out = await new Response(proc.stdout).text();
	const dirs = out
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean)
		.map((p) => p.replace(STRIP_BIN_VIBE, ""));

	const sites: DetectedSite[] = [];
	for (const dir of dirs) {
		const prod = parseEnvFile(await readFileSafe(`${dir}/env/prod.env`));
		const stage = parseEnvFile(await readFileSafe(`${dir}/env/stage.env`));
		const home = prod.WP_HOME ?? stage.WP_HOME;
		if (!home) {
			continue;
		}
		const slug = dir.split("/").filter(Boolean).pop() ?? dir;
		sites.push({
			id: slug,
			slug,
			installDir: dir,
			domain: hostFromUrl(home),
			hasStaging: Boolean(stage.WP_HOME),
		});
	}
	return sites;
}

export async function findSite(siteId: string): Promise<DetectedSite | null> {
	return (await detectSites()).find((s) => s.id === siteId) ?? null;
}
