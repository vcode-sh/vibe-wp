import { buildVibeArgv, runVibe, wrapVibeArgv } from "./exec";
import { findSite } from "./sites";

export interface WpUser {
	displayName: string;
	email: string;
	id: number;
	login: string;
	roles: string[];
}

// Mirror the root wrapper's validate_wp_login (defense-in-depth at the panel):
// WordPress logins are letters, digits, space, and . _ @ - — nothing else, no
// leading hyphen. The login is NOT a secret (the password travels on STDIN).
const WP_LOGIN_RE = /^[A-Za-z0-9._@ -]{1,60}$/;
const MAX_PASSWORD_LEN = 200;

function assertWpLogin(login: string): void {
	if (login.startsWith("-") || !WP_LOGIN_RE.test(login)) {
		throw new Error(`Invalid WordPress login: ${login}`);
	}
}

interface RawWpUser {
	display_name: string;
	ID: number | string;
	roles: string | string[];
	user_email: string;
	user_login: string;
}

function parseRoles(roles: string | string[]): string[] {
	if (Array.isArray(roles)) {
		return roles;
	}
	return String(roles ?? "")
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean);
}

/** List a site's WordPress users (non-secret fields only) for the Users card. */
export async function listSiteUsers(siteId: string): Promise<WpUser[]> {
	const site = await findSite(siteId);
	if (!site) {
		throw new Error(`Unknown site: ${siteId}`);
	}
	// env "prod" auto-resolves to the site's real topology (bin/lib/vibe.sh).
	const { stdout, code } = await runVibe(site.installDir, "prod", "wpUserList");
	if (code !== 0) {
		throw new Error("Failed to list WordPress users");
	}
	const raw = JSON.parse(stdout) as RawWpUser[];
	return raw.map((u) => ({
		id: Number(u.ID),
		login: u.user_login,
		displayName: u.display_name,
		email: u.user_email,
		roles: parseRoles(u.roles),
	}));
}

/**
 * Set a WordPress user's password. The new password travels on STDIN ONLY (never
 * argv/ps/logs): we spawn the root-gated `wp-user-set-password <login>` op and
 * pipe the password to it, exactly like runVulnFeed pipes slugs. The wrapper
 * forwards it to `wp eval wp_set_password(stream_get_contents(STDIN), <id>)`.
 */
export async function setWpUserPassword(
	siteId: string,
	login: string,
	password: string
): Promise<void> {
	assertWpLogin(login);
	if (password.length === 0 || password.length > MAX_PASSWORD_LEN) {
		throw new Error("Password must be 1–200 characters");
	}
	const site = await findSite(siteId);
	if (!site) {
		throw new Error(`Unknown site: ${siteId}`);
	}
	const argv = wrapVibeArgv(
		site.installDir,
		buildVibeArgv(site.installDir, "prod", "wpUserSetPassword", [login])
	);
	const proc = Bun.spawn(argv, {
		cwd: site.installDir,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	// Password on STDIN, no trailing newline (the wrapper reads the whole line).
	const writer = proc.stdin as { write: (s: string) => void; end: () => void };
	writer.write(password);
	writer.end();
	const timer = setTimeout(() => proc.kill(), 60_000);
	const code = await proc.exited;
	clearTimeout(timer);
	if (code !== 0) {
		throw new Error("Failed to set the WordPress user password");
	}
}
