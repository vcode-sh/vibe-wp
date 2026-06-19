import { describe, expect, test } from "bun:test";
import { defaultState, emptyHostFacts } from "./defaults";
import { buildInstallPlan } from "./install-plan";

describe("buildInstallPlan", () => {
  test("runs DNS preflight before privileged host changes", () => {
    const state = defaultState({
      ...emptyHostFacts(),
      docker: null,
      caddy: null,
      publicIp: "203.0.113.10",
      sudo: true
    });
    state.productionDomain = "wp.example-host.com";
    state.stagingDomain = "stage.example-host.com";

    const plan = buildInstallPlan(state);

    expect(plan.tasks[0]?.id).toBe("dns-preflight");
    expect(plan.tasks[1]?.id).toBe("install-docker");
    expect(plan.tasks[0]?.command?.join(" ")).toContain("203.0.113.10");
  });
});
