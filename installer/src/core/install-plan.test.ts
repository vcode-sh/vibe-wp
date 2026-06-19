import { describe, expect, test } from "bun:test";
import { defaultState, emptyHostFacts } from "./defaults";
import { buildInstallPlan } from "./install-plan";
import { applyLocalSandboxDefaults, createLocalSandboxHostFacts } from "./local-sandbox";

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

  test("builds a safe local sandbox plan for macOS UI testing", () => {
    const state = applyLocalSandboxDefaults(defaultState(createLocalSandboxHostFacts()));
    const plan = buildInstallPlan(state);

    expect(plan.localSandbox).toBe(true);
    expect(plan.installDir).toContain("/.vibe-local/sites/");
    expect(plan.domains.production).toBe("demo.vibe.local");
    expect(plan.tasks.some((task) => task.id === "install-docker")).toBe(false);
    expect(plan.tasks.some((task) => task.id === "install-caddy")).toBe(false);
  });
});
