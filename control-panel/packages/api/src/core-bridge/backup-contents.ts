import type { ParsedBackupContents } from "./backup-contents-pure";
import { parseBackupContents } from "./backup-contents-pure";
import { runVibe } from "./exec";
import { findSite } from "./sites";

/**
 * Read a backup's contents (files + DB table names) for the browser UI. The
 * heavy lifting is in the root-confined bin/backup-list-contents op; this bridge
 * just resolves the site, runs the op against prod.env, and parses the
 * NDJSON-TAB output. The output is non-secret (paths + table names only) and
 * already redacted by runVibe.
 */
export async function listBackupContents(
	siteId: string,
	backupId: string
): Promise<ParsedBackupContents> {
	const site = await findSite(siteId);
	if (!site) {
		throw new Error("Unknown site");
	}
	const { stdout } = await runVibe(
		site.installDir,
		"prod",
		"backupListContents",
		{
			args: [backupId],
			// The DB-dump table scan + tar listing can take a while on large backups.
			timeoutMs: 120_000,
		}
	);
	return parseBackupContents(stdout);
}
