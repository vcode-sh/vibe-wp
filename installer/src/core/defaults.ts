import { suggestedBackupDir as defaultBackupDir } from "./backup";
import { randomPassword } from "./secrets";
import {
  defaultInstallDir,
  portPairFromSlug,
  siteSlugFromDomain,
  stripProtocol
} from "./site-profile";
import type { HostFacts, InstallerState, PerformancePreset } from "./types";

export const INSTALLER_VERSION = "0.1.2";

export function emptyHostFacts(): HostFacts {
  return {
    osName: "unknown",
    osVersion: "unknown",
    kernel: "unknown",
    arch: "unknown",
    user: "unknown",
    sudo: false,
    docker: null,
    compose: null,
    caddy: null,
    git: null,
    curl: null,
    totalMemoryMb: null,
    cpuCount: null,
    publicIp: null,
    existingSites: []
  };
}

export function defaultState(host: HostFacts = emptyHostFacts()): InstallerState {
  const preset = choosePreset(host.totalMemoryMb);
  const siteSlug = siteSlugFromDomain("example.com");
  const ports = portPairFromSlug(siteSlug);
  const firstSite = host.existingSites[0];

  return {
    installDir: firstSite?.installDir ?? defaultInstallDir(siteSlug, host.existingSites.length),
    repo: "https://github.com/vcode-sh/vibe-wp.git",
    ref: "main",
    mode: firstSite ? "manage-existing" : "new-site",
    selectedSiteDir: firstSite?.installDir ?? "",
    siteSlug,
    productionDomain: firstSite?.productionUrl
      ? stripProtocol(firstSite.productionUrl)
      : "example.com",
    wwwAlias: true,
    stagingEnabled: firstSite ? firstSite.hasStaging : true,
    stagingDomain: firstSite?.stagingUrl
      ? stripProtocol(firstSite.stagingUrl)
      : "stage.example.com",
    productionHttpPort: ports.production,
    stagingHttpPort: ports.staging,
    adminEmail: firstSite ? "admin@change-me.local" : "admin@example.com",
    adminUser: "owner",
    adminPassword: randomPassword(22),
    siteTitle: "Vibe WP",
    locale: "en_US",
    memoryOverrideMb: "",
    performanceCustom: false,
    performanceOverrides: {},
    performancePreset: preset,
    quickInstall: false,
    aiOpenAiKey: "",
    aiGoogleKey: "",
    aiAnthropicKey: "",
    backupPolicy: "local-first",
    backupDir: defaultBackupDir(siteSlug),
    backupRetention: "7",
    backupSchedule: "daily",
    backupR2Enabled: false,
    r2AccountId: "",
    r2AccessKeyId: "",
    r2SecretKey: "",
    r2Bucket: "",
    extDbHost: "",
    extDbName: "wordpress",
    extDbUser: "wordpress",
    extDbPassword: "",
    extDbCharset: "utf8mb4",
    extDbTablePrefix: "wp_",
    extRedisHost: "",
    extRedisPort: "6379",
    extRedisScheme: "tcp",
    extRedisPassword: "",
    extRedisDatabase: "0",
    installDocker: !host.docker,
    installCaddy: !host.caddy,
    installRclone: true,
    localSandbox: false,
    host
  };
}

export function choosePreset(memoryMb: number | null): PerformancePreset {
  if (!memoryMb) {
    return "balanced";
  }
  if (memoryMb < 1800) {
    return "conservative";
  }
  if (memoryMb >= 6144) {
    return "high-memory";
  }
  return "balanced";
}

export function performanceValues(
  preset: PerformancePreset,
  memoryMb: number | null
): Record<string, string> {
  if (preset === "conservative" || (memoryMb !== null && memoryMb < 1800)) {
    return {
      PHP_MEMORY_LIMIT: "192M",
      WP_MEMORY_LIMIT: "192M",
      WP_MAX_MEMORY_LIMIT: "256M",
      PHP_FPM_PM_MAX_CHILDREN: "6",
      PHP_FPM_PM_START_SERVERS: "2",
      PHP_FPM_PM_MIN_SPARE_SERVERS: "1",
      PHP_FPM_PM_MAX_SPARE_SERVERS: "3",
      REDIS_MAXMEMORY: "128mb",
      REDIS_IO_THREADS: "1",
      MARIADB_INNODB_BUFFER_POOL_SIZE: "192M",
      MARIADB_MAX_CONNECTIONS: "80",
      NGINX_FASTCGI_CACHE_MAX_SIZE: "512m"
    };
  }

  if (preset === "high-memory") {
    return {
      PHP_MEMORY_LIMIT: "512M",
      WP_MEMORY_LIMIT: "256M",
      WP_MAX_MEMORY_LIMIT: "1G",
      PHP_FPM_PM_MAX_CHILDREN: "40",
      PHP_FPM_PM_START_SERVERS: "8",
      PHP_FPM_PM_MIN_SPARE_SERVERS: "4",
      PHP_FPM_PM_MAX_SPARE_SERVERS: "12",
      REDIS_MAXMEMORY: "1gb",
      REDIS_IO_THREADS: "4",
      MARIADB_INNODB_BUFFER_POOL_SIZE: "2G",
      MARIADB_MAX_CONNECTIONS: "220",
      NGINX_FASTCGI_CACHE_MAX_SIZE: "4g"
    };
  }

  return {
    PHP_MEMORY_LIMIT: "256M",
    WP_MEMORY_LIMIT: "256M",
    WP_MAX_MEMORY_LIMIT: "512M",
    PHP_FPM_PM_MAX_CHILDREN: "18",
    PHP_FPM_PM_START_SERVERS: "4",
    PHP_FPM_PM_MIN_SPARE_SERVERS: "2",
    PHP_FPM_PM_MAX_SPARE_SERVERS: "8",
    REDIS_MAXMEMORY: "512mb",
    REDIS_IO_THREADS: "2",
    MARIADB_INNODB_BUFFER_POOL_SIZE: "768M",
    MARIADB_MAX_CONNECTIONS: "150",
    NGINX_FASTCGI_CACHE_MAX_SIZE: "2g"
  };
}
