import { describe, expect, it } from "vitest";

import {
	DEFAULT_LOG_ROTATION,
	isAllowedLogMaxSize,
	logRotationToEnv,
	mergeLogRotationConfig,
} from "./log-rotation-config-pure";

describe("log rotation config", () => {
	it("uses conservative defaults when no row exists", () => {
		expect(mergeLogRotationConfig(null)).toEqual(DEFAULT_LOG_ROTATION);
	});

	it("accepts only curated json-file max-size values", () => {
		for (const value of ["1m", "5m", "10m", "25m", "50m", "100m"]) {
			expect(isAllowedLogMaxSize(value)).toBe(true);
		}
		for (const value of ["", "0m", "10M", "1g", "$(id)", "10m "]) {
			expect(isAllowedLogMaxSize(value)).toBe(false);
		}
	});

	it("bounds max-file to 1..10 and maps the config to site env", () => {
		const merged = mergeLogRotationConfig({ maxFile: 99, maxSize: "25m" });
		expect(merged).toEqual({ maxFile: 10, maxSize: "25m" });
		expect(logRotationToEnv(merged)).toEqual({
			VIBE_LOG_MAX_FILE: "10",
			VIBE_LOG_MAX_SIZE: "25m",
			VIBE_SITE_CONFIG_KEYS: "VIBE_LOG_MAX_SIZE VIBE_LOG_MAX_FILE",
		});
	});

	it("falls back to defaults for invalid stored values", () => {
		expect(mergeLogRotationConfig({ maxFile: 0, maxSize: "1g" })).toEqual(
			DEFAULT_LOG_ROTATION
		);
	});
});
