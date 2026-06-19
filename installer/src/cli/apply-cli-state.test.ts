import { describe, expect, test } from "bun:test";
import { defaultState } from "../core/defaults";
import type { InstallerOptions } from "../core/types";
import { applyCliState } from "./apply-cli-state";

function options(overrides: Partial<InstallerOptions>): InstallerOptions {
  return {
    ascii: false,
    compact: false,
    dryRun: false,
    headlessJson: false,
    help: false,
    installDir: "/opt/vibe-wp",
    local: false,
    noCaddy: false,
    noHostInstall: false,
    ref: "main",
    repo: "https://example.com/vibe-wp.git",
    version: false,
    yes: false,
    ...overrides
  };
}

describe("applyCliState", () => {
  test("derives slug, staging domain, and title from --domain", () => {
    const state = applyCliState(defaultState(), options({ domain: "shop.com" }));

    expect(state.productionDomain).toBe("shop.com");
    expect(state.siteSlug.length).toBeGreaterThan(0);
    expect(state.stagingDomain).toBe("stage.shop.com");
    expect(state.productionHttpPort.length).toBeGreaterThan(0);
  });

  test("explicit staging domain wins and enables staging", () => {
    const state = applyCliState(
      defaultState(),
      options({ domain: "shop.com", stagingDomain: "preview.shop.com" })
    );

    expect(state.stagingDomain).toBe("preview.shop.com");
    expect(state.stagingEnabled).toBe(true);
  });

  test("applies mode and admin email", () => {
    const state = applyCliState(
      defaultState(),
      options({ mode: "staging-only", adminEmail: "me@example.com" })
    );

    expect(state.mode).toBe("staging-only");
    expect(state.adminEmail).toBe("me@example.com");
  });

  test("leaves state untouched when flags are absent", () => {
    const base = defaultState();
    const before = base.productionDomain;
    const state = applyCliState(base, options({}));
    expect(state.productionDomain).toBe(before);
  });
});
