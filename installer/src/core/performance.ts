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

function posInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

// PHP-FPM refuses to start if start/spare servers exceed max_children, so a
// single edited value (e.g. lowering max_children below the preset's spares)
// would crash the container. Clamp the pool to a valid shape no matter what the
// user enters: 1 <= min_spare <= max_spare <= max_children, start in range.
function clampFpmPool(values: Record<string, string>): Record<string, string> {
  const maxChildren = posInt(values.PHP_FPM_PM_MAX_CHILDREN, 1);
  const maxSpare = Math.min(posInt(values.PHP_FPM_PM_MAX_SPARE_SERVERS, 1), maxChildren);
  const minSpare = Math.min(posInt(values.PHP_FPM_PM_MIN_SPARE_SERVERS, 1), maxSpare);
  const start = Math.min(
    Math.max(posInt(values.PHP_FPM_PM_START_SERVERS, minSpare), minSpare),
    maxSpare
  );
  values.PHP_FPM_PM_MAX_CHILDREN = String(maxChildren);
  values.PHP_FPM_PM_MAX_SPARE_SERVERS = String(maxSpare);
  values.PHP_FPM_PM_MIN_SPARE_SERVERS = String(minSpare);
  values.PHP_FPM_PM_START_SERVERS = String(start);
  return values;
}

// What actually gets written to env files: preset baseline, then user overrides
// win. Overrides only apply when the user enabled customisation. The pool is
// always clamped to a php-fpm-valid shape so no edit can crash the container.
export function effectivePerformanceValues(state: InstallerState): Record<string, string> {
  const base = performanceBaseValues(state);
  const merged = state.performanceCustom ? { ...base, ...activeOverrides(state) } : base;
  return clampFpmPool(merged);
}
