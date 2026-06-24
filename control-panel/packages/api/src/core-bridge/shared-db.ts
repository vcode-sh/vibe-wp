import { runSharedDb, wrapSharedDbArgv } from "./exec";
import { redact } from "./redact";

/**
 * Panel-side bridge to the ONE shared MariaDB project. These wrap the root-gated
 * `shared-db <op>` wrapper subcommand (exec.ts). The per-site password produced
 * by `provision` is treated as a secret: captured in-process, validated, and
 * returned to the provisioning path that writes it into the site env via the
 * installer STDIN bridge — it is NEVER logged and NEVER returned to the browser.
 */

/** The per-site password contract: exactly 32 lowercase hex chars. */
const PASSWORD_PATTERN = /^[0-9a-f]{32}$/;

export interface SharedDbStatus {
	bufferPool: string | null;
	databases: number | null;
	healthy: boolean;
	maxConnections: number | null;
	network: string;
	present: boolean;
}

const ABSENT: SharedDbStatus = {
	present: false,
	healthy: false,
	network: "vibe-wp-shared-db",
	maxConnections: null,
	bufferPool: null,
	databases: null,
};

/** Parse the NON-SECRET JSON from bin/shared-db-status. Fails closed to ABSENT. */
export async function sharedDbStatus(): Promise<SharedDbStatus> {
	const { stdout, code } = await runSharedDb("status", [], {
		timeoutMs: 30_000,
	});
	if (code !== 0) {
		return ABSENT;
	}
	try {
		const j = JSON.parse(stdout) as Record<string, unknown>;
		return {
			present: j.present === true,
			healthy: j.healthy === true,
			network: typeof j.network === "string" ? j.network : ABSENT.network,
			maxConnections:
				typeof j.max_connections === "number" ? j.max_connections : null,
			bufferPool: typeof j.buffer_pool === "string" ? j.buffer_pool : null,
			databases: typeof j.databases === "number" ? j.databases : null,
		};
	} catch {
		return ABSENT;
	}
}

/**
 * Provision a site database on the shared server and capture its per-site
 * password. The script prints EXACTLY the 32-hex password to stdout; we capture
 * it RAW (redact() would destroy it) in-process and return it. The slug is
 * re-validated by the root wrapper AND db-provision before any SQL.
 */
export async function provisionSiteDb(
	slug: string
): Promise<{ password: string }> {
	const proc = Bun.spawn(wrapSharedDbArgv("provision", [slug]), {
		stdout: "pipe",
		stderr: "pipe",
	});
	const timer = setTimeout(() => proc.kill(), 60_000);
	const [rawOut, rawErr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const code = await proc.exited;
	clearTimeout(timer);
	if (code !== 0) {
		// The script never echoes the password on error; redact stderr anyway.
		throw new Error(
			`db-provision failed: ${redact(rawErr).trim() || `exit ${code}`}`
		);
	}
	const password = rawOut.trim();
	// Validate the output contract WITHOUT logging the value.
	if (!PASSWORD_PATTERN.test(password)) {
		throw new Error("db-provision did not return a valid per-site password");
	}
	return { password };
}

/**
 * Run `shared-db init` (idempotent bring-up: docker compose up -d --build + a
 * health wait). Non-streaming — it blocks until the container is healthy. The
 * output is non-secret (the script never prints the root password).
 */
export async function sharedDbInit(): Promise<{ ok: boolean; output: string }> {
	const { stdout, stderr, code } = await runSharedDb("init", [], {
		timeoutMs: 300_000,
	});
	return { ok: code === 0, output: `${stdout}\n${stderr}`.trim() };
}

/**
 * Rotate the shared server's root password (admin op). The script verifies the
 * new password works AND the old one is rejected; per-site users are unaffected.
 * Output is non-secret (passwords are never printed); redacted defensively.
 */
export async function sharedDbRotateRoot(): Promise<{
	ok: boolean;
	output: string;
}> {
	const { stdout, stderr, code } = await runSharedDb("rotate-root", [], {
		timeoutMs: 60_000,
	});
	return { ok: code === 0, output: `${stdout}\n${stderr}`.trim() };
}

/** Drop a site's database + user from the shared server. Idempotent-ish. */
export async function deprovisionSiteDb(slug: string): Promise<void> {
	const { code, stderr } = await runSharedDb("deprovision", [slug], {
		timeoutMs: 60_000,
	});
	if (code !== 0) {
		throw new Error(
			`db-deprovision failed: ${stderr.trim() || `exit ${code}`}`
		);
	}
}

/** The MariaDB identifier for a site slug: `vibe_<slug>` with `-`→`_` (mirrors
 * bin/lib/shared-db.sh sdb_validate_slug). Used for extDbName/extDbUser. */
export function sharedDbIdentifier(slug: string): string {
	return `vibe_${slug.replace(/-/g, "_")}`;
}
