import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildExternalTasks, EXTERNAL_PRESERVE_KEYS, externalEnvValues } from "./external-plan";
import { buildInstallPlan } from "./install-plan";
import type { InstallerState } from "./types";

function externalState(): InstallerState {
  const state = defaultState();
  state.mode = "external-services";
  state.stagingEnabled = false;
  state.productionDomain = "shop.example.test";
  state.siteSlug = "shop-example-test";
  state.extDbHost = "db.internal:3306";
  state.extDbName = "wp";
  state.extDbUser = "wpuser";
  state.extDbPassword = "secretdbpw";
  state.extRedisHost = "redis.internal";
  state.extRedisPort = "6379";
  state.extRedisPassword = "secretredispw";
  return state;
}

describe("externalEnvValues", () => {
  test("maps user DB/Redis connection into the external env keys", () => {
    const v = externalEnvValues(externalState());
    expect(v.WORDPRESS_DB_HOST).toBe("db.internal:3306");
    expect(v.WORDPRESS_DB_NAME).toBe("wp");
    expect(v.WORDPRESS_DB_USER).toBe("wpuser");
    expect(v.WORDPRESS_DB_PASSWORD).toBe("secretdbpw");
    expect(v.WP_REDIS_HOST).toBe("redis.internal");
    expect(v.WP_REDIS_PASSWORD).toBe("secretredispw");
  });

  test("omits the bundled-DB and bundled-Redis secret keys", () => {
    const v = externalEnvValues(externalState());
    expect("MARIADB_PASSWORD" in v).toBe(false);
    expect("MARIADB_ROOT_PASSWORD" in v).toBe(false);
    expect("REDIS_PASSWORD" in v).toBe(false);
  });

  test("generates all eight WordPress salts with non-empty values", () => {
    const v = externalEnvValues(externalState());
    for (const key of [
      "WORDPRESS_AUTH_KEY",
      "WORDPRESS_SECURE_AUTH_KEY",
      "WORDPRESS_LOGGED_IN_KEY",
      "WORDPRESS_NONCE_KEY",
      "WORDPRESS_AUTH_SALT",
      "WORDPRESS_SECURE_AUTH_SALT",
      "WORDPRESS_LOGGED_IN_SALT",
      "WORDPRESS_NONCE_SALT"
    ]) {
      expect(v[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("derives the Redis prefix from the production domain", () => {
    const v = externalEnvValues(externalState());
    expect(v.WP_REDIS_PREFIX).toContain("shop-example-test");
    expect(v.WP_CACHE_KEY_SALT).toBe(v.WP_REDIS_PREFIX);
  });

  test("preserve set covers salts but not user DB/Redis passwords", () => {
    expect(EXTERNAL_PRESERVE_KEYS.has("WORDPRESS_AUTH_KEY")).toBe(true);
    expect(EXTERNAL_PRESERVE_KEYS.has("WORDPRESS_DB_PASSWORD")).toBe(false);
    expect(EXTERNAL_PRESERVE_KEYS.has("WP_REDIS_PASSWORD")).toBe(false);
  });
});

describe("buildExternalTasks", () => {
  test("produces the external task chain using ./bin/vibe external", () => {
    const ids = buildExternalTasks(externalState()).map((t) => t.id);
    expect(ids).toEqual([
      "dns-preflight",
      "checkout",
      "env-external",
      "caddyfile",
      "ext-config",
      "ext-up",
      "ext-install",
      "ext-smoke",
      "ext-perf",
      "first-backup"
    ]);
  });

  test("does not emit any bundled-DB prod or staging tasks", () => {
    const ids = buildExternalTasks(externalState()).map((t) => t.id);
    for (const forbidden of ["env-prod", "prod-up", "prod-install", "stage-up"]) {
      expect(ids).not.toContain(forbidden);
    }
  });

  test("omits first-backup when backup policy is manual", () => {
    const state = externalState();
    state.backupPolicy = "manual";
    const ids = buildExternalTasks(state).map((t) => t.id);
    expect(ids).not.toContain("first-backup");
  });
});

describe("buildInstallPlan for external-services", () => {
  test("writes env/external.env and a Caddy block for the production domain", () => {
    const plan = buildInstallPlan(externalState());
    expect(plan.envFiles).toHaveLength(1);
    expect(plan.envFiles[0]?.path.endsWith("/env/external.env")).toBe(true);
    expect(plan.caddyfile).toContain("shop.example.test");
  });
});
