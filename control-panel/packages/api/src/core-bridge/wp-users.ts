import { createHash, randomBytes } from "node:crypto";
import { buildVibeArgv, runVibe, type VibeOp, wrapVibeArgv } from "./exec";
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
const SSO_TOKEN_BYTES = 32; // 256-bit token, rendered as 64 hex chars

/**
 * Run a root-gated `bin/vibe` op (via the panel wrapper) feeding `stdinData` on
 * STDIN — the channel for secrets/sensitive bytes that must never touch argv,
 * `ps`, or logs. On Linux the op runs under `setsid` so a timeout kills the whole
 * tree (sudo → wrapper → bin/vibe → docker/wp) via the process group, never
 * orphaning a `--rm` container; stdout/stderr are drained so the child can't
 * block on a full pipe. Returns the op's exit code. Output is never captured for
 * the caller (these ops echo only non-secret confirmations).
 */
async function runVibeStdin(
	installDir: string,
	op: VibeOp,
	args: string[],
	stdinData: string
): Promise<number> {
	const argv = wrapVibeArgv(
		installDir,
		buildVibeArgv(installDir, "prod", op, args)
	);
	const onLinux = process.platform === "linux";
	const child = Bun.spawn(onLinux ? ["setsid", ...argv] : argv, {
		cwd: installDir,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	const writer = child.stdin as { write: (s: string) => void; end: () => void };
	writer.write(stdinData);
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
	const drain = Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	const code = await child.exited;
	await drain;
	clearTimeout(timer);
	return code;
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
	// Password on STDIN (no trailing newline) — wp eval reads the whole stream.
	const code = await runVibeStdin(
		site.installDir,
		"wpUserSetPassword",
		[String(userId)],
		password
	);
	if (code !== 0) {
		throw new Error("Failed to set the WordPress user password");
	}
}

/**
 * Mint a one-click login URL for a user (Plesk WP-Toolkit parity). We generate a
 * 256-bit token in the PANEL and send only its sha256 HASH to the host op on
 * STDIN — the plaintext token never reaches the host, its stdout, or any log. The
 * op stores `vibe_sso_<hash> = userId` as a single-use, 60s WordPress transient;
 * the vibe-wp-sso mu-plugin redeems `?vibe_sso=<token>` on the web path (sets the
 * auth cookie, redirects to wp-admin). The returned URL carries the plaintext
 * token and must be handed straight to the browser over HTTPS — never persisted.
 */
export async function mintLoginLink(
	siteId: string,
	userId: number
): Promise<{ url: string }> {
	assertUserId(userId);
	const site = await findSite(siteId);
	if (!site) {
		throw new Error(`Unknown site: ${siteId}`);
	}
	const token = randomBytes(SSO_TOKEN_BYTES).toString("hex");
	const hash = createHash("sha256").update(token).digest("hex");
	const code = await runVibeStdin(
		site.installDir,
		"wpLoginLink",
		[String(userId)],
		hash
	);
	if (code !== 0) {
		throw new Error("Failed to mint the WordPress login link");
	}
	return { url: `https://${site.domain}/?vibe_sso=${token}` };
}
