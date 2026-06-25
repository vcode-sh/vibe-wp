import { buildVibeArgv, runVibe, wrapVibeArgv } from "./exec";
import { findSite } from "./sites";
import { assertPassword, assertUserId } from "./wp-users-validate";

export interface WpUser {
	displayName: string;
	email: string;
	id: number;
	login: string;
	roles: string[];
}

const KILL_TIMEOUT_MS = 60_000;

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
 * Set a WordPress user's password BY NUMERIC ID. The new password travels on
 * STDIN ONLY (never argv/ps/logs): we spawn the root-gated `wp-user-set-password
 * <id>` op and pipe the password to it, exactly like runVulnFeed pipes slugs.
 * The wrapper forwards STDIN to `wp eval wp_set_password(stream_get_contents(STDIN), <id>)`.
 *
 * On Linux the op runs under `setsid` so a timeout kills the whole tree
 * (sudo → wrapper → bin/vibe → docker/wp) via the process group, never orphaning
 * a `--rm` container; stdout/stderr are drained so the child can't block on a
 * full pipe. The id is the unambiguous numeric user id (see assertUserId).
 */
export async function setWpUserPassword(
	siteId: string,
	userId: number,
	password: string
): Promise<void> {
	assertUserId(userId);
	assertPassword(password);
	const site = await findSite(siteId);
	if (!site) {
		throw new Error(`Unknown site: ${siteId}`);
	}
	const argv = wrapVibeArgv(
		site.installDir,
		buildVibeArgv(site.installDir, "prod", "wpUserSetPassword", [
			String(userId),
		])
	);
	const onLinux = process.platform === "linux";
	const child = Bun.spawn(onLinux ? ["setsid", ...argv] : argv, {
		cwd: site.installDir,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	// Password on STDIN, no trailing newline — wp eval reads the whole stream.
	const writer = child.stdin as { write: (s: string) => void; end: () => void };
	writer.write(password);
	writer.end();
	const killTree = () => {
		if (onLinux && child.pid && child.pid > 1) {
			try {
				process.kill(-child.pid, "SIGTERM"); // pgid == pid after setsid
				return;
			} catch {
				// group already gone — fall through to a direct kill
			}
		}
		child.kill();
	};
	const timer = setTimeout(killTree, KILL_TIMEOUT_MS);
	// Drain (and discard) the op's output so a full pipe can't stall it; the
	// output is non-secret (login + id only) and we never store or stream it.
	const drain = Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	const code = await child.exited;
	await drain;
	clearTimeout(timer);
	if (code !== 0) {
		throw new Error("Failed to set the WordPress user password");
	}
}
