import { describe, expect, test } from "bun:test";
import { defaultState, emptyHostFacts } from "./defaults";
import { buildInstallPlan } from "./install-plan";

describe("buildInstallPlan modes", () => {
  test("update-existing refreshes in place without regenerating data", () => {
    const state = defaultState(emptyHostFacts());
    state.mode = "update-existing";
    state.selectedSiteDir = "/opt/vibe-wp";
    state.productionDomain = "wp.example.com";

    const plan = buildInstallPlan(state);
    const ids = plan.tasks.map((task) => task.id);

    expect(ids).toContain("checkout");
    expect(ids).toContain("prod-config");
    expect(ids).toContain("prod-up");
    expect(ids).toContain("prod-smoke");
    expect(ids).not.toContain("env-prod");
    expect(ids).not.toContain("prod-install");
    expect(ids).not.toContain("caddyfile");
    expect(plan.envFiles).toHaveLength(0);
    expect(plan.caddyfile).toBe("");
  });

  test("staging-only attaches staging without prod install", () => {
    const state = defaultState(emptyHostFacts());
    state.mode = "staging-only";
    state.selectedSiteDir = "/opt/vibe-wp";
    state.stagingEnabled = true;
    state.productionDomain = "wp.example.com";
    state.stagingDomain = "stage.example.com";

    const plan = buildInstallPlan(state);
    const ids = plan.tasks.map((task) => task.id);

    expect(ids).toContain("dns-preflight");
    expect(ids).toContain("stage-config");
    expect(ids).toContain("stage-up");
    expect(ids).not.toContain("prod-install");
    expect(ids).not.toContain("env-prod");
    expect(plan.envFiles).toHaveLength(1);
    expect(plan.envFiles[0]?.path).toBe("/opt/vibe-wp/env/stage.env");
  });

  test("update-existing checkout uses the selected site dir", () => {
    const state = defaultState(emptyHostFacts());
    state.mode = "update-existing";
    state.selectedSiteDir = "/opt/vibe-wp";

    const checkout = buildInstallPlan(state).tasks.find((task) => task.id === "checkout");
    expect(checkout?.command?.join(" ")).toContain("/opt/vibe-wp");
  });
});
