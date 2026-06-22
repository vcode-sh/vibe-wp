/**
 * Drift guard: bin/panel's sudoers `env_keep` must EXACTLY equal the union of
 * every env KEY any exec.ts caller injects via runVibe/streamVibe `opts.env`.
 *
 * WHY THIS EXISTS
 * ---------------
 * The panel server runs unprivileged (`vibe-panel`) and reaches the host only
 * through a sudoers-gated wrapper. sudo's `env_reset` strips the caller's
 * environment, so per-op CONFIG injected via `opts.env` (debug flags, R2
 * credentials, monitor channels) never reaches the wrapper UNLESS each var name
 * is listed in a scoped `env_keep`. bin/panel writes that list as
 *   panel_env_keep="WP_DEBUG_LOG ... RCLONE_CONFIG_R2_SECRET_ACCESS_KEY ..."
 * into /etc/sudoers.d/vibe-wp-panel.
 *
 * bin/panel's `panel_env_keep` is the CONSUMER; the exec.ts env-builder
 * functions are the PRODUCERS. If they drift apart:
 *   - a key present in the builders but MISSING from env_keep silently
 *     re-breaks a panel feature in production (sudo strips it);
 *   - a key in env_keep but emitted by NO builder needlessly widens root's
 *     preserved environment.
 *
 * This test derives the AUTHORITATIVE producer set by invoking the REAL
 * env-builder functions (no hand-copied list) and asserts it equals the set
 * parsed out of the real bin/panel file. Adding a key in one place and
 * forgetting the other therefore FAILS this test (and CI).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { toEnv as notifyToEnv } from "./notify-config-pure";
import { debugPatchToEnv } from "./site-config-pure";

// ---------------------------------------------------------------------------
// DB seam. backup-config.ts imports @control-panel/db + ./sites; mock both so
// we can invoke the REAL backupConfigEnv / backupTestEnv (which add the
// retention key and gate on credential completeness) without a live database.
//
// We resolve a NON-global siteId on purpose: mergeConfig sources `enabled` from
// the per-site row only (no global fallback), so toEnv only emits the full R2
// key set when a per-site row carries enabled=1. The mock returns one fully
// populated row for every getBackupConfig() call (global + per-site), and a
// findSite() with a domain so a prefix is synthesised → every conditional R2
// branch (incl. VIBE_BACKUP_R2_PREFIX + the secret) is exercised.
// ---------------------------------------------------------------------------
const FULL_BACKUP_ROW = {
	siteId: "site-1",
	provider: "Cloudflare",
	endpoint: "https://r2.example.com",
	accessKeyId: "AKID",
	secret: "SECRET",
	bucket: "my-bucket",
	prefix: "backups",
	// enabled=1 + complete creds → toEnv emits the full R2 key set (incl. secret).
	enabled: 1,
	// retention>0 → backupConfigEnv adds VIBE_BACKUP_RETENTION on top of toEnv.
	retention: 7,
};

vi.mock("@control-panel/db", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve([FULL_BACKUP_ROW]),
			}),
		}),
	},
}));
vi.mock("@control-panel/db/schema/backups", () => ({
	backupConfig: { siteId: "siteId" },
}));
vi.mock("./sites", () => ({
	findSite: () => Promise.resolve({ domain: "example.com" }),
}));

// Imported AFTER the mocks above so the mocked db/sites are used.
import { backupConfigEnv, backupTestEnv } from "./backup-config";

beforeEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Authoritative producer set: collect Object.keys from the REAL env builders.
// ---------------------------------------------------------------------------

/**
 * Build the union of every env key any exec.ts caller passes as `opts.env`, by
 * invoking the actual env-builder functions with representative inputs that
 * exercise every conditional branch (so no key is missed):
 *
 *   site-config.ts  (siteConfigApply)   → debugPatchToEnv  (all 3 flags set)
 *   backup-config.ts (backupConfigApply) → backupConfigEnv (full creds + retention)
 *   settings.ts     (backupTest)        → backupTestEnv   (subset; already covered)
 *   notify-config.ts (notifyConfigApply) → notify toEnv    (all channels set)
 *
 * jobs.ts streamVibe `extraEnv` has no caller, so it contributes nothing.
 */
