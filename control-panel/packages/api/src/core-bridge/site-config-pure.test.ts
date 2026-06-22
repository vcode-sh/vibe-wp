import { describe, expect, it } from "vitest";

import {
	debugPatchToEnv,
	envBool,
	parseScheduleStatus,
} from "./site-config-pure";

describe("envBool", () => {
	it("treats 1/true/yes/on (any case) as true", () => {
		for (const v of ["1", "true", "TRUE", "yes", "On"]) {
			expect(envBool(v)).toBe(true);
		}
	});

	it("treats anything else (and nullish) as false", () => {
		for (const v of ["0", "false", "no", "off", "", "  "]) {
			expect(envBool(v)).toBe(false);
		}
		expect(envBool(null)).toBe(false);
		expect(envBool(undefined)).toBe(false);
	});
});

describe("parseScheduleStatus", () => {
	it("recovers cadence, monitor, and debug flags", () => {
		const out = [
			"backup_schedule\tweekly",
			"monitor\ton",
			"wp_debug_log\t1",
			"wp_debug_display\t0",
			"script_debug\t1",
		].join("\n");
		expect(parseScheduleStatus(out)).toEqual({
			backupSchedule: "weekly",
			monitorEnabled: true,
			debugLog: true,
			debugDisplay: false,
			scriptDebug: true,
		});
	});

	it("defaults to off / disabled for unknown or missing values", () => {
		expect(parseScheduleStatus("backup_schedule\tbogus\n")).toEqual({
			backupSchedule: "off",
			monitorEnabled: false,
			debugLog: false,
			debugDisplay: false,
			scriptDebug: false,
		});
		expect(parseScheduleStatus("")).toEqual({
			backupSchedule: "off",
			monitorEnabled: false,
			debugLog: false,
			debugDisplay: false,
			scriptDebug: false,
		});
	});
});

describe("debugPatchToEnv", () => {
	it("maps only the supplied flags to 1/0 env values", () => {
		expect(debugPatchToEnv({ debugLog: true })).toEqual({ WP_DEBUG_LOG: "1" });
		expect(debugPatchToEnv({ debugDisplay: false, scriptDebug: true })).toEqual(
			{ WP_DEBUG_DISPLAY: "0", SCRIPT_DEBUG: "1" }
		);
	});

	it("returns an empty map when nothing is supplied", () => {
		expect(debugPatchToEnv({})).toEqual({});
	});
});
