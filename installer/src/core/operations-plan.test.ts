import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import {
  buildManageTasks,
  buildRemoveTasks,
  buildStagingOnlyTasks,
  buildUpdateTasks,
  skipCaddyForMode
} from "./operations-plan";
import type { InstallerState } from "./types";

function siteState(): InstallerState {
  const state = defaultState();
  state.selectedSiteDir = "/opt/vibe-wp-sites/shop";
  state.stagingEnabled = false;
  return state;
}

describe("buildManageTasks", () => {
  test("runs read-only diagnostics and adds staging smoke only when staging is on", () => {
    const ids = buildManageTasks(siteState()).map((t) => t.id);
    expect(ids).toEqual(["prod-ps", "prod-smoke", "prod-perf"]);
    const withStaging = siteState();
    withStaging.stagingEnabled = true;
    expect(buildManageTasks(withStaging).map((t) => t.id)).toContain("stage-smoke");
  });
});

describe("buildRemoveTasks", () => {
  test("backs up first, then stops prod and disables the Caddy route", () => {
    const ids = buildRemoveTasks(siteState()).map((t) => t.id);
    expect(ids[0]).toBe("pre-remove-backup");
    expect(ids).toContain("prod-down");
    expect(ids).toContain("disable-caddy-route");
    expect(ids).not.toContain("stage-down");
    const withStaging = siteState();
    withStaging.stagingEnabled = true;
    expect(buildRemoveTasks(withStaging).map((t) => t.id)).toContain("stage-down");
  });

  test("purge (full delete) drops volumes and deletes files", () => {
    const state = siteState();
    state.fullDelete = true;
    const tasks = buildRemoveTasks(state);
    const ids = tasks.map((t) => t.id);
    expect(ids).toContain("purge-files");
    const down = tasks.find((t) => t.id === "prod-down");
    expect((down?.command ?? []).join(" ")).toContain("down -v --remove-orphans");
    const purgeFiles = tasks.find((t) => t.id === "purge-files");
    expect((purgeFiles?.command ?? []).join(" ")).toContain("rm -rf");
  });

  test("default remove keeps volumes and files (no purge tasks)", () => {
    const ids = buildRemoveTasks(siteState()).map((t) => t.id);
    expect(ids).not.toContain("purge-files");
  });
});

describe("buildUpdateTasks", () => {
  test("checks out, reconfigures and restarts production in place", () => {
    const ids = buildUpdateTasks(siteState()).map((t) => t.id);
    expect(ids).toEqual(["checkout", "prod-config", "prod-up", "prod-smoke"]);
  });
});

describe("buildStagingOnlyTasks", () => {
  test("checks DNS, writes the staging route, then brings staging up", () => {
    const ids = buildStagingOnlyTasks(siteState()).map((t) => t.id);
    expect(ids).toEqual([
      "dns-preflight",
      "env-stage",
      "stage-config",
      "stage-caddyfile",
      "stage-up"
    ]);
  });
});

describe("skipCaddyForMode", () => {
  test("skips Caddy rewrite for non-prod-rewrite and staging-only modes", () => {
    expect(skipCaddyForMode("manage-existing")).toBe(true);
    expect(skipCaddyForMode("staging-only")).toBe(true);
    expect(skipCaddyForMode("new-site")).toBe(false);
    expect(skipCaddyForMode("external-services")).toBe(false);
  });
});
