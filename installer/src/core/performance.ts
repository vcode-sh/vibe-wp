import { performanceValues } from "./defaults";
import type { InstallerState } from "./types";

// The individual resource settings a user can override on the Performance
// screen. Order here is the order shown (and the focus order) in the UI.
export const PERFORMANCE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "PHP_MEMORY_LIMIT", label: "PHP memory limit" },
  { key: "WP_MEMORY_LIMIT", label: "WP memory limit" },
  { key: "WP_MAX_MEMORY_LIMIT", label: "WP max memory" },
  { key: "PHP_FPM_PM_MAX_CHILDREN", label: "PHP-FPM max children" },
  { key: "PHP_FPM_PM_START_SERVERS", label: "PHP-FPM start servers" },
  { key: "PHP_FPM_PM_MIN_SPARE_SERVERS", label: "PHP-FPM min spare" },
  { key: "PHP_FPM_PM_MAX_SPARE_SERVERS", label: "PHP-FPM max spare" },
  { key: "REDIS_MAXMEMORY", label: "Redis max memory" },
  { key: "REDIS_IO_THREADS", label: "Redis I/O threads" },
  { key: "MARIADB_INNODB_BUFFER_POOL_SIZE", label: "MariaDB buffer pool" },
  { key: "MARIADB_MAX_CONNECTIONS", label: "MariaDB max connections" },
  { key: "NGINX_FASTCGI_CACHE_MAX_SIZE", label: "Nginx cache max size" }
];

const PERFORMANCE_KEYS = new Set(PERFORMANCE_FIELDS.map((field) => field.key));

// Memory used to size the preset baseline: the user's explicit override if set,
// otherwise the detected host memory.
export function sizingMemoryMb(state: InstallerState): number | null {
  const override = Number.parseInt(state.memoryOverrideMb, 10);
  if (Number.isFinite(override) && override > 0) {
    return override;
  }
  return state.host.totalMemoryMb;
}

// The preset baseline before any per-field overrides are applied.
export function performanceBaseValues(state: InstallerState): Record<string, string> {
  return performanceValues(state.performancePreset, sizingMemoryMb(state));
}

// Only overrides for known keys with a non-empty value take effect.
function activeOverrides(state: InstallerState): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.performanceOverrides)) {
    if (PERFORMANCE_KEYS.has(key) && value.trim()) {
      result[key] = value.trim();
    }
  }
  return result;
}

// What actually gets written to env files: preset baseline, then user overrides
// win. Overrides only apply when the user enabled customisation.
export function effectivePerformanceValues(state: InstallerState): Record<string, string> {
  const base = performanceBaseValues(state);
  if (!state.performanceCustom) {
    return base;
  }
  return { ...base, ...activeOverrides(state) };
}
