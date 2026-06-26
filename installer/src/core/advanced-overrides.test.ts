import { describe, expect, it } from "bun:test";
import { advancedOverrideWarnings } from "./advanced-overrides";
import { defaultState } from "./defaults";

describe("advancedOverrideWarnings", () => {
  it("is empty for the default safe path", () => {
    expect(advancedOverrideWarnings(defaultState())).toEqual([]);
  });

  it("covers every advanced override surfaced before execution", () => {
    const state = defaultState();
    state.dnsPreflightOverride = true;
    state.installDocker = false;
    state.installCaddy = false;
    state.wwwAlias = false;
    state.hardenServer = false;
    state.monitorEnabled = false;
    state.fullDelete = true;
    state.performanceCustom = true;
    state.performanceOverrides = { REDIS_MAXMEMORY: "2048mb" };

    expect(advancedOverrideWarnings(state).map((item) => item.id)).toEqual([
      "dns-preflight",
      "host-install",
      "caddy",
      "www-alias",
      "hardening",
      "monitoring",
      "full-delete",
      "performance"
    ]);
  });
});
