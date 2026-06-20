import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildInstallPlan } from "./install-plan";
import { applyLocalSandboxDefaults, createLocalSandboxHostFacts } from "./local-sandbox";
import { runPlan } from "./plan-runner";

describe("runPlan", () => {
  test("simulates commands for local sandbox plans even when apply is true", async () => {
    const state = applyLocalSandboxDefaults(defaultState(createLocalSandboxHostFacts()));
    const plan = buildInstallPlan(state);
    plan.tasks = [
      {
        command: ["sh", "-lc", "exit 99"],
        description: "A command that would fail if executed.",
        id: "dangerous-test",
        title: "Dangerous test command"
      }
    ];

    const results = await runPlan(plan, true);

    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("done");
    expect(results[0]?.output).toContain("Local sandbox: simulated task only.");
  });
});
