import { env } from "@control-panel/env/server";

import type { PanelDomainApplyResult } from "../contract";
import {
	parsePanelDomainStatus,
	runPanelDomain,
	wrapPanelDomainArgv,
} from "./exec";

/**
 * Shared orchestration for applying a custom control-panel domain, used by BOTH
 * the onboarding (setup-gated) and the Settings (admin) procedures so the two
 * surfaces behave identically.
 *
 * PROD (a privileged runner is configured): the host op detaches itself via
 * systemd-run and its LAST step restarts the panel server (us). We therefore
 * CANNOT read its stdout synchronously — reading the stream here would die when
 * the panel restarts. So we LAUNCH it fire-and-forget and return "pending"
 * immediately; the GUI re-reads panelAccess after the brief restart to confirm
 * the custom domain landed (and the op secures it in the background once DNS
 * resolves). This never locks anyone out: Caddy keeps serving the magic-DNS host
 * throughout, and the existing session/cookie is on that origin.
 *
 * DEV (no runner): the op runs in-process, so we read its real ok/pending status.
 *
 * The domain is re-validated by wrapPanelDomainArgv before any spawn (and again at
 * the root boundary by bin/vibe-panel-run). `magicUrl` is the always-working
 * magic-DNS fallback; `customUrl` is the new https://<domain>.
 */
export async function applyPanelDomain(
	domain: string,
	magicUrl: string
): Promise<PanelDomainApplyResult> {
	const customUrl = `https://${domain}`;
	const hasRunner = Boolean(process.env.PANEL_PRIVILEGED_RUNNER);

	if (hasRunner) {
		// Prod: fire-and-forget the detached apply. wrapPanelDomainArgv validates the
		// domain and yields `["sudo","-n",runner,"panel-domain",domain]`; the wrapper
		// runs the op under a transient systemd unit that survives the panel restart.
		const argv = wrapPanelDomainArgv(domain);
		const launch = Bun.spawn(argv, { stdout: "ignore", stderr: "ignore" });
		launch.exited.catch(() => {
			// ignored: the op runs detached; the GUI re-reads panelAccess to confirm.
		});
		return {
			status: "pending",
			url: customUrl,
			customUrl,
			magicUrl,
			message: panelDomainMessage("pending", domain, magicUrl),
		};
	}

	// Dev: run in-process and read the real status.
	const res = await runPanelDomain(domain);
	const status = parsePanelDomainStatus(res.stdout);
	return {
		status,
		url: customUrl,
		customUrl,
		magicUrl,
		message: panelDomainMessage(status, domain, magicUrl),
	};
}

/** Idiot-proof one-liner describing the apply result. */
export function panelDomainMessage(
	status: "ok" | "pending",
	domain: string,
	magicUrl: string
): string {
	if (status === "ok") {
		return `${domain} is live and secured with HTTPS. Your panel also still works at ${magicUrl} — you can't get locked out.`;
	}
	return `${domain} has been added. DNS isn't pointing here yet, so it'll secure automatically once your A record propagates (usually minutes, sometimes up to an hour). Meanwhile your panel stays reachable at ${magicUrl} — you can't get locked out.`;
}

/** The configured panel magic-DNS origin (BETTER_AUTH_URL) — the always-working URL. */
export function panelMagicUrl(): string {
	return env.BETTER_AUTH_URL;
}
