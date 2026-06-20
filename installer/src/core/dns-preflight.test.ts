import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildDnsPreflightTask } from "./dns-preflight";

function command(state = defaultState()): string {
  return (buildDnsPreflightTask(state).command ?? []).join(" ");
}

describe("buildDnsPreflightTask", () => {
  test("checks the production domain", () => {
    const state = defaultState();
    state.productionDomain = "shop.example.test";
    state.wwwAlias = false;
    state.stagingEnabled = false;
    expect(command(state)).toContain("shop.example.test");
  });

  test("checks the www alias only when enabled", () => {
    const state = defaultState();
    state.productionDomain = "shop.example.test";
    state.stagingEnabled = false;
    state.wwwAlias = true;
    expect(command(state)).toContain("www.shop.example.test");
    state.wwwAlias = false;
    expect(command(state)).not.toContain("www.shop.example.test");
  });

  test("checks the staging domain only when staging is enabled", () => {
    const state = defaultState();
    state.productionDomain = "shop.example.test";
    state.stagingDomain = "stage.example.test";
    state.wwwAlias = false;
    state.stagingEnabled = true;
    expect(command(state)).toContain("stage.example.test");
    state.stagingEnabled = false;
    expect(command(state)).not.toContain("stage.example.test");
  });
});