async function collectInjectedEnvKeys(): Promise<Set<string>> {
	const keys = new Set<string>();

	// siteConfigApply: every debug flag defined → WP_DEBUG_LOG, WP_DEBUG_DISPLAY,
	// SCRIPT_DEBUG, and the VIBE_SITE_CONFIG_KEYS sentinel.
	for (const k of Object.keys(
		debugPatchToEnv({ debugLog: true, debugDisplay: true, scriptDebug: true })
	)) {
		keys.add(k);
	}

	// backupConfigApply: full R2 credentials + enabled + retention → all
	// VIBE_BACKUP_R2_* + RCLONE_CONFIG_R2_* keys plus VIBE_BACKUP_RETENTION.
	for (const k of Object.keys(await backupConfigEnv("site-1"))) {
		keys.add(k);
	}

	// backupTest: subset of the R2 keys (already covered) — included so a future
	// divergence (e.g. a new test-only key) is still caught.
	const testEnv = await backupTestEnv("site-1");
	if (testEnv) {
		for (const k of Object.keys(testEnv)) {
			keys.add(k);
		}
	}

	// notifyConfigApply: every channel set → all VIBE_MONITOR_* keys
	// (alertOnWarn is always emitted regardless).
	for (const k of Object.keys(
		notifyToEnv({
			telegramToken: "tok",
			telegramChatId: "chat",
			webhookUrl: "https://hook.example.com",
			email: "ops@example.com",
			alertOnWarn: 1,
		})
	)) {
		keys.add(k);
	}

	return keys;
}

// ---------------------------------------------------------------------------
// Consumer set: parse panel_env_keep="..." out of the real bin/panel script.
// The test file lives at control-panel/packages/api/src/core-bridge/, so the
// repo-root bin/panel is five directories up.
// ---------------------------------------------------------------------------
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PANEL_SCRIPT_PATH = resolve(TEST_DIR, "../../../../../bin/panel");
// Captures the space-separated var list from panel_env_keep="VAR_A VAR_B ...".
const PANEL_ENV_KEEP_RE = /panel_env_keep="([^"]*)"/;
const WHITESPACE_RE = /\s+/;

function parsePanelEnvKeep(): Set<string> {
	const source = readFileSync(PANEL_SCRIPT_PATH, "utf8");
	const match = source.match(PANEL_ENV_KEEP_RE);
	if (!match) {
		throw new Error(
			`Could not find panel_env_keep="..." assignment in ${PANEL_SCRIPT_PATH}`
		);
	}
	return new Set(
		(match[1] ?? "")
			.split(WHITESPACE_RE)
			.map((s) => s.trim())
			.filter((s) => s.length > 0)
	);
}

function sorted(set: Set<string>): string[] {
	return [...set].sort();
}

describe("bin/panel env_keep stays in sync with injected env keys", () => {
	it("locates and parses panel_env_keep from the real bin/panel", () => {
		const keep = parsePanelEnvKeep();
		// Sanity: the script resolves and the list is non-trivially populated.
		expect(keep.size).toBeGreaterThan(0);
	});

	it("env_keep has no MISSING keys (every injected key is preserved)", async () => {
		const injected = await collectInjectedEnvKeys();
		const keep = parsePanelEnvKeep();
		const missing = sorted(injected).filter((k) => !keep.has(k));
		expect(
			missing,
			`bin/panel panel_env_keep is MISSING injected env key(s): ${missing.join(
				", "
			)}. sudo's env_reset will strip them and silently break the panel op ` +
				"that injects them. Add them to panel_env_keep in bin/panel."
		).toEqual([]);
	});

	it("env_keep has no EXTRA keys (no key is preserved that nothing injects)", async () => {
		const injected = await collectInjectedEnvKeys();
		const keep = parsePanelEnvKeep();
		const extra = sorted(keep).filter((k) => !injected.has(k));
		expect(
			extra,
			"bin/panel panel_env_keep lists EXTRA env key(s) no exec.ts caller " +
				`injects: ${extra.join(
					", "
				)}. This needlessly widens root's preserved environment. Remove them ` +
				"from panel_env_keep in bin/panel (or add the matching injector)."
		).toEqual([]);
	});

	it("the two sets are EXACTLY equal (18 keys today)", async () => {
		const injected = await collectInjectedEnvKeys();
		const keep = parsePanelEnvKeep();
		expect(sorted(keep)).toEqual(sorted(injected));
		// Belt-and-braces: pin the count so a same-size swap can't slip through.
		expect(injected.size).toBe(18);
		expect(keep.size).toBe(18);
	});
});
