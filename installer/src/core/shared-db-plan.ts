import {
  backupEnvValues,
  buildBackupDirTask,
  buildBackupTimerTask,
  buildRcloneInstallTask
} from "./backup";
import { buildDnsPreflightTask } from "./dns-preflight";
import { quoteEnv, saltKeys } from "./env-writer";
import { buildHardenTask } from "./harden";
import { buildMonitorTimerTask, monitorEnvValues } from "./monitor";
import { effectivePerformanceValues } from "./performance";
import { randomHex, randomPassword, slugFromDomain } from "./secrets";
import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

// Shared-db mode mirrors external mode, with two differences:
//   1. Redis is INTERNAL (a per-site `redis` container), so we GENERATE its
//      password here exactly like the default bundled install does.
//   2. MariaDB is the SHARED `db` container (reached over the external
//      `shared_db` Docker network); its connection is USER/PANEL-PROVIDED.
// As with external mode the DB credentials must always reflect the latest input
// and must NOT be preserved-on-retry. The generated WordPress salts AND the
// generated Redis password are write-once (rotating salts invalidates cookies;
// rotating the Redis password would diverge from the running container), so
// they are preserved on a retried install.
export const SHARED_DB_PRESERVE_KEYS: ReadonlySet<string> = new Set<string>([
  ...saltKeys,
  "REDIS_PASSWORD",
  "WP_REDIS_PASSWORD"
]);

function sharedDbSalts(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of saltKeys) {
    values[key] = randomHex(32);
  }
  return values;
}

export function sharedDbEnvValues(state: InstallerState): Record<string, string> {
  const domain = state.productionDomain.trim().toLowerCase();
  const prefix = `${slugFromDomain(`${state.productionDomain}-shared-db`)}:`;
  // Per-site internal Redis: generate one password and reuse it for the cache
  // client (REDIS_PASSWORD seeds the container, WP_REDIS_PASSWORD reaches it).
  const redisPassword = randomPassword();
  return {
    COMPOSE_PROJECT_NAME: `vibe-wp-${state.siteSlug}-shared-db`,
    HTTP_PORT: `127.0.0.1:${state.productionHttpPort}`,
    WP_HOME: `https://${domain}`,
    WP_SITEURL: `https://${domain}`,
    WP_ENVIRONMENT_TYPE: "production",
    WP_INSTALL_TITLE: quoteEnv(state.siteTitle),
    WP_INSTALL_ADMIN_USER: state.adminUser,
    WP_INSTALL_ADMIN_PASSWORD: state.adminPassword,
    WP_INSTALL_ADMIN_EMAIL: state.adminEmail,
    WP_INSTALL_LOCALE: state.locale,
    FORCE_SSL_ADMIN: "1",
    NGINX_ENABLE_HSTS: "1",
    VIBE_WP_FORCE_NOINDEX: "0",
    VIBE_WP_DISABLE_OUTBOUND_MAIL: "0",
    VIBE_WP_INTERNAL_URL: "http://nginx:8080",
    OPENAI_API_KEY: state.aiOpenAiKey,
    GOOGLE_API_KEY: state.aiGoogleKey,
    ANTHROPIC_API_KEY: state.aiAnthropicKey,
    // Shared MariaDB: the panel sets extDbHost to "db" (the shared container on
    // the shared_db network) and provisions per-site vibe_<slug> credentials.
    WORDPRESS_DB_HOST: state.extDbHost.trim(),
    WORDPRESS_DB_NAME: state.extDbName.trim(),
    WORDPRESS_DB_USER: state.extDbUser.trim(),
    WORDPRESS_DB_PASSWORD: state.extDbPassword,
    WORDPRESS_DB_CHARSET: state.extDbCharset.trim() || "utf8mb4",
    WORDPRESS_DB_COLLATE: "",
    WORDPRESS_TABLE_PREFIX: state.extDbTablePrefix.trim() || "wp_",
    // Internal Redis: fixed host/port + generated per-site password.
    REDIS_PASSWORD: redisPassword,
    WP_REDIS_HOST: "redis",
    WP_REDIS_PORT: "6379",
    WP_REDIS_SCHEME: "tcp",
    WP_REDIS_PASSWORD: redisPassword,
    WP_REDIS_DATABASE: "0",
    WP_REDIS_PREFIX: prefix,
    WP_CACHE_KEY_SALT: prefix,
    WP_REDIS_CLIENT: "phpredis",
    WP_REDIS_MAXTTL: "604800",
    WP_REDIS_SELECTIVE_FLUSH: "1",
    WP_REDIS_GRACEFUL: "1",
    ...backupEnvValues(state, "shared-db"),
    ...monitorEnvValues(state),
    ...effectivePerformanceValues(state),
    ...sharedDbSalts()
  };
}

