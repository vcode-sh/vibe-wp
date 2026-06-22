/**
 * Turn a raw better-auth session row into a friendly device description for the
 * Profile "Active sessions" card. Pure string parsing of the stored user-agent —
 * good enough to help a user recognise their devices, with safe fallbacks.
 */

// Ordered: Edge's UA contains "Chrome", Chrome's contains "Safari", so the more
// specific patterns must come first.
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
	[/Edg\//, "Edge"],
	[/Chrome\//, "Chrome"],
	[/Firefox\//, "Firefox"],
	[/Safari\//, "Safari"],
];

const OPERATING_SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
	[/Mac OS X/, "macOS"],
	[/Windows/, "Windows"],
	[/Android/, "Android"],
	[/iPhone|iPad/, "iOS"],
	[/Linux/, "Linux"],
];

export function describeSession(s: {
	userAgent?: string | null;
	ipAddress?: string | null;
}): { device: string; detail: string } {
	const ua = s.userAgent ?? "";
	const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? "";
	const os = OPERATING_SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? "";
	const device =
		browser || os
			? [browser, os].filter(Boolean).join(" · ")
			: "Unknown device";
	const detail = s.ipAddress ? `IP ${s.ipAddress}` : "IP unknown";
	return { device, detail };
}
