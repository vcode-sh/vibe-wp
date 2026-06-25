import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildInstallPlan } from "./install-plan";
import { buildSharedDbTasks, SHARED_DB_PRESERVE_KEYS, sharedDbEnvValues } from "./shared-db-plan";
import type { InstallerState } from "./types";

function sharedDbState(): InstallerState {
  const state = defaultState();
  state.mode = "shared-db";
  state.stagingEnabled = false;
  state.productionDomain = "shop.example.test";
  state.siteSlug = "shop-example-test";
  // The panel points the shared DB at the in-network `db` container with
  // per-site vibe_<slug> credentials it provisioned on the shared MariaDB.
  state.extDbHost = "db";
  state.extDbName = "vibe_shop";
  state.extDbUser = "vibe_shop";
  state.extDbPassword = "secretdbpw";
  return state;
}

describe("sharedDbEnvValues", () => {
  test("maps the shared DB connection into the WordPress DB keys", () => {
    const v = sharedDbEnvValues(sharedDbState());
    expect(v.WORDPRESS_DB_HOST).toBe("db");
    expect(v.WORDPRESS_DB_NAME).toBe("vibe_shop");
    expect(v.WORDPRESS_DB_USER).toBe("vibe_shop");
    expect(v.WORDPRESS_DB_PASSWORD).toBe("secretdbpw");
    expect(v.WORDPRESS_DB_CHARSET).toBe("utf8mb4");
  });

  test("points Redis at the internal container with a generated password", () => {
    const v = sharedDbEnvValues(sharedDbState());
    expect(v.WP_REDIS_HOST).toBe("redis");
    expect(v.WP_REDIS_PORT).toBe("6379");
    expect(v.REDIS_PASSWORD?.length ?? 0).toBeGreaterThan(0);
    expect(v.WP_REDIS_PASSWORD).toBe(v.REDIS_PASSWORD);
  });

  test("omits the bundled-MariaDB secret keys (DB is the shared container)", () => {
    const v = sharedDbEnvValues(sharedDbState());
    expect("MARIADB_PASSWORD" in v).toBe(false);
    expect("MARIADB_ROOT_PASSWORD" in v).toBe(false);
  });

  test("uses a shared-db-scoped Compose project name", () => {
    const v = sharedDbEnvValues(sharedDbState());
    expect(v.COMPOSE_PROJECT_NAME).toBe("vibe-wp-shop-example-test-shared-db");
  });

  test("generates all eight WordPress salts with non-empty values", () => {
    const v = sharedDbEnvValues(sharedDbState());
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
    const v = sharedDbEnvValues(sharedDbState());
    expect(v.WP_REDIS_PREFIX).toContain("shop-example-test");
    expect(v.WP_CACHE_KEY_SALT).toBe(v.WP_REDIS_PREFIX);
  });

  test("preserve set covers salts and the generated Redis password, not DB creds", () => {
    expect(SHARED_DB_PRESERVE_KEYS.has("WORDPRESS_AUTH_KEY")).toBe(true);
    expect(SHARED_DB_PRESERVE_KEYS.has("REDIS_PASSWORD")).toBe(true);
    expect(SHARED_DB_PRESERVE_KEYS.has("WP_REDIS_PASSWORD")).toBe(true);
    expect(SHARED_DB_PRESERVE_KEYS.has("WORDPRESS_DB_PASSWORD")).toBe(false);
  });
});

describe("buildSharedDbTasks", () => {
  test("produces the task chain using ./bin/vibe shared-db", () => {
    const ids = buildSharedDbTasks(sharedDbState()).map((t) => t.id);
    expect(ids).toEqual([
      "dns-preflight",
      "checkout",
      "env-shared-db",
      "caddyfile",
      "shared-db-config",
      "shared-db-up",
      "shared-db-install",
      "shared-db-smoke",
      "shared-db-perf",
      "backup-dir",
      "first-backup",
      "backup-timer",
      "monitor-timer",
      "harden"
    ]);
  });

  test("runs vibe ops in the shared-db env, never external or prod", () => {
    const commands = buildSharedDbTasks(sharedDbState())
      .map((t) => t.command?.join(" ") ?? "")
      .join("\n");
    expect(commands).toContain("./bin/vibe shared-db up");
    expect(commands).toContain("./bin/vibe shared-db install");
    expect(commands).not.toContain("./bin/vibe external");
    expect(commands).not.toContain("./bin/vibe prod");
  });

  test("omits first-backup when backup policy is manual", () => {
    const state = sharedDbState();
    state.backupPolicy = "manual";
    const ids = buildSharedDbTasks(state).map((t) => t.id);
    expect(ids).not.toContain("first-backup");
  });
});

describe("buildInstallPlan for shared-db", () => {
  test("writes env/shared-db.env and a Caddy block for the production domain", () => {
    const plan = buildInstallPlan(sharedDbState());
    expect(plan.envFiles).toHaveLength(1);
    expect(plan.envFiles[0]?.path.endsWith("/env/shared-db.env")).toBe(true);
    expect(plan.caddyfile).toContain("shop.example.test");
  });
});
