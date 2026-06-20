import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildHardenTask } from "./harden";
import { buildInstallPlan } from "./install-plan";

describe("buildHardenTask", () => {
  test("runs ./bin/harden when hardening is enabled", () => {
    const state = defaultState();
    state.hardenServer = true;
    const task = buildHardenTask(state);
    expect(task?.id).toBe("harden");
    expect(task?.privileged).toBe(true);
    expect((task?.command ?? []).join(" ")).toContain("./bin/harden");
  });

  test("is skipped when hardening is disabled", () => {
    const state = defaultState();
    state.hardenServer = false;
    expect(buildHardenTask(state)).toBeNull();
  });

  test("new-site plan ends with the harden task by default", () => {
    const state = defaultState();
    state.mode = "new-site";
    state.hardenServer = true;
    const ids = buildInstallPlan(state).tasks.map((t) => t.id);
    expect(ids).toContain("harden");
    expect(ids.at(-1)).toBe("harden");
  });
});
