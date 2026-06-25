import { chmod, chown } from "node:fs/promises";

import { backupEnvValues } from "./backup";
import { monitorEnvValues } from "./monitor";
import { effectivePerformanceValues } from "./performance";
import { randomHex, randomPassword, slugFromDomain } from "./secrets";
import type { InstallerState } from "./types";

const envKeyPattern = /^([A-Za-z_][A-Za-z0-9_]*)=/;
const numericGidPattern = /^\d+$/;
const envPlainValuePattern = /^[A-Za-z0-9_./:@-]+$/;
const lineBreakPattern = /\r?\n/;
const trailingLineBreakPattern = /\n*$/;

export const saltKeys = [
  "WORDPRESS_AUTH_KEY",
  "WORDPRESS_SECURE_AUTH_KEY",
  "WORDPRESS_LOGGED_IN_KEY",
  "WORDPRESS_NONCE_KEY",
  "WORDPRESS_AUTH_SALT",
  "WORDPRESS_SECURE_AUTH_SALT",
  "WORDPRESS_LOGGED_IN_SALT",
  "WORDPRESS_NONCE_SALT"
];

function sharedSecrets(state: InstallerState, suffix: string): Record<string, string> {
  const domainSlug = slugFromDomain(`${state.productionDomain}-${suffix}`);
  const values: Record<string, string> = {};

  for (const key of saltKeys) {
    values[key] = randomHex(32);
  }

  values.MARIADB_PASSWORD = randomPassword();
  values.MARIADB_ROOT_PASSWORD = randomPassword();
  values.WORDPRESS_DB_PASSWORD = values.MARIADB_PASSWORD ?? randomPassword();
  values.REDIS_PASSWORD = randomPassword();
  values.WP_REDIS_PASSWORD = values.REDIS_PASSWORD;
  values.WP_REDIS_PREFIX = `${domainSlug}:`;
  values.WP_CACHE_KEY_SALT = `${domainSlug}:`;

  return values;
}

export function productionEnvValues(state: InstallerState): Record<string, string> {
  return {
    COMPOSE_PROJECT_NAME: `vibe-wp-${state.siteSlug}-prod`,
    HTTP_PORT: `127.0.0.1:${state.productionHttpPort}`,
    WP_HOME: `https://${state.productionDomain.trim().toLowerCase()}`,
    WP_SITEURL: `https://${state.productionDomain.trim().toLowerCase()}`,
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
    ...backupEnvValues(state, "prod"),
    ...monitorEnvValues(state),
    ...effectivePerformanceValues(state),
    ...sharedSecrets(state, "prod")
  };
}

export function stagingEnvValues(state: InstallerState): Record<string, string> {
  return {
    COMPOSE_PROJECT_NAME: `vibe-wp-${state.siteSlug}-stage`,
    HTTP_PORT: `127.0.0.1:${state.stagingHttpPort}`,
    WP_HOME: `https://${state.stagingDomain.trim().toLowerCase()}`,
    WP_SITEURL: `https://${state.stagingDomain.trim().toLowerCase()}`,
    WP_ENVIRONMENT_TYPE: "staging",
    WP_INSTALL_TITLE: quoteEnv(`${state.siteTitle} Staging`),
    WP_INSTALL_ADMIN_USER: state.adminUser,
    WP_INSTALL_ADMIN_PASSWORD: randomPassword(22),
    WP_INSTALL_ADMIN_EMAIL: state.adminEmail,
    WP_INSTALL_LOCALE: state.locale,
    FORCE_SSL_ADMIN: "1",
    NGINX_ENABLE_HSTS: "0",
    VIBE_WP_FORCE_NOINDEX: "1",
    VIBE_WP_DISABLE_OUTBOUND_MAIL: "1",
    VIBE_WP_INTERNAL_URL: "http://nginx:8080",
    OPENAI_API_KEY: state.aiOpenAiKey,
    GOOGLE_API_KEY: state.aiGoogleKey,
    ANTHROPIC_API_KEY: state.aiAnthropicKey,
    ...backupEnvValues(state, "stage"),
    ...monitorEnvValues(state),
    ...effectivePerformanceValues(state),
    ...sharedSecrets(state, "stage")
  };
}

