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
 *     re-breaks a panel feature in production (sudo strips it — SMTP was the
 *     first real example of this gap being caught in VPS validation);
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

import { logRotationToEnv } from "./log-rotation-config-pure";
import { toEnv as notifyToEnv } from "./notify-config-pure";
import { securityConfigToEnv } from "./security-config-pure";
import {
	ALLOWED_WORDPRESS_IMAGES,
	debugPatchToEnv,
	fastcgiCachePatchToEnv,
	imagePatchToEnv,
	securityFixToEnv,
} from "./site-config-pure";
import { toEnv as smtpToEnv } from "./smtp-config-pure";

// ---------------------------------------------------------------------------
// DB seam. backup-config.ts and smtp-config.ts both import @control-panel/db +
// ./sites; mock all three so we can invoke the REAL env builders without a live
// database.
//
// For backup: we resolve a NON-global siteId on purpose: mergeConfig sources
// `enabled` from the per-site row only (no global fallback), so toEnv only
// emits the full R2 key set when a per-site row carries enabled=1. The mock
// returns one fully populated row for every getBackupConfig() call (global +
// per-site), and a findSite() with a domain so a prefix is synthesised → every
// conditional R2 branch (incl. VIBE_BACKUP_R2_PREFIX + the secret) is
// exercised.
//
// For smtp: the mock returns one fully populated row (including password) so
// toEnv emits ALL SMTP_* keys (including SMTP_PASSWORD which is gated on
// cfg.password being non-null/non-empty).
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

const FULL_SMTP_ROW = {
	siteId: "site-1",
	mode: "relay",
	host: "smtp.example.com",
	port: 587,
	secure: "starttls",
	auth: "on",
	username: "user@example.com",
	// non-null/non-empty password → toEnv emits SMTP_PASSWORD
	password: "s3cr3t",
	fromAddress: "noreply@example.com",
	fromName: "SMTP Test",
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
vi.mock("@control-panel/db/schema/smtp", () => ({
	smtpConfig: { siteId: "siteId" },
}));
vi.mock("./sites", () => ({
	findSite: () => Promise.resolve({ domain: "example.com" }),
}));

// Imported AFTER the mocks above so the mocked db/sites are used.
import { backupConfigEnv, backupTestEnv } from "./backup-config";
import { PERF_TUNABLE_KEYS } from "./perf-advisor";
import { perfRecsToEnv } from "./perf-apply";

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
 *                                          + securityFixToEnv (both fix kinds)
 *   backup-config.ts (backupConfigApply) → backupConfigEnv (full creds + retention)
 *   settings.ts     (backupTest)        → backupTestEnv   (subset; already covered)
 *   notify-config.ts (notifyConfigApply) → notify toEnv    (all channels set)
 *   log-rotation-config.ts (siteConfigApply) → logRotationToEnv
 *   security-config.ts (securityConfigApply) → securityConfigToEnv
 *   smtp-config.ts  (smtpConfigApply)   → smtp toEnv      (full config incl. password)
 *   settings.ts     (smtpTest)          → smtp toEnv + SMTP_TEST_TO
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

	// siteConfigApply (PHP version): imagePatchToEnv → WORDPRESS_IMAGE (+ sentinel).
	for (const k of Object.keys(imagePatchToEnv(ALLOWED_WORDPRESS_IMAGES[0]))) {
		keys.add(k);
	}

	// siteConfigApply (FastCGI cache): fastcgiCachePatchToEnv → NGINX_FASTCGI_CACHE
	// (+ sentinel). on/off both emit the same key set; one call suffices.
	for (const k of Object.keys(fastcgiCachePatchToEnv(false))) {
		keys.add(k);
	}

	// siteConfigApply (security hardening): securityFixToEnv → DISALLOW_FILE_EDIT
	// (disableFileEdit) and VIBE_WP_DISABLE_XMLRPC (disableXmlRpc), each plus the
	// sentinel. Both fix kinds emit a distinct key, so exercise both.
	for (const fix of ["disableFileEdit", "disableXmlRpc"] as const) {
		for (const k of Object.keys(securityFixToEnv(fix))) {
			keys.add(k);
		}
	}

	// logRotationConfigSet: siteConfigApply receives the Docker json-file
	// rotation keys plus the VIBE_SITE_CONFIG_KEYS sentinel.
	for (const k of Object.keys(
		logRotationToEnv({ maxSize: "25m", maxFile: 5 })
	)) {
		keys.add(k);
	}

	for (const k of Object.keys(
		securityConfigToEnv({
			firewallEnabled: true,
			fail2banEnabled: true,
			maxRetry: 5,
			findTime: "10m",
			banTime: "1h",
		})
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

	// smtpConfigApply: full SMTP config (including non-null password) → all
	// SMTP_* keys. smtpToEnv is a pure function so we call it directly with
	// FULL_SMTP_ROW (which has a non-empty password, ensuring SMTP_PASSWORD is
	// emitted — that key is gated on cfg.password being non-null/non-empty).
	for (const k of Object.keys(smtpToEnv(FULL_SMTP_ROW))) {
		keys.add(k);
	}

	// smtpTest: adds SMTP_TEST_TO on top of the SMTP config env map.
	// smtpTestEnv(siteId, to) = { ...smtpConfigEnv(siteId), SMTP_TEST_TO: to }
	// SMTP_TEST_TO is the only test-only key not emitted by toEnv, so we add it
	// explicitly here to ensure it is always covered by the drift guard.
	keys.add("SMTP_TEST_TO");

	// securityRadar (Feature E): exec.ts runVulnFeed injects the optional CVE-feed
	// source + key (VULN_FEED_ENV_KEYS). exec.ts imports Bun-only APIs, so we list
	// the literal key names here (matching VULN_FEED_ENV_KEYS) rather than importing
	// it into this node-environment test — the same literal pattern as SMTP_TEST_TO.
	keys.add("PANEL_VULN_FEED_URL");
	keys.add("PANEL_VULN_FEED_KEY");

	// perfApply (feature #5): perfRecsToEnv emits VIBE_PERF_<KEY> for every
	// recommendation plus the VIBE_PERF_KEYS declaration. Drive it with one
	// recommendation per FIXED tunable key so every VIBE_PERF_* var the panel can
	// inject is covered by the drift guard.
	for (const k of Object.keys(
		perfRecsToEnv(
			PERF_TUNABLE_KEYS.map((key) => ({
				key,
				label: key,
				current: "1",
				suggested: "2",
				unit: "",
				plain: "",
				reason: "",
				risk: "low" as const,
				category: "fpm" as const,
			}))
		)
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

	it("the two sets are EXACTLY equal (50 keys today)", async () => {
		const injected = await collectInjectedEnvKeys();
		const keep = parsePanelEnvKeep();
		expect(sorted(keep)).toEqual(sorted(injected));
		// Belt-and-braces: pin the count so a same-size swap can't slip through.
		// 30 base + 2 security-onefix (DISALLOW_FILE_EDIT, VIBE_WP_DISABLE_XMLRPC)
		// + 2 vuln-radar (PANEL_VULN_FEED_URL, PANEL_VULN_FEED_KEY)
		// + 9 perf keys (8 VIBE_PERF_<tunable> + VIBE_PERF_KEYS)
		// + 2 log-rotation keys + 5 security-config keys = 50.
		expect(injected.size).toBe(50);
		expect(keep.size).toBe(50);
	});
});
