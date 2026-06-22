/**
 * Turn a raw better-auth session row into a friendly device description for the
 * Profile "Active sessions" card. Pure string parsing of the stored user-agent —
 * good enough to help a user recognise their devices, with safe fallbacks.
 */
export function describeSession(s: {
	userAgent?: string | null;
	ipAddress?: string | null;
}): { device: string; detail: string } {
	const ua = s.userAgent ?? "";
	let browser = "";
	if (/Edg\//.test(ua)) {
		browser = "Edge";
	} else if (/Chrome\//.test(ua)) {
		browser = "Chrome";
	} else if (/Firefox\//.test(ua)) {
		browser = "Firefox";
	} else if (/Safari\//.test(ua)) {
		browser = "Safari";
	}
	let os = "";
	if (/Mac OS X/.test(ua)) {
		os = "macOS";
	} else if (/Windows/.test(ua)) {
		os = "Windows";
	} else if (/Android/.test(ua)) {
		os = "Android";
	} else if (/(iPhone|iPad)/.test(ua)) {
		os = "iOS";
	} else if (/Linux/.test(ua)) {
		os = "Linux";
	}
	const device =
		browser || os
			? [browser, os].filter(Boolean).join(" · ")
			: "Unknown device";
	const detail = s.ipAddress ? `IP ${s.ipAddress}` : "IP unknown";
	return { device, detail };
}
