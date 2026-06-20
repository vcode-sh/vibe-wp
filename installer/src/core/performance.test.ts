import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { productionEnvValues } from "./env-writer";
import { effectivePerformanceValues, sizingMemoryMb } from "./performance";
import type { InstallerState } from "./types";

function balancedState(): InstallerState {
  const state = defaultState();
  state.performancePreset = "balanced";
  state.host = { ...state.host, totalMemoryMb: 4096 };
  return state;
}

describe("effectivePerformanceValues", () => {
  test("returns the preset baseline when customization is off", () => {
    const state = balancedState();
    state.performanceCustom = false;
    state.performanceOverrides = { PHP_MEMORY_LIMIT: "999M" };
    // Override is ignored while custom mode is off.
    expect(effectivePerformanceValues(state).PHP_MEMORY_LIMIT).not.toBe("999M");
  });

  test("an override wins when customization is on", () => {
    const state = balancedState();
    state.performanceCustom = true;
    state.performanceOverrides = { PHP_FPM_PM_MAX_CHILDREN: "33" };
    expect(effectivePerformanceValues(state).PHP_FPM_PM_MAX_CHILDREN).toBe("33");
  });

  test("an empty override falls back to the preset value", () => {
    const state = balancedState();
    state.performanceCustom = true;
    const base = effectivePerformanceValues({
      ...state,
      performanceCustom: false
    }).PHP_MEMORY_LIMIT;
    state.performanceOverrides = { PHP_MEMORY_LIMIT: "   " };
    expect(effectivePerformanceValues(state).PHP_MEMORY_LIMIT).toBe(base);
  });

  test("an unknown override key is ignored", () => {
    const state = balancedState();
    state.performanceCustom = true;
    state.performanceOverrides = { NOT_A_REAL_KEY: "x" };
    expect("NOT_A_REAL_KEY" in effectivePerformanceValues(state)).toBe(false);
  });

  test("the memory override drives preset sizing (low memory clamps conservative)", () => {
    const state = balancedState();
    state.memoryOverrideMb = "1024";
    expect(sizingMemoryMb(state)).toBe(1024);
    // Below 1800 MB forces the conservative children count even at balanced.
    expect(effectivePerformanceValues(state).PHP_FPM_PM_MAX_CHILDREN).toBe("6");
  });

  test("lowering max_children clamps the spare/start servers so php-fpm stays valid", () => {
    const state = balancedState();
    state.host = { ...state.host, totalMemoryMb: 8192 }; // high-memory preset
    state.performancePreset = "high-memory";
    state.performanceCustom = true;
    state.performanceOverrides = { PHP_FPM_PM_MAX_CHILDREN: "11" };
    const v = effectivePerformanceValues(state);
    const maxChildren = Number(v.PHP_FPM_PM_MAX_CHILDREN);
    expect(maxChildren).toBe(11);
    // The invariant php-fpm enforces: spares and start cannot exceed max_children.
    expect(Number(v.PHP_FPM_PM_MAX_SPARE_SERVERS)).toBeLessThanOrEqual(maxChildren);
    expect(Number(v.PHP_FPM_PM_MIN_SPARE_SERVERS)).toBeLessThanOrEqual(
      Number(v.PHP_FPM_PM_MAX_SPARE_SERVERS)
    );
    expect(Number(v.PHP_FPM_PM_START_SERVERS)).toBeLessThanOrEqual(maxChildren);
    expect(Number(v.PHP_FPM_PM_START_SERVERS)).toBeGreaterThanOrEqual(
      Number(v.PHP_FPM_PM_MIN_SPARE_SERVERS)
    );
  });

  test("overrides flow through into the production env file", () => {
    const state = balancedState();
    state.performanceCustom = true;
    state.performanceOverrides = { REDIS_MAXMEMORY: "777mb" };
    expect(productionEnvValues(state).REDIS_MAXMEMORY).toBe("777mb");
  });
});