export function quoteEnv(value: string): string {
  if (envPlainValuePattern.test(value)) {
    return value;
  }
  return `"${value.replace(/(["\\$`])/g, "\\$1")}"`;
}

// Secret keys are write-once: on a retried install the DB/Redis volumes still
// hold credentials from the first run, so rotating these would break the
// database connection. Preserve any that already exist on disk; everything
// else (URL, ports, title, email) still updates to the latest plan values.
export const SECRET_ENV_KEYS: ReadonlySet<string> = new Set<string>([
  ...saltKeys,
  "MARIADB_PASSWORD",
  "MARIADB_ROOT_PASSWORD",
  "WORDPRESS_DB_PASSWORD",
  "REDIS_PASSWORD",
  "WP_REDIS_PASSWORD",
  "WP_INSTALL_ADMIN_PASSWORD"
]);

export async function writeEnvFile(
  path: string,
  values: Record<string, string>,
  options?: { preserveExisting?: ReadonlySet<string> }
): Promise<void> {
  const preserve = options?.preserveExisting;
  const file = Bun.file(path);
  const text = (await file.exists()) ? await file.text() : "";
  const lines = text ? text.split(lineBreakPattern) : [];
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const match = line.match(envKeyPattern);
    if (!match) {
      return line;
    }
    const key = match[1];
    if (!(key && key in values)) {
      return line;
    }
    seen.add(key);
    // Keep the on-disk secret so it stays in sync with the persisted DB volume.
    if (preserve?.has(key)) {
      return line;
    }
    return `${key}=${values[key] ?? ""}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) {
      next.push(`${key}=${value}`);
    }
  }

  await Bun.write(path, `${next.join("\n").replace(trailingLineBreakPattern, "")}\n`);
  await lockEnvFilePerms(path);
}

// The vibe-panel service account (present only on a panel-managed host) reads
// env files for site listing + install collision-avoidance. Resolve its gid so
// we can widen the GROUP — never world — on those hosts; null on standalone/dev.
const PANEL_SERVICE_GROUP = "vibe-panel";

async function panelServiceGid(): Promise<number | null> {
  try {
    const group = await Bun.file("/etc/group").text();
    for (const line of group.split("\n")) {
      const [name, , gid] = line.split(":");
      if (name === PANEL_SERVICE_GROUP && gid && numericGidPattern.test(gid)) {
        return Number(gid);
      }
    }
  } catch {
    // /etc/group unreadable (non-Linux dev, sandbox) → treat as no panel group.
  }
  return null;
}

/**
 * Env files hold secrets (DB + WP-admin passwords, salts, API keys) and must
 * NEVER be world/other-readable. Lock to 0600 (owner-only). On a panel-managed
 * host the UNPRIVILEGED panel service still needs to read NON-secret fields
 * (WP_HOME, ports, project name) for the site list + collision-avoidance, so
 * widen ONLY the group to the vibe-panel account (root owner keeps containers +
 * the root wrapper working). Best-effort: a perms tweak must never fail an
 * install — when not running as root (dev) the chown is skipped and the file
 * stays 0600, readable by the owner that wrote it.
 */
async function lockEnvFilePerms(path: string): Promise<void> {
  try {
    await chmod(path, 0o600);
    const gid = await panelServiceGid();
    if (gid !== null) {
      try {
        await chown(path, 0, gid);
        await chmod(path, 0o640);
      } catch {
        // Not root → keep 0600 owner-only (already applied above).
      }
    }
  } catch {
    // Never block provisioning on a permissions adjustment.
  }
}
