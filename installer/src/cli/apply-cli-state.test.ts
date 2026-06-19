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

  test("--mode new-site clears an inherited site and derives a fresh install dir", () => {
    const base = defaultState();
    // Simulate host detection having pre-selected an existing site.
    base.selectedSiteDir = "/opt/vibe-wp";
    base.host = {
      ...base.host,
      existingSites: [
        {
          installDir: "/opt/vibe-wp",
          hasStaging: false,
          productionProject: "p",
          productionUrl: "https://live.com",
          stagingProject: null,
          stagingUrl: null
        }
      ]
    };
    const state = applyCliState(base, options({ mode: "new-site", domain: "fresh.com" }));
    expect(state.selectedSiteDir).toBe("");
    expect(state.installDir).not.toBe("/opt/vibe-wp");
  });

  test("leaves state untouched when flags are absent", () => {
    const base = defaultState();
    const before = base.productionDomain;
    const state = applyCliState(base, options({}));
    expect(state.productionDomain).toBe(before);
  });
});
