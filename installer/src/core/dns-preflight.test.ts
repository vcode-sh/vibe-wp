import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import { buildDnsPreflightTask } from "./dns-preflight";
import type { InstallerState } from "./types";

function command(state = defaultState()): string {
  return (buildDnsPreflightTask(state).command ?? []).join(" ");
}

/**
 * Split the rendered command into its two loop bodies. The first `for domain in`
 * block is the REQUIRED (fatal) loop (`check_domain "$domain" 1`); the second is
 * the OPTIONAL (advisory) loop (`check_domain "$domain" 0`).
 */
function loops(state: InstallerState): { required: string; optional: string } {
  const parts = command(state).split("for domain in ");
  return { required: parts[1] ?? "", optional: parts[2] ?? "" };
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

  test("staging-only checks only the staging domain (prod is already live)", () => {
    const state = defaultState();
    state.mode = "staging-only";
    state.productionDomain = "shop.example.test";
    state.stagingDomain = "stage.example.test";
    state.stagingEnabled = true;
    const cmd = command(state);
    expect(cmd).toContain("stage.example.test");
    expect(cmd).not.toContain("shop.example.test");
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

  test("the production domain is the only HARD (fatal) requirement", () => {
    const state = defaultState();
    state.productionDomain = "shop.example.test";
    state.wwwAlias = true;
    state.stagingEnabled = false;
    const { required, optional } = loops(state);
    expect(required).toContain("shop.example.test");
    // www is advisory — it must NOT be in the fatal loop.
    expect(required).not.toContain("www.shop.example.test");
    expect(optional).toContain("www.shop.example.test");
  });

  test("a new site's www alias and staging domain are advisory (never fatal)", () => {
    const state = defaultState();
    state.productionDomain = "shop.example.test";
    state.stagingDomain = "stage.example.test";
    state.wwwAlias = true;
    state.stagingEnabled = true;
    const { required, optional } = loops(state);
    expect(optional).toContain("www.shop.example.test");
    expect(optional).toContain("stage.example.test");
    expect(required).not.toContain("stage.example.test");
  });

  test("staging-only treats the staging domain as the primary (required)", () => {
    const state = defaultState();
    state.mode = "staging-only";
    state.stagingDomain = "stage.example.test";
    state.stagingEnabled = true;
    const { required, optional } = loops(state);
    expect(required).toContain("stage.example.test");
    expect(optional).not.toContain("stage.example.test");
  });

  test("the override flag threads into the command (default off)", () => {
    const state = defaultState();
    expect(command(state)).toContain("override=0");
    state.dnsPreflightOverride = true;
    expect(command(state)).toContain("override=1");
  });
});
