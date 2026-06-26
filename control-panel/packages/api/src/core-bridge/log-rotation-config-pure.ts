export const GLOBAL_SITE_ID = "__global__";

export const ALLOWED_LOG_MAX_SIZES = [
	"1m",
	"5m",
	"10m",
	"25m",
	"50m",
	"100m",
] as const;

export type LogMaxSize = (typeof ALLOWED_LOG_MAX_SIZES)[number];

export interface LogRotationConfig {
	maxFile: number;
	maxSize: LogMaxSize;
}

export interface LogRotationConfigRow {
	maxFile: number | null;
	maxSize: string | null;
	siteId: string;
}

export type LogRotationConfigPatch = Partial<LogRotationConfig>;

export const DEFAULT_LOG_ROTATION: LogRotationConfig = {
	maxFile: 3,
	maxSize: "10m",
};

export function isAllowedLogMaxSize(value: string): value is LogMaxSize {
	return (ALLOWED_LOG_MAX_SIZES as readonly string[]).includes(value);
}

function normalizeMaxFile(value: number | null | undefined): number {
	if (!Number.isFinite(value ?? Number.NaN)) {
		return DEFAULT_LOG_ROTATION.maxFile;
	}
	const rounded = Math.trunc(value ?? DEFAULT_LOG_ROTATION.maxFile);
	if (rounded < 1) {
		return DEFAULT_LOG_ROTATION.maxFile;
	}
	return Math.min(10, rounded);
}

export function mergeLogRotationConfig(
	row: Pick<LogRotationConfigRow, "maxFile" | "maxSize"> | null
): LogRotationConfig {
	const maxSize =
		row?.maxSize && isAllowedLogMaxSize(row.maxSize)
			? row.maxSize
			: DEFAULT_LOG_ROTATION.maxSize;
	return {
		maxFile: normalizeMaxFile(row?.maxFile),
		maxSize,
	};
}

export function logRotationToEnv(
	config: LogRotationConfig
): Record<string, string> {
	return {
		VIBE_LOG_MAX_SIZE: config.maxSize,
		VIBE_LOG_MAX_FILE: String(normalizeMaxFile(config.maxFile)),
		VIBE_SITE_CONFIG_KEYS: "VIBE_LOG_MAX_SIZE VIBE_LOG_MAX_FILE",
	};
}
