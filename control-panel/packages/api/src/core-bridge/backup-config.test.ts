import { describe, expect, it } from "vitest";

import type { BackupConfigRow } from "./backup-config-pure";
import { mergeConfig, toEnv } from "./backup-config-pure";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function row(overrides: Partial<BackupConfigRow> = {}): BackupConfigRow {
	return {
		siteId: "__global__",
		provider: null,
		endpoint: null,
		accessKeyId: null,
		secret: null,
		bucket: null,
		prefix: null,
		enabled: null,
		retention: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// mergeConfig
// ---------------------------------------------------------------------------

describe("mergeConfig", () => {
	it("site values override global", () => {
		const global = row({ provider: "Cloudflare", bucket: "global-bucket" });
		const site = row({ siteId: "s1", bucket: "site-bucket" });
		const cfg = mergeConfig(global, site, "example.com");
		expect(cfg.provider).toBe("Cloudflare");
		expect(cfg.bucket).toBe("site-bucket");
	});

	it("falls back to global when site field is null", () => {
		const global = row({ provider: "Cloudflare", accessKeyId: "AK" });
		const site = row({ siteId: "s1" });
		const cfg = mergeConfig(global, site, "example.com");
		expect(cfg.accessKeyId).toBe("AK");
	});

	it("prefix: neither row → site domain", () => {
		const cfg = mergeConfig(null, null, "example.com");
		expect(cfg.prefix).toBe("example.com");
	});

	it("prefix: global prefix → global/domain", () => {
		const global = row({ prefix: "backups" });
		const cfg = mergeConfig(global, null, "example.com");
		expect(cfg.prefix).toBe("backups/example.com");
	});

	it("prefix: site prefix overrides global prefix", () => {
		const global = row({ prefix: "backups" });
		const site = row({ siteId: "s1", prefix: "site-custom" });
		const cfg = mergeConfig(global, site, "example.com");
		expect(cfg.prefix).toBe("site-custom");
	});

	it("enabled comes only from site row", () => {
		const global = row({ enabled: 1 });
		const site = row({ siteId: "s1", enabled: 0 });
		const cfg = mergeConfig(global, site, "example.com");
		expect(cfg.enabled).toBe(0);
	});

	it("enabled is null when site row has no enabled", () => {
		const global = row({ enabled: 1 });
		const site = row({ siteId: "s1" });
		const cfg = mergeConfig(global, site, "example.com");
		expect(cfg.enabled).toBeNull();
	});

	it("nulls on both rows → all effective fields null except prefix", () => {
		const cfg = mergeConfig(null, null, "example.com");
		expect(cfg.provider).toBeNull();
		expect(cfg.accessKeyId).toBeNull();
		expect(cfg.secret).toBeNull();
		expect(cfg.bucket).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// toEnv
// ---------------------------------------------------------------------------

describe("toEnv", () => {
	const fullCfg = {
		provider: "Cloudflare",
		endpoint: "https://r2.example.com",
		accessKeyId: "AKID",
		secret: "SECRET",
		bucket: "my-bucket",
		prefix: "backups",
		enabled: 1 as number | null,
		retention: 7 as number | null,
	};

	it("returns disabled marker when enabled is 0", () => {
		const env = toEnv({ ...fullCfg, enabled: 0 });
		expect(env).toEqual({ VIBE_BACKUP_R2_ENABLED: "0" });
	});

	it("returns disabled marker when enabled is null", () => {
		const env = toEnv({ ...fullCfg, enabled: null });
		expect(env).toEqual({ VIBE_BACKUP_R2_ENABLED: "0" });
	});

	it("returns disabled marker when creds are incomplete", () => {
		const env = toEnv({ ...fullCfg, secret: null });
		expect(env).toEqual({ VIBE_BACKUP_R2_ENABLED: "0" });
	});

	it("maps all fields when fully configured", () => {
		const env = toEnv(fullCfg);
		expect(env.VIBE_BACKUP_R2_ENABLED).toBe("1");
		expect(env.VIBE_BACKUP_R2_BUCKET).toBe("my-bucket");
		expect(env.VIBE_BACKUP_R2_PREFIX).toBe("backups");
		expect(env.RCLONE_CONFIG_R2_TYPE).toBe("s3");
		expect(env.RCLONE_CONFIG_R2_PROVIDER).toBe("Cloudflare");
		expect(env.RCLONE_CONFIG_R2_ACCESS_KEY_ID).toBe("AKID");
		expect(env.RCLONE_CONFIG_R2_SECRET_ACCESS_KEY).toBe("SECRET");
		expect(env.RCLONE_CONFIG_R2_ENDPOINT).toBe("https://r2.example.com");
	});

	it("omits ENDPOINT when endpoint is null", () => {
		const env = toEnv({ ...fullCfg, endpoint: null });
		expect(env.VIBE_BACKUP_R2_ENABLED).toBe("1");
		expect(env.RCLONE_CONFIG_R2_ENDPOINT).toBeUndefined();
	});
});
