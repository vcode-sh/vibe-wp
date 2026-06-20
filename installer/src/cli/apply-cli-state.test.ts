import { describe, expect, test } from "bun:test";
import { defaultState } from "../core/defaults";
import type { InstallerOptions } from "../core/types";
import { applyCliState } from "./apply-cli-state";

function options(overrides: Partial<InstallerOptions>): InstallerOptions {
  return {
    ascii: false,
    compact: false,
    dryRun: false,
    headlessJson: false,
    help: false,
    installDir: "/opt/vibe-wp",
    local: false,
    noCaddy: false,
    noWww: false,
    noHostInstall: false,
    noHarden: false,
    ref: "main",
    repo: "https://example.com/vibe-wp.git",
    version: false,
    yes: false,
    ...overrides
  };
}

describe("applyCliState", () => {
  test("derives slug, staging domain, and title from --domain", () => {
    const state = applyCliState(defaultState(), options({ domain: "shop.com" }));

    expect(state.productionDomain).toBe("shop.com");
    expect(state.siteSlug.length).toBeGreaterThan(0);
    expect(state.stagingDomain).toBe("stage.shop.com");
    expect(state.productionHttpPort.length).toBeGreaterThan(0);
  });

  test("explicit staging domain wins and enables staging", () => {
    const state = applyCliState(
      defaultState(),
      options({ domain: "shop.com", stagingDomain: "preview.shop.com" })
    );

    expect(state.stagingDomain).toBe("preview.shop.com");
    expect(state.stagingEnabled).toBe(true);
  });

  test("applies mode and admin email", () => {
    const state = applyCliState(
      defaultState(),
      options({ mode: "staging-only", adminEmail: "me@example.com" })
    );

    expect(state.mode).toBe("staging-only");
    expect(state.adminEmail).toBe("me@example.com");
  });

  test("--mode new-site clears an inherited site and derives a fresh install dir", () => {
    const base = defaultState();
    // Simulate host detection having pre-selected an existing site.
    base.selectedSiteDir = "/opt/vibe-wp";
    base.host = {
      ...base.host,
      existingSites: [
        {
          installDir: "/opt/vibe-wp",
          hasStaging: false,
          productionProject: "p",
          productionUrl: "https://live.com",
          stagingProject: null,
          stagingUrl: null
        }
      ]
    };
    const state = applyCliState(base, options({ mode: "new-site", domain: "fresh.com" }));
    expect(state.selectedSiteDir).toBe("");
    expect(state.installDir).not.toBe("/opt/vibe-wp");
  });

  test("external-services flags populate the connection profile and disable staging", () => {
    const state = applyCliState(
      defaultState(),
      options({
        mode: "external-services",
        domain: "ext.example.net",
        extDbHost: "db.host:3306",
        extDbPassword: "dbpw",
        extRedisHost: "redis.host",
        extRedisPassword: "redispw"
      })
    );
    expect(state.mode).toBe("external-services");
    expect(state.extDbHost).toBe("db.host:3306");
    expect(state.extDbPassword).toBe("dbpw");
    expect(state.extRedisHost).toBe("redis.host");
    expect(state.extRedisPassword).toBe("redispw");
    expect(state.stagingEnabled).toBe(false);
  });

  test("--perf KEY=VALUE entries enable customization and set overrides", () => {
    const state = applyCliState(
      defaultState(),
      options({ perfOverrides: ["REDIS_MAXMEMORY=512mb", "PHP_FPM_PM_MAX_CHILDREN=24"] })
    );
    expect(state.performanceCustom).toBe(true);
    expect(state.performanceOverrides.REDIS_MAXMEMORY).toBe("512mb");
    expect(state.performanceOverrides.PHP_FPM_PM_MAX_CHILDREN).toBe("24");
  });

  test("R2 flags enable off-server backups and populate credentials", () => {
    const state = applyCliState(
      defaultState(),
      options({
        domain: "shop.com",
        backupDir: "/var/backups/vibe-wp/shop",
        backupSchedule: "weekly",
        r2AccountId: "acct",
        r2AccessKeyId: "akid",
        r2SecretKey: "sk",
        r2Bucket: "bucket"
      })
    );
    expect(state.backupPolicy).toBe("external-later");
    expect(state.backupR2Enabled).toBe(true);
    expect(state.backupDir).toBe("/var/backups/vibe-wp/shop");
    expect(state.backupSchedule).toBe("weekly");
    expect(state.r2Bucket).toBe("bucket");
  });

  test("leaves state untouched when flags are absent", () => {
    const base = defaultState();
    const before = base.productionDomain;
    const state = applyCliState(base, options({}));
    expect(state.productionDomain).toBe(before);
  });
});
