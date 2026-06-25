/**
 * Pure helpers for the backup browser feature: a parser for the NDJSON-TAB
 * output of `bin/backup-list-contents` and the input validators that mirror the
 * root-boundary wrapper (bin/vibe-panel-run validate_backup_path / item-name).
 * No I/O here, so this is unit-tested in isolation.
 */

export interface BackupFileEntry {
	bytes: number;
	path: string;
}

export interface ParsedBackupContents {
	files: BackupFileEntry[];
	tables: string[];
	truncated: boolean;
}

const TRAILING_CR = /\r$/;
const ANY_WHITESPACE = /\s/;
const SHELL_METACHARS = /[;|&$`<>(){}*?!]/;
const BACKUP_ID_RELATIVE = /^backups\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.:-]+\/?$/;
const TABLE_NAME = /^[A-Za-z0-9_]{1,64}$/;

function parseFileEntry(parts: string[]): BackupFileEntry | null {
	const path = parts[1] ?? "";
	if (path === "") {
		return null;
	}
	const bytes = Number.parseInt(parts[2] ?? "0", 10);
	return { path, bytes: Number.isFinite(bytes) && bytes >= 0 ? bytes : 0 };
}

/**
 * Parse the NDJSON-TAB listing emitted by bin/backup-list-contents:
 *   file<TAB><path><TAB><bytes>
 *   table<TAB><name><TAB>
 *   meta<TAB>truncated<TAB>1
 * Blank lines and unrecognised kinds are ignored. The redact() pass upstream is
 * a passthrough for these constrained, non-secret values.
 */
export function parseBackupContents(stdout: string): ParsedBackupContents {
	const files: BackupFileEntry[] = [];
	const tables: string[] = [];
	let truncated = false;

	for (const raw of stdout.split("\n")) {
		const line = raw.replace(TRAILING_CR, "");
		if (line.trim() === "") {
			continue;
		}
		const parts = line.split("\t");
		const kind = parts[0];
		if (kind === "file") {
			const entry = parseFileEntry(parts);
			if (entry) {
				files.push(entry);
			}
		} else if (kind === "table") {
			const name = parts[1] ?? "";
			if (name !== "") {
				tables.push(name);
			}
		} else if (
			kind === "meta" &&
			parts[1] === "truncated" &&
			parts[2] === "1"
		) {
			truncated = true;
		}
	}

	return { files, tables, truncated };
}

// --- Input validators (first-line defense BEFORE the host call) -------------
// These MUST stay consistent with bin/vibe-panel-run's validate_backup_path and
// validate_item_name. The wrapper re-validates everything at the root boundary;
// these reject obviously-bad input early so we never spawn for it.

/**
 * Accept a backupId in the panel's canonical relative form
 * (`backups/<env>/<timestamp>` with an optional trailing slash). We do NOT
 * accept absolute forms from the client — the wrapper would still confine them,
 * but the panel always works in the relative form, so anything else is rejected
 * here as a defense-in-depth narrowing. Rejects '..' explicitly.
 */
export function isValidBackupId(backupId: string): boolean {
	if (backupId.includes("..")) {
		return false;
	}
	return BACKUP_ID_RELATIVE.test(backupId);
}

/** table -> ^[A-Za-z0-9_]{1,64}$. */
export function isValidTableName(name: string): boolean {
	return TABLE_NAME.test(name);
}

/**
 * file -> a safe relative path: no leading '/', no '..', no leading '-', no
 * whitespace, no shell metacharacters. Mirrors validate_item_name(file) +
 * validate_arg in the wrapper.
 */
export function isValidFileName(name: string): boolean {
	if (name === "" || name.length > 4096) {
		return false;
	}
	if (name.startsWith("/") || name.startsWith("-")) {
		return false;
	}
	if (name.includes("..")) {
		return false;
	}
	if (ANY_WHITESPACE.test(name)) {
		return false;
	}
	// Same metachar set the wrapper rejects.
	if (SHELL_METACHARS.test(name)) {
		return false;
	}
	return true;
}

/** Validate an item name by kind (mirrors the wrapper's per-kind rules). */
export function isValidItemName(kind: "file" | "table", name: string): boolean {
	return kind === "table" ? isValidTableName(name) : isValidFileName(name);
}
