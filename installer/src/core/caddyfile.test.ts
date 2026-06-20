import { describe, expect, test } from "bun:test";
import { renderCaddyfile } from "./caddyfile";
import { defaultState } from "./defaults";

describe("renderCaddyfile", () => {
  test("emits a production block proxying the loopback HTTP port", () => {
    const state = defaultState();
    state.productionDomain = "Shop.Example.test";
    state.productionHttpPort = "27001";
    state.stagingEnabled = false;
    const caddy = renderCaddyfile(state);
    expect(caddy).toContain("shop.example.test");
    expect(caddy).toContain("127.0.0.1:27001");
    expect(caddy).toContain("/healthz");
  });

  test("includes a staging block only when staging is enabled", () => {
    const state = defaultState();
    state.productionDomain = "shop.example.test";
    state.stagingDomain = "stage.example.test";
    state.stagingEnabled = false;
    expect(renderCaddyfile(state)).not.toContain("stage.example.test");
    state.stagingEnabled = true;
    expect(renderCaddyfile(state)).toContain("stage.example.test");
  });

  test("adds the www alias only when requested", () => {
    const state = defaultState();
    state.productionDomain = "shop.example.test";
    state.wwwAlias = true;
    expect(renderCaddyfile(state)).toContain("www.shop.example.test");
    state.wwwAlias = false;
    expect(renderCaddyfile(state)).not.toContain("www.shop.example.test");
  });
});