export function buildSharedDbTasks(state: InstallerState): InstallTask[] {
  const installDir = shellQuote(state.installDir);
  const ref = shellQuote(state.ref);
  const repo = shellQuote(state.repo);
  const sudo = state.host.sudo ? "sudo " : "";
  const tasks: InstallTask[] = [
    buildDnsPreflightTask(state),
    {
      id: "checkout",
      title: "Prepare Vibe WP checkout",
      description: "Clone or update the Vibe WP repository at the install directory.",
      command: [
        "sh",
        "-lc",
        `if [ -d ${shellQuote(`${state.installDir}/.git`)} ]; then git -C ${installDir} fetch --all --prune && git -C ${installDir} checkout ${ref} && git -C ${installDir} pull --ff-only; else mkdir -p ${installDir} && git clone --branch ${ref} ${repo} ${installDir}; fi`
      ]
    },
    {
      id: "env-shared-db",
      title: "Generate shared-database environment",
      description:
        "Write env/shared-db.env pointing WordPress at the shared database and a per-site Redis.",
      command: ["sh", "-lc", `cd ${installDir} && :`]
    },
    {
      id: "caddyfile",
      title: "Configure HTTPS proxy",
      description: "Write and validate the Caddy reverse proxy configuration.",
      privileged: true,
      command: [
        "sh",
        "-lc",
        `${sudo}caddy validate --config /etc/caddy/Caddyfile && ${sudo}systemctl reload caddy`
      ]
    },
    {
      id: "shared-db-config",
      title: "Validate shared-database Compose",
      description: "Check Docker Compose config before starting WordPress and Nginx.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe shared-db config`]
    },
    {
      id: "shared-db-up",
      title: "Start WordPress and Nginx",
      description:
        "Build and start WordPress, Nginx, and the per-site Redis against the shared database.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe shared-db up`]
    },
    {
      id: "shared-db-install",
      title: "Install WordPress",
      description: "Install WordPress and enable the Redis object cache.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe shared-db install`]
    },
    {
      id: "shared-db-smoke",
      title: "Run smoke test",
      description: "Verify HTTP, REST loopback, uploads, Redis, and FastCGI cache.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe shared-db smoke`]
    },
    {
      id: "shared-db-perf",
      title: "Create performance report",
      description: "Print read-only performance diagnostics.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe shared-db perf-report`]
    }
  ];

  const rcloneTask = buildRcloneInstallTask(state);
  if (rcloneTask) {
    tasks.splice(1, 0, rcloneTask);
  }
  const backupDirTask = buildBackupDirTask(state);
  if (backupDirTask) {
    tasks.push(backupDirTask);
  }
  if (state.backupPolicy !== "manual") {
    tasks.push({
      id: "first-backup",
      title: "Create first backup",
      description: "Create and verify the first backup of files and the shared database.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe shared-db backup`]
    });
  }
  const backupTimerTask = buildBackupTimerTask(state, "shared-db");
  if (backupTimerTask) {
    tasks.push(backupTimerTask);
  }
  const monitorTimerTask = buildMonitorTimerTask(state, "shared-db");
  if (monitorTimerTask) {
    tasks.push(monitorTimerTask);
  }
  const hardenTask = buildHardenTask(state);
  if (hardenTask) {
    tasks.push(hardenTask);
  }
  return tasks;
}
