import {
  backupEnvValues,
  buildBackupDirTask,
  buildBackupTimerTask,
  buildRcloneInstallTask
} from "./backup";
import { buildDnsPreflightTask } from "./dns-preflight";
import { quoteEnv, saltKeys } from "./env-writer";
import { buildHardenTask } from "./harden";
import { effectivePerformanceValues } from "./performance";
import { randomHex, slugFromDomain } from "./secrets";
import { shellQuote } from "./shell";
import type { InstallerState, InstallTask } from "./types";

// External mode brings its own MariaDB + Redis: the DB/Redis credentials are
// USER-PROVIDED, so they must always reflect the latest input and must NOT be
// preserved-on-retry like generated, volume-bound secrets. Only the generated
// WordPress salts are write-once (rotating them just invalidates cookies).
export const EXTERNAL_PRESERVE_KEYS: ReadonlySet<string> = new Set<string>(saltKeys);

function externalSalts(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of saltKeys) {
    values[key] = randomHex(32);
  }
  return values;
}

export function externalEnvValues(state: InstallerState): Record<string, string> {
  const domain = state.productionDomain.trim().toLowerCase();
  const prefix = `${slugFromDomain(`${state.productionDomain}-external`)}:`;
  return {
    COMPOSE_PROJECT_NAME: `vibe-wp-${state.siteSlug}-external`,
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
    WORDPRESS_DB_HOST: state.extDbHost.trim(),
    WORDPRESS_DB_NAME: state.extDbName.trim(),
    WORDPRESS_DB_USER: state.extDbUser.trim(),
    WORDPRESS_DB_PASSWORD: state.extDbPassword,
    WORDPRESS_DB_CHARSET: state.extDbCharset.trim() || "utf8mb4",
    WORDPRESS_DB_COLLATE: "",
    WORDPRESS_TABLE_PREFIX: state.extDbTablePrefix.trim() || "wp_",
    WP_REDIS_HOST: state.extRedisHost.trim(),
    WP_REDIS_PORT: state.extRedisPort.trim() || "6379",
    WP_REDIS_SCHEME: state.extRedisScheme.trim() || "tcp",
    WP_REDIS_PASSWORD: state.extRedisPassword,
    WP_REDIS_DATABASE: state.extRedisDatabase.trim() || "0",
    WP_REDIS_PREFIX: prefix,
    WP_CACHE_KEY_SALT: prefix,
    WP_REDIS_CLIENT: "phpredis",
    WP_REDIS_MAXTTL: "604800",
    WP_REDIS_SELECTIVE_FLUSH: "1",
    WP_REDIS_GRACEFUL: "1",
    ...backupEnvValues(state, "external"),
    ...effectivePerformanceValues(state),
    ...externalSalts()
  };
}

export function buildExternalTasks(state: InstallerState): InstallTask[] {
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
      id: "env-external",
      title: "Generate external environment",
      description: "Write env/external.env pointing WordPress at your MariaDB and Redis.",
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
      id: "ext-config",
      title: "Validate external Compose",
      description: "Check Docker Compose config before starting WordPress and Nginx.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe external config`]
    },
    {
      id: "ext-up",
      title: "Start WordPress and Nginx",
      description: "Build and start WordPress and Nginx against your external services.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe external up`]
    },
    {
      id: "ext-install",
      title: "Install WordPress",
      description: "Install WordPress and enable the Redis object cache.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe external install`]
    },
    {
      id: "ext-smoke",
      title: "Run smoke test",
      description: "Verify HTTP, REST loopback, uploads, Redis, and FastCGI cache.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe external smoke`]
    },
    {
      id: "ext-perf",
      title: "Create performance report",
      description: "Print read-only performance diagnostics.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe external perf-report`]
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
      description: "Create and verify the first backup of files and the external database.",
      command: ["sh", "-lc", `cd ${installDir} && ./bin/vibe external backup`]
    });
  }
  const backupTimerTask = buildBackupTimerTask(state, "external");
  if (backupTimerTask) {
    tasks.push(backupTimerTask);
  }
  const hardenTask = buildHardenTask(state);
  if (hardenTask) {
    tasks.push(hardenTask);
  }
  return tasks;
}
