import { describe, expect, test } from "bun:test";
import { defaultState } from "./defaults";
import type { InstallerState } from "./types";
import { validateDomain, validateEmail, validateState } from "./validation";

function existingSiteState(mode: InstallerState["mode"]): InstallerState {
  const state = defaultState();
  state.mode = mode;
  state.productionDomain = "shop.example.test";
  state.stagingDomain = "stage.example.test";
  return state;
}

describe("validateState existing-site modes", () => {
  test("update-existing requires a selected site", () => {
    const state = existingSiteState("update-existing");
    state.selectedSiteDir = "";
    expect(validateState(state)).toContain("Select an existing Vibe WP installation first.");
    state.selectedSiteDir = "/opt/vibe-wp-sites/shop";
    expect(validateState(state)).not.toContain("Select an existing Vibe WP installation first.");
  });

  test("staging-only requires a selected site and a distinct staging domain", () => {
    const state = existingSiteState("staging-only");
    state.selectedSiteDir = "";
    expect(validateState(state)).toContain("Select an existing Vibe WP installation first.");
    state.selectedSiteDir = "/opt/vibe-wp-sites/shop";
    state.stagingDomain = state.productionDomain;
    expect(validateState(state)).toContain("Staging domain must be different from production.");
  });
});

describe("validation", () => {
  test("blocks placeholder domains before execution", () => {
    expect(validateDomain("example.com")).toBe("Use a real domain with DNS pointing to this VPS.");
    expect(validateDomain("stage.example.com")).toBe(
      "Use a real domain with DNS pointing to this VPS."
    );
    expect(validateDomain("local.test")).toBe("Use a real domain with DNS pointing to this VPS.");
  });

  test("blocks placeholder admin email", () => {
    expect(validateEmail("admin@example.com")).toBe("Use a real mailbox, not example.com.");
  });
});
